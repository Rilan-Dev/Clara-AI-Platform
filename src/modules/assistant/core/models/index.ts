export type MessageRole = "user" | "assistant";

export interface Source {
  id: string;
  title: string;
  snippet: string;
  url?: string;
}

export class SourceModel implements Source {
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly url?: string;

  constructor(source: Source) {
    this.id = source.id;
    this.title = source.title;
    this.snippet = source.snippet;
    this.url = source.url;
  }

  static from(source: Source | SourceModel | undefined | null): SourceModel | null {
    if (!source) return null;
    return source instanceof SourceModel ? source : new SourceModel(source);
  }
}

export interface DocumentOverview {
  summary: string;
  context: string;
  highlights: Source[];
  suggestedQuestions: string[];
  voiceIntro: string;
}

export class DocumentOverviewModel implements DocumentOverview {
  summary: string;
  context: string;
  highlights: SourceModel[];
  suggestedQuestions: string[];
  voiceIntro: string;

  constructor(overview: DocumentOverview) {
    this.summary = overview.summary;
    this.context = overview.context;
    this.highlights = (overview.highlights ?? []).map((highlight) =>
      SourceModel.from(highlight)!
    );
    this.suggestedQuestions = [...(overview.suggestedQuestions ?? [])];
    this.voiceIntro = overview.voiceIntro;
  }

  static from(overview: DocumentOverview | DocumentOverviewModel | null | undefined): DocumentOverviewModel | null {
    if (!overview) return null;
    return overview instanceof DocumentOverviewModel ? overview : new DocumentOverviewModel(overview);
  }
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  collectionName: string;
  sourceType: string;
  sourceUrl?: string;
  originalFilename?: string;
  createdAt: string;
  updatedAt: string;
}

export class KnowledgeDocumentModel implements KnowledgeDocument {
  readonly id: string;
  readonly title: string;
  readonly collectionName: string;
  readonly sourceType: string;
  readonly sourceUrl?: string;
  readonly originalFilename?: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  constructor(document: KnowledgeDocument) {
    this.id = document.id;
    this.title = document.title;
    this.collectionName = document.collectionName;
    this.sourceType = document.sourceType;
    this.sourceUrl = document.sourceUrl;
    this.originalFilename = document.originalFilename;
    this.createdAt = document.createdAt;
    this.updatedAt = document.updatedAt;
  }

  static from(document: KnowledgeDocument | KnowledgeDocumentModel | null | undefined): KnowledgeDocumentModel | null {
    if (!document) return null;
    return document instanceof KnowledgeDocumentModel ? document : new KnowledgeDocumentModel(document);
  }
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: Source[];
  isStreaming?: boolean;
  /** WS-1.5: true when the user stopped generation — partial answer kept. */
  isTruncated?: boolean;
}

export class AssistantMessageModel implements Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: SourceModel[];
  isStreaming?: boolean;
  isTruncated?: boolean;

  constructor(message: Message | AssistantMessageModel) {
    this.id = message.id;
    this.role = message.role;
    this.content = message.content;
    const rawSources =
      message instanceof AssistantMessageModel
        ? message.sources?.map((source) => source)
        : message.sources?.map((source) => SourceModel.from(source)!);
    this.sources = rawSources?.map((source) => SourceModel.from(source)!);
    this.isStreaming = message.isStreaming ?? false;
    this.isTruncated = message.isTruncated ?? false;
  }

  updateContent(content: string, isStreaming = this.isStreaming): AssistantMessageModel {
    return new AssistantMessageModel({
      id: this.id,
      role: this.role,
      content,
      sources: this.sources?.map((source) => ({
        id: source.id,
        title: source.title,
        snippet: source.snippet,
        url: source.url,
      })),
      isStreaming,
      isTruncated: this.isTruncated,
    });
  }

  /** WS-1.5: mark a stopped stream — the partial answer is kept and labelled. */
  withTruncated(isTruncated: boolean): AssistantMessageModel {
    return new AssistantMessageModel({
      id: this.id,
      role: this.role,
      content: this.content,
      sources: this.sources?.map((source) => ({
        id: source.id,
        title: source.title,
        snippet: source.snippet,
        url: source.url,
      })),
      isStreaming: false,
      isTruncated,
    });
  }

  withSources(sources: Source[]): AssistantMessageModel {
    return new AssistantMessageModel({
      id: this.id,
      role: this.role,
      content: this.content,
      sources,
      isStreaming: this.isStreaming,
    });
  }

  static from(message: Message | AssistantMessageModel): AssistantMessageModel {
    return message instanceof AssistantMessageModel ? message : new AssistantMessageModel(message);
  }
}

export type StreamEvent =
  | { type: "document"; payload: { id: string; title: string } }
  | { type: "sources"; payload: Source[] }
  | { type: "token"; payload: string }
  | { type: "done" }
  | { type: "error"; payload: string }
  | { type: "quota_warning"; payload: { limitKey: string; used: number; limit: number; pct: number } };

type StreamEventWithPayload = Extract<StreamEvent, { payload: unknown }>;

export class StreamEventEnvelope {
  readonly type: StreamEvent["type"];
  readonly payload?: StreamEventWithPayload["payload"];

  constructor(event: StreamEvent) {
    this.type = event.type;
    switch (event.type) {
      case "token":
      case "error":
      case "sources":
      case "document":
      case "quota_warning":
        this.payload = event.payload;
        break;
      default:
        break;
    }
  }

  static from(event: StreamEvent | StreamEventEnvelope): StreamEventEnvelope {
    return event instanceof StreamEventEnvelope ? event : new StreamEventEnvelope(event);
  }
}
