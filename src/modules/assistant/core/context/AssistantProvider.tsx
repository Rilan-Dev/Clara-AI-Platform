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

type QuotaWarningPayload = {
  limitKey: string;
  used: number;
  limit: number;
  pct: number;
};

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
  // ── WS-1.2: 80% soft quota warning (dismissible banner state) ──────────
  quotaWarning: QuotaWarningPayload | null;
  dismissQuotaWarning: () => void;
  // ── WS-1.5: streaming controls ─────────────────────────────────────────
  /** Abort the in-flight generation; the partial answer is kept, marked truncated. */
  stopGeneration: () => void;
  /** Re-run the last user prompt as a fresh (billed) turn. */
  regenerate: () => void;
  /** True when the last completed turn can be regenerated. */
  canRegenerate: boolean;
  // ── Chat persistence (DB-backed) ──────────────────────────────────────
  /** Conversation history for the active KB (most recently updated first). */
  sessions: ChatSessionSummary[];
  /** Currently restored session id, or null when a fresh (un-persisted) conversation is active. */
  activeSessionId: string | null;
  /** Restore a previous session's messages into the chat window. */
  loadSession: (sessionId: string) => Promise<void>;
  /** Start a fresh conversation (messages cleared; next message opens a new session). */
  newConversation: () => void;
  /** Delete a stored session. If it is the active one, starts a fresh conversation. */
  deleteSession: (sessionId: string) => Promise<void>;
};

