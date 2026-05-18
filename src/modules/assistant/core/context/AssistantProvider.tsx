"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AssistantMessageModel,
  DocumentOverview,
  DocumentOverviewModel,
  KnowledgeDocument,
  KnowledgeDocumentModel,
  Source,
  StreamEvent,
} from "../models";
import {
  streamChatCompletion,
  type StreamChatOptions,
} from "@/modules/assistant/client/stream";
import {
  assistantPrompts,
  resolveLanguagePreferences,
  type LanguagePreferences,
} from "../config";
import { withAuthHeaders, getStoredToken } from "@/lib/client-auth";
import { apiUrl } from "@/lib/runtime";

// ── P5 FIX: Conversation window cap ───────────────────────────────────────────
//
// Old behaviour: `const history = [...messages, userMessage]` sent the ENTIRE
// message array to the API on every turn. In a 50-turn session this is 100
// messages of context, growing prompt size and latency linearly, eventually
// causing `context_length_exceeded` errors.
//
// Fix: only the last MAX_HISTORY_MESSAGES messages (10 user+assistant turns)
// are included in each request. The current user message is always included
// as the final element.
const MAX_HISTORY_MESSAGES = 20;

type AssistantContextValue = {
  documents: KnowledgeDocumentModel[];
  documentsLoading: boolean;
  documentsError: string | null;
  activeDocument: KnowledgeDocumentModel | null;
  setActiveDocument: (doc: KnowledgeDocumentModel | null) => void;
  // ── KB mode ─────────────────────────────────────────────────────────────────
  // When a KB is selected from the workspace KB selector, all chat + voice
  // calls use kbId instead of documentId. The legacy document mode still works.
  activeKbId: string | null;
  setActiveKbId: (kbId: string | null) => void;
  overviewFor: (id: string) => DocumentOverviewModel | undefined;
  messages: AssistantMessageModel[];
  isStreaming: boolean;
  suggestedPrompts: string[];
  /** Call this when switching to a KB so suggestions reflect that KB, not the old document. */
  setKbSuggestedPrompts: (prompts: string[]) => void;
  sendPrompt: (text: string) => Promise<void>;
  reloadDocuments: () => Promise<void>;
  clearMessages: () => void;
  hasConversation: boolean;
  currentDocumentOverviews: Record<string, DocumentOverviewModel>;
  language: LanguagePreferences;
};

type AssistantEndpoints = {
  documents: string;
  documentOverview: string;
  chat: string;
};

const DEFAULT_ENDPOINTS: AssistantEndpoints = {
  documents: apiUrl("/api/documents"),
  documentOverview: apiUrl("/api/documents/overview"),
  chat: apiUrl("/api/chat"),
};

export type AssistantProviderProps = {
  children: ReactNode;
  language?: Partial<LanguagePreferences>;
  endpoints?: Partial<AssistantEndpoints>;
};

// Generic fallback suggestions — neutral, not domain-specific.
// These are only shown when no KB or document is selected yet.
const DEFAULT_SUGGESTED = [
  "What are the key topics in this knowledge base?",
  "Give me a summary of the main information here.",
  "What questions can you help me answer?",
  "What should I know about this content?",
  "Walk me through the most important sections.",
  "What are the highlights I should be aware of?",
];

const AssistantContext = createContext<AssistantContextValue | null>(null);

