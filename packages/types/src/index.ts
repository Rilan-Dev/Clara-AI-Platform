export interface ApiResponse<T> {
  success?: boolean;
  data: T;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  status: string;
  qdrantCollection: string;
  project: { id: string; name: string };
  org: { id: string; name: string };
  assistant: {
    name: string;
    avatarUrl: string | null;
    welcomeMessage: string;
    primaryColour: string;
    accentColour: string;
  };
  docCount: number;
  readyCount: number;
}

export interface DocumentRecord {
  id: string;
  kbId: string;
  title: string;
  originalFilename: string;
  mimeType: string | null;
  fileSize: number;
  chunkCount: number;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantConfig {
  id: string;
  kbId: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  defaultLanguage: string;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  primaryColour: string;
  accentColour: string;
  voiceId: string | null;
  speed: number;
}

export interface Subscription {
  id: string;
  org_id: string;
  plan_id: string;
  status: string;
  max_kbs: number;
  max_docs_per_kb: number;
  max_req_day: number;
  voice_enabled: boolean;
  api_access: boolean;
  features: string[];
}

export interface OrgUsage {
  kb_count: number;
  requests_today: number;
  storage_bytes: number;
}

export interface AnalyticsData {
  total: number;
  daily: { date: string; count: number }[];
  avg_latency: number | null;
  top_queries: { query: string; count: number }[];
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  token?: string;
  user?: {
    id: string;
    email: string;
    fullName?: string;
  };
}