export type ChatSessionSummary = {
  id: string;
  kbId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
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
  // WS-1.2: soft quota warning streamed by the quota middleware when a
  // request crosses 80% of the plan's daily limit. Dismissible.
  const [quotaWarning, setQuotaWarning] = useState<QuotaWarningPayload | null>(null);
  const dismissQuotaWarning = useCallback(() => setQuotaWarning(null), []);
  // WS-1.5: true when the USER pressed stop (vs an automatic abort from
  // sending a new message / switching context — those replace the turn).
  const userStoppedRef = useRef(false);
  const [documentOverviews, setDocumentOverviews] = useState<
    Record<string, DocumentOverviewModel>
  >({});
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    ...DEFAULT_SUGGESTED,
  ]);

  // ── Chat persistence state ───────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionIdState] = useState<string | null>(null);
  // Refs mirror the state so callbacks (sendPrompt, persist helpers) stay
  // dependency-stable — the same P6 pattern used for messagesRef.
  const activeSessionIdRef = useRef<string | null>(null);
  const sessionsRequestSeqRef = useRef(0);

  // messagesRef is declared here (before the persistence callbacks that read
  // it) and kept in sync with `messages` by the effect below.
  const messagesRef = useRef<AssistantMessageModel[]>([]);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
    setActiveSessionIdState(sessionId);
  }, []);

  // ── loadSession: restore a stored conversation into the chat window ───────
  const loadSession = useCallback(
    async (
      sessionId: string,
      opts?: { keepSessionList?: boolean; expectedKbId?: string; seq?: number },
    ) => {
      const seq = opts?.seq ?? ++sessionsRequestSeqRef.current;
      try {
        const res = await fetch(apiUrl(`/api/chat/sessions/${encodeURIComponent(sessionId)}`), {
          headers: withAuthHeaders({}),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          session?: ChatSessionSummary;
          messages?: { id: string; role: string; content: string; sources?: Source[] }[];
        };
        if (seq !== sessionsRequestSeqRef.current) return; // stale
        if (opts?.expectedKbId && activeKbIdRef.current !== opts.expectedKbId) return;
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;

        const restored = data.messages.map(
          (m) =>
            new AssistantMessageModel({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              sources: Array.isArray(m.sources) ? m.sources : [],
              isStreaming: false,
            }),
        );

        // Apply only when the live chat is still empty — never clobber an
        // in-flight or manually-started conversation.
        if (messagesRef.current.length > 0) return;

        setActiveSessionId(sessionId);
        setMessages(restored);
        if (!opts?.keepSessionList) {
          setSessions((prev) =>
            prev.some((s) => s.id === sessionId)
              ? prev
              : [...(data.session ? [data.session] : []), ...prev],
          );
        }
      } catch {
        // Best-effort: ignore restore failures.
      }
    },
    [setActiveSessionId],
  );

  // ── newConversation: start fresh (next message opens a new session) ───────
  const newConversation = useCallback(() => {
    sessionsRequestSeqRef.current++; // invalidate any in-flight restore
    setActiveSessionId(null);
    setMessages([]);
  }, [setActiveSessionId]);

  // ── deleteSession: remove a stored conversation ───────────────────────────
  const deleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(apiUrl(`/api/chat/sessions/${encodeURIComponent(sessionId)}`), {
          method: "DELETE",
          headers: withAuthHeaders({}),
        });
      } catch {
        // fall through — remove from local list regardless
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      if (activeSessionIdRef.current === sessionId) {
        newConversation();
      }
    },
    [newConversation],
  );

  // ── Chat persistence: fetch sessions + restore the latest conversation ────
  //
  // Called when a KB becomes active. Loads the user's session list for that
  // KB and, when the most recent session has messages, restores them so a
  // page refresh (or KB re-selection) continues exactly where the user left
  // off. Stale responses are discarded via a sequence guard.
  const loadSessionsForKb = useCallback(
    async (kbId: string) => {
      const seq = ++sessionsRequestSeqRef.current;
      try {
        const res = await fetch(apiUrl(`/api/chat/sessions?kbId=${encodeURIComponent(kbId)}`), {
          headers: withAuthHeaders({}),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { sessions?: ChatSessionSummary[] };
        if (seq !== sessionsRequestSeqRef.current) return; // stale — KB switched meanwhile
        const list = Array.isArray(data.sessions) ? data.sessions : [];
        setSessions(list);

        // Only auto-restore when the chat is still empty (nothing sent meanwhile).
        if (list.length > 0 && messagesRef.current.length === 0 && activeKbIdRef.current === kbId) {
          const latest = list[0];
          await loadSession(latest.id, { keepSessionList: true, expectedKbId: kbId, seq });
        }
      } catch {
        // Persistence is best-effort — chat works even when history is unavailable.
      }
    },
    [loadSession],
  );

  const setActiveKbId = useCallback((kbId: string | null) => {
    activeKbIdRef.current = kbId;
    setActiveKbIdState(kbId);
    // Switching KB clears messages AND suggestions.
    // FloatingAssistant will call setKbSuggestedPrompts with KB-specific ones.
    setMessages([]);
    setSuggestedPrompts([]);
    // Reset conversation persistence for the new context.
    setActiveSessionId(null);
    setSessions([]);
    sessionsRequestSeqRef.current++; // invalidate any in-flight restore
    if (kbId) {
      void loadSessionsForKb(kbId);
    }
  }, [loadSessionsForKb, setActiveSessionId]);

  const activeDocumentRef = useRef<KnowledgeDocumentModel | null>(null);
  const overviewRequestIdsRef = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // ── P6 FIX: messagesRef sync ──────────────────────────────────────────────
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
  // ── persistTurn: write a completed turn (user + assistant) to the DB ──────
  //
  // KB chat mode only. Creates the session lazily on the first turn so we
  // never store empty conversations. Persistence is best-effort: failures are
  // logged and never surface in the chat UI.
  const persistTurn = useCallback(
    async (args: {
      kbId: string;
      userMessage: AssistantMessageModel;
      assistantId: string;
      content: string;
      sources: Source[];
    }) => {
      try {
        let sessionId = activeSessionIdRef.current;

        // 1. Lazily create the session on the first persisted turn.
        if (!sessionId) {
          const res = await fetch(apiUrl("/api/chat/sessions"), {
            method: "POST",
            headers: withAuthHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              kbId: args.kbId,
              title: args.userMessage.content.slice(0, 60),
            }),
          });
          if (!res.ok) return;
          const data = (await res.json()) as { session?: ChatSessionSummary };
          if (!data.session) return;
          sessionId = data.session.id;

          // Adopt as the active session only if the user hasn't moved on
          // (new conversation / KB switch) while the turn was streaming.
          if (activeKbIdRef.current === args.kbId && activeSessionIdRef.current === null) {
            setActiveSessionId(sessionId);
            setSessions((prev) => [data.session!, ...prev]);
          }
        }

        // 2. Append the completed turn — both messages together.
        await fetch(apiUrl(`/api/chat/sessions/${encodeURIComponent(sessionId)}/messages`), {
          method: "POST",
          headers: withAuthHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            messages: [
              { id: args.userMessage.id, role: "user", content: args.userMessage.content },
              {
                id: args.assistantId,
                role: "assistant",
                content: args.content,
                sources: args.sources.map((s) => ({
                  id: s.id,
                  title: s.title,
                  snippet: s.snippet,
                  url: s.url,
                })),
              },
            ],
          }),
        });

        // 3. Keep the session list fresh (ordering + auto-title server-side).
        setSessions((prev) => {
          const now = new Date().toISOString();
          const next = prev.map((s) =>
            s.id === sessionId ? { ...s, updatedAt: now, title: s.title === "New conversation" ? args.userMessage.content.slice(0, 60) : s.title } : s,
          );
          next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
          return next;
        });
      } catch {
        console.warn("[AssistantProvider] chat persistence skipped (non-fatal)");
      }
    },
    [setActiveSessionId],
  );

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

      // ── Chat persistence trackers ─────────────────────────────────────────
      // Captured during streaming so the completed turn can be written to the
      // DB in the finally block without depending on re-render timing.
      let streamedContent = "";
      let streamedSources: Source[] = [];
      let skipPersistence = false;

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
          // Audit join key — lets the query log reference the conversation.
          sessionId: activeSessionIdRef.current ?? undefined,
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
                streamedSources = sources;
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
                streamedContent = `I encountered an error: ${event.payload}. Please try again or rephrase your question.`;
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
                  prev.map((m) => {
                    if (m.id === assistantId) {
                      // Capture the authoritative final content for persistence.
                      streamedContent = m.content;
                      return AssistantMessageModel.from(m).updateContent(
                        m.content,
                        false
                      );
                    }
                    return m;
                  })
                );
                break;

              case "document":
                break;

              // WS-1.2: 80% soft warning — surfaced as a dismissible banner.
              case "quota_warning":
                setQuotaWarning(event.payload);
                break;
            }
          },
          options
        );
      } catch (error) {
        if (!mountedRef.current) return;
        console.error("[AssistantProvider] stream error:", error);

        // Aborted turns (user sent a new message / switched away) must not be
        // persisted as "Request was cancelled" history entries. A USER stop
        // (WS-1.5) is different: the partial answer is kept, clearly labelled
        // as truncated, and persisted.
        const wasUserStop = userStoppedRef.current;
        if (error instanceof Error && error.name === "AbortError") {
          skipPersistence = !wasUserStop;
        }

        if (wasUserStop) {
          // Keep the partial answer, mark it truncated.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? AssistantMessageModel.from(m).withTruncated(true)
                : m
            )
          );
          streamedContent = ""; // partial already rendered; skip re-persist below
        } else {
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
          streamedContent = errorMessage;
        }
      } finally {
        // ── Chat persistence: write the completed turn (KB mode only) ────────
        // Non-fatal by design — see persistTurn.
        if (
          currentKbId &&
          !skipPersistence &&
          streamedContent.trim().length > 0
        ) {
          void persistTurn({
            kbId: currentKbId,
            userMessage,
            assistantId,
            content: streamedContent,
            sources: streamedSources,
          });
        }
        if (mountedRef.current) {
          setIsStreaming(false);
          abortControllerRef.current = null;
          userStoppedRef.current = false;
        }
      }
    },
    // P6 FIX: `messages`, `documentOverviews`, `suggestedPrompts` removed from
    // deps — all read via refs. sendPrompt is now stable for the lifetime of
    // a streaming session. Only props that genuinely change the function's
    // behaviour remain as deps.
    [isStreaming, languageConfig, endpointConfig, persistTurn]
  );

  const setKbSuggestedPrompts = useCallback((prompts: string[]) => {
    setSuggestedPrompts(prompts.length > 0 ? prompts : [...DEFAULT_SUGGESTED]);
  }, []);

  // ── WS-1.5: streaming controls ───────────────────────────────────────────
  /** User-facing stop: abort the provider stream; the partial answer is
   *  kept and labelled truncated (see the AbortError branch in sendPrompt). */
  const stopGeneration = useCallback(() => {
    userStoppedRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  /** Re-run the last user prompt as a fresh turn (billed as a new request). */
  const regenerate = useCallback(() => {
    if (isStreaming) return;
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const prompt = msgs[lastUserIdx].content;
    // Drop the previous user turn + everything after it, then re-send —
    // the fresh completion streams as a brand-new (billed) turn.
    setMessages(msgs.slice(0, lastUserIdx));
    void sendPrompt(prompt);
  }, [isStreaming, sendPrompt]);

  const canRegenerate =
    !isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === "assistant";

  const clearMessages = useCallback(() => {
    // Clearing the visible chat also detaches from the stored session, so the
    // next message opens a fresh conversation instead of appending to history.
    sessionsRequestSeqRef.current++;
    setActiveSessionId(null);
    setMessages([]);
  }, [setActiveSessionId]);

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
      quotaWarning,
      dismissQuotaWarning,
      stopGeneration,
      regenerate,
      canRegenerate,
      hasConversation: messages.length > 0,
      currentDocumentOverviews: documentOverviews,
      language: languageConfig,
      sessions,
      activeSessionId,
      loadSession,
      newConversation,
      deleteSession,
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
      quotaWarning,
      dismissQuotaWarning,
      stopGeneration,
      regenerate,
      canRegenerate,
      languageConfig,
      documentOverviews,
      setActiveDocumentWithReset,
      sessions,
      activeSessionId,
      loadSession,
      newConversation,
      deleteSession,
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