function createRandomId(prefix: string): string {
  try {
    const crypto = globalThis.crypto;
    if (crypto && typeof crypto.randomUUID === "function") {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

class AssistantError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryable = true
  ) {
    super(message);
    this.name = "AssistantError";
  }
}

interface OverviewApiResponse {
  summary?: string;
  context?: string;
  highlights?: Array<{
    id?: string;
    title?: string;
    snippet?: string;
    url?: string;
  }>;
  suggestedQuestions?: string[];
  voiceIntro?: string;
}

interface DocumentsApiResponse {
  documents?: KnowledgeDocument[];
  error?: string;
}

export function AssistantProvider({
  children,
  endpoints,
  language,
}: AssistantProviderProps) {
  const languageConfig = useMemo<LanguagePreferences>(
    () => resolveLanguagePreferences(language),
    [language]
  );
  const endpointConfig = useMemo<AssistantEndpoints>(
    () => ({ ...DEFAULT_ENDPOINTS, ...(endpoints ?? {}) }),
    [endpoints]
  );

  const [documents, setDocuments] = useState<KnowledgeDocumentModel[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [activeDocument, setActiveDocument] =
    useState<KnowledgeDocumentModel | null>(null);
  const [activeKbId, setActiveKbIdState] = useState<string | null>(null);
  const activeKbIdRef = useRef<string | null>(null);

  // Declare messages + suggestedPrompts BEFORE setActiveKbId so the callback
  // can reference their setters without a "cannot access before init" error.
  const [messages, setMessages] = useState<AssistantMessageModel[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [documentOverviews, setDocumentOverviews] = useState<
    Record<string, DocumentOverviewModel>
  >({});
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    ...DEFAULT_SUGGESTED,
  ]);

  const setActiveKbId = useCallback((kbId: string | null) => {
    activeKbIdRef.current = kbId;
    setActiveKbIdState(kbId);
    // Switching KB clears messages AND suggestions.
    // FloatingAssistant will call setKbSuggestedPrompts with KB-specific ones.
    setMessages([]);
    setSuggestedPrompts([]);
  }, []);

  const activeDocumentRef = useRef<KnowledgeDocumentModel | null>(null);
  const overviewRequestIdsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ── P6 FIX: messagesRef ────────────────────────────────────────────────────
  //
  // Old behaviour: `messages` was listed in sendPrompt's useCallback dependency
  // array. Every streamed token calls setMessages(), which updates `messages`
  // state, which invalidates the sendPrompt callback, which invalidates the
  // useMemo context value, which re-renders every useAssistant() consumer.
  // During a 200-token stream this caused ~200 context invalidations per turn.
  //
  // Fix: keep messages state for rendering, but read the current value inside
  // sendPrompt via a ref. Removing `messages` from useCallback deps makes
  // sendPrompt stable across the entire stream.
  const messagesRef = useRef<AssistantMessageModel[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // documentOverviews ref — same pattern, avoids sendPrompt depending on it.
  const documentOverviewsRef = useRef<Record<string, DocumentOverviewModel>>({});
  useEffect(() => {
    documentOverviewsRef.current = documentOverviews;
  }, [documentOverviews]);

  // suggestedPrompts ref — same pattern.
  const suggestedPromptsRef = useRef<string[]>([...DEFAULT_SUGGESTED]);
  useEffect(() => {
    suggestedPromptsRef.current = suggestedPrompts;
  }, [suggestedPrompts]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    activeDocumentRef.current = activeDocument;
  }, [activeDocument]);

  const overviewFor = useCallback(
    (id: string) => documentOverviews[id],
    [documentOverviews]
  );

  const fetchDocumentOverview = useCallback(
    async (document: KnowledgeDocumentModel) => {
      if (!mountedRef.current) return;

      try {
        if (overviewRequestIdsRef.current.has(document.id)) return;
        overviewRequestIdsRef.current.add(document.id);

        const response = await fetch(endpointConfig.documentOverview, {
          method: "POST",
          headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ documentId: document.id }),
        });

        if (!response.ok) {
          throw new AssistantError(
            `Failed to load document overview: ${response.status}`,
            "OVERVIEW_FETCH_FAILED"
          );
        }

        const payload = (await response.json()) as OverviewApiResponse;

        const highlights: Source[] = Array.isArray(payload?.highlights)
          ? payload.highlights.map((h) => ({
              id: h.id || createRandomId("src"),
              title: h.title || "Policy Section",
              snippet: h.snippet || "",
              url: h.url,
            }))
          : [];

        const serverSummary =
          typeof payload?.summary === "string" ? payload.summary.trim() : "";
        const fallbackSummary =
          serverSummary || assistantPrompts.createFallbackSummary(document.title);

        const serverSuggestions: string[] = Array.isArray(
          payload?.suggestedQuestions
        )
          ? payload.suggestedQuestions
              .filter((s: unknown) => typeof s === "string" && s.trim())
              .slice(0, 6)
          : DEFAULT_SUGGESTED.slice(0, 6);

        const overview: DocumentOverview = {
          summary: fallbackSummary,
          context:
            typeof payload?.context === "string"
              ? payload.context
              : fallbackSummary,
          highlights,
          suggestedQuestions:
            serverSuggestions.length > 0
              ? serverSuggestions
              : Array.from(DEFAULT_SUGGESTED),
          voiceIntro:
            typeof payload?.voiceIntro === "string" && payload.voiceIntro.trim()
              ? payload.voiceIntro.trim()
              : `You're speaking with Clara AI Assistant about the "${document.title}" insurance policy. I can help explain coverage details, claims process, exclusions, and answer any questions about this policy.`,
        };

        const overviewModel = new DocumentOverviewModel(overview);

        if (mountedRef.current) {
          setDocumentOverviews((prev) => ({
            ...prev,
            [document.id]: overviewModel,
          }));
          // ── KB guard ────────────────────────────────────────────────────
          // If a KB is now active, do NOT overwrite its suggestions with
          // document suggestions from a background fetch that was in-flight
          // when the user switched to KB mode.
          if (
            !activeKbIdRef.current &&
            activeDocumentRef.current?.id === document.id
          ) {
            setSuggestedPrompts(overviewModel.suggestedQuestions);
          }
        }
      } catch (error) {
        console.error("[AssistantProvider] Failed to fetch document overview:", error);
        // Same KB guard as the success path — don't reset to doc defaults if a KB is active.
        if (
          mountedRef.current &&
          !activeKbIdRef.current &&
          activeDocumentRef.current?.id === document.id
        ) {
          setSuggestedPrompts([...DEFAULT_SUGGESTED]);
        }
      } finally {
        overviewRequestIdsRef.current.delete(document.id);
      }
    },
    [endpointConfig]
  );

  const setActiveDocumentWithReset = useCallback(
    (doc: KnowledgeDocumentModel | null) => {
      const next = doc ? KnowledgeDocumentModel.from(doc) : null;
      const previous = activeDocumentRef.current;
      const changed = (previous?.id ?? null) !== (next?.id ?? null);
      activeDocumentRef.current = next;
      setActiveDocument(next);
      if (changed) {
        setMessages([]);
        setSuggestedPrompts([...DEFAULT_SUGGESTED]);
        if (next) {
          // ── P8 FIX: use ref instead of state ──────────────────────────────
          //
          // Old: `documentOverviews` (state) was in this callback’s dep array.
          // Every new overview fetch completed → documentOverviews updated →
          // setActiveDocumentWithReset recreated → reloadDocuments recreated →
          // the effect re-fired reloadDocuments. With a KB selected the guard
          // returned early, but the churn still cleared context state and
          // caused stale-closure races.
          //
          // Fix: read from documentOverviewsRef (kept in sync by a useEffect)
          // so this callback never needs documentOverviews in its dep array.
          const cachedOverview = documentOverviewsRef.current[next.id];
          if (cachedOverview) {
            setSuggestedPrompts(cachedOverview.suggestedQuestions);
          } else {
            void fetchDocumentOverview(next);
          }
        }
      }
    },
    [fetchDocumentOverview] // documentOverviews removed — now read via ref
  );

  const reloadDocuments = useCallback(async () => {
    if (!mountedRef.current) return;
    setDocumentsLoading(true);
    setDocumentsError(null);

    try {
      const token = getStoredToken();
      if (!token) {
        if (mountedRef.current) setDocumentsLoading(false);
        return;
      }
      
      const response = await fetch(endpointConfig.documents, {
        cache: "no-store",
        headers: withAuthHeaders(),
      });
      if (response.status === 401) {
        if (mountedRef.current) {
          setDocuments([]);
        }
        return;
      }
      if (!response.ok) {
        throw new AssistantError(
          `Failed to load documents: ${response.status}`,
          "DOCUMENTS_FETCH_FAILED"
        );
      }

      const payload = (await response.json()) as DocumentsApiResponse;
      const docsCollection: KnowledgeDocument[] = Array.isArray(
        payload?.documents
      )
        ? payload.documents
        : [];
      const docModels = docsCollection.map((d) => new KnowledgeDocumentModel(d));

      if (mountedRef.current) {
        setDocuments(docModels);

        // ── KB mode guard ──────────────────────────────────────────────────
        // If a KB is already selected, do NOT auto-select a document.
        // Auto-selecting calls setActiveDocumentWithReset which resets messages,
        // suggestions, and overwrites the user's active KB selection.
        if (activeKbIdRef.current) return;

        const current = activeDocumentRef.current;
        const matching = current
          ? (docModels.find((d) => d.id === current.id) ?? null)
          : null;
        setActiveDocumentWithReset(matching ?? docModels[0] ?? null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      console.error("[AssistantProvider] Failed to load documents:", error);
      if (mountedRef.current) {
        setDocumentsError(
          error instanceof Error
            ? error.message
            : "Unable to load insurance policy documents. Please try again."
        );
      }
    } finally {
      if (mountedRef.current) setDocumentsLoading(false);
    }
  }, [endpointConfig, setActiveDocumentWithReset]);

  useEffect(() => {
    void reloadDocuments();
  }, [reloadDocuments]);

  useEffect(() => {
    // KB mode is active — document suggestions must NOT overwrite KB suggestions.
    // FloatingAssistant owns suggestion state when a KB is selected.
    if (activeKbId) return;

    if (!activeDocument) {
      setSuggestedPrompts([...DEFAULT_SUGGESTED]);
      return;
    }
    const overview = documentOverviews[activeDocument.id];
    if (overview) {
      setSuggestedPrompts(overview.suggestedQuestions);
    } else {
      void fetchDocumentOverview(activeDocument);
    }
  }, [activeKbId, activeDocument, documentOverviews, fetchDocumentOverview]);

  // ── P5 + P6 + P7 FIX: sendPrompt ──────────────────────────────────────────
  //
  // Three performance problems solved together:
  //
  // P5 — History was unbounded. Now capped at MAX_HISTORY_MESSAGES (20 = 10
  //      user+assistant turns). The current user message is always appended last.
  //
  // P6 — `messages` was in the useCallback dep array. Every token → setMessages
  //      → sendPrompt recreated → context value rebuilt → all consumers re-render.
  //      ~200 re-renders per turn. Fix: read from messagesRef inside the callback;
  //      remove `messages` from deps. sendPrompt is now stable across the stream.
  //
  // P7 — Related to P6: the context useMemo still has `messages` in deps (it must,
  //      for rendering), but because sendPrompt is now stable it is no longer the
  //      source of cascade re-renders. The only renders now are legitimate ones
  //      driven by actual token updates.
  const sendPrompt = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const currentKbId = activeKbIdRef.current;
      const currentDoc = activeDocumentRef.current;

      // Need either a KB or a legacy document to search against
      if (!trimmed || (!currentKbId && !currentDoc) || isStreaming) return;

      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      const userMessage = new AssistantMessageModel({
        id: createRandomId("msg"),
        role: "user",
        content: trimmed,
      });

      const assistantId = createRandomId("msg");
      const assistantPlaceholder = new AssistantMessageModel({
        id: assistantId,
        role: "assistant",
        content: "",
        sources: [],
        isStreaming: true,
      });

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);

      // P5 FIX: cap history window via ref (avoids the dependency problem).
      // P6 FIX: read from messagesRef.current — no `messages` in deps needed.
      const historyWindow = messagesRef.current.slice(-MAX_HISTORY_MESSAGES);
      const history = [...historyWindow, userMessage];

      // P6 FIX: read suggestions and overviews via refs, not state values.
      const suggestions =
        suggestedPromptsRef.current.length > 0
          ? suggestedPromptsRef.current
          : Array.from(DEFAULT_SUGGESTED);
      const overviewContext = currentDoc?.id ? documentOverviewsRef.current[currentDoc.id]?.context : undefined;

      try {
        const options: StreamChatOptions = {
          overview: overviewContext,
          suggestions,
          signal: abortControllerRef.current.signal,
          assistantLanguage: languageConfig.assistant,
          customerLanguages: languageConfig.customer,
          endpoint: endpointConfig.chat,
          // KB mode: pass kbId so the server uses KB-scoped RAG
          kbId: currentKbId ?? undefined,
        };

        await streamChatCompletion(
          currentKbId ?? currentDoc!.id,  // kbId takes priority, fallback to documentId
          history.map(({ role, content }) => ({ role, content })),
          (event: StreamEvent) => {
            if (!mountedRef.current) return;

            switch (event.type) {
              case "token":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? AssistantMessageModel.from(m).updateContent(
                          `${m.content}${event.payload}`,
                          true
                        )
                      : m
                  )
                );
                break;

              case "sources": {
                const sources: Source[] = event.payload.map(
                  (source: {
                    id?: string;
                    title?: string;
                    snippet?: string;
                    url?: string;
                  }) => ({
                    id: source.id || createRandomId("src"),
                    title: source.title || "Policy Reference",
                    snippet: source.snippet || "",
                    url: source.url,
                  })
                );
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? AssistantMessageModel.from(m).withSources(sources)
                      : m
                  )
                );
                break;
              }

              case "error":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? new AssistantMessageModel({
                          id: m.id,
                          role: m.role,
                          content: `I encountered an error: ${event.payload}. Please try again or rephrase your question.`,
                          sources: m.sources?.map((s) => ({
                            id: s.id,
                            title: s.title,
                            snippet: s.snippet,
                            url: s.url,
                          })),
                          isStreaming: false,
                        })
                      : m
                  )
                );
                break;

              case "done":
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? AssistantMessageModel.from(m).updateContent(
                          m.content,
                          false
                        )
                      : m
                  )
                );
                break;

              case "document":
                break;
            }
          },
          options
        );
      } catch (error) {
        if (!mountedRef.current) return;
        console.error("[AssistantProvider] stream error:", error);

        const errorMessage =
          error instanceof AssistantError
            ? error.message
            : error instanceof Error && error.name === "AbortError"
            ? "Request was cancelled"
            : "I'm having trouble connecting right now. Please check your internet connection and try again.";

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? new AssistantMessageModel({
                  id: m.id,
                  role: m.role,
                  content: errorMessage,
                  sources: m.sources?.map((s) => ({
                    id: s.id,
                    title: s.title,
                    snippet: s.snippet,
                    url: s.url,
                  })),
                  isStreaming: false,
                })
              : m
          )
        );
      } finally {
        if (mountedRef.current) {
          setIsStreaming(false);
          abortControllerRef.current = null;
        }
      }
    },
    // P6 FIX: `messages`, `documentOverviews`, `suggestedPrompts` removed from
    // deps — all read via refs. sendPrompt is now stable for the lifetime of
    // a streaming session. Only props that genuinely change the function's
    // behaviour remain as deps.
    [isStreaming, languageConfig, endpointConfig]
  );

  const setKbSuggestedPrompts = useCallback((prompts: string[]) => {
    setSuggestedPrompts(prompts.length > 0 ? prompts : [...DEFAULT_SUGGESTED]);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({
      documents,
      documentsLoading,
      documentsError,
      activeDocument,
      setActiveDocument: setActiveDocumentWithReset,
      activeKbId,
      setActiveKbId,
      overviewFor,
      messages,
      isStreaming,
      suggestedPrompts,
      setKbSuggestedPrompts,
      sendPrompt,
      reloadDocuments,
      clearMessages,
      hasConversation: messages.length > 0,
      currentDocumentOverviews: documentOverviews,
      language: languageConfig,
    }),
    [
      documents,
      documentsLoading,
      documentsError,
      activeDocument,
      activeKbId,
      setActiveKbId,
      messages,
      isStreaming,
      suggestedPrompts,
      setKbSuggestedPrompts,
      overviewFor,
      sendPrompt,
      reloadDocuments,
      clearMessages,
      languageConfig,
      documentOverviews,
      setActiveDocumentWithReset,
    ]
  );

  return (
    <AssistantContext.Provider value={value}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx)
    throw new Error("useAssistant must be used within AssistantProvider");
  return ctx;
}

export const useAssistantContext = useAssistant;
