// ─────────────────────────────────────────────────────────────────────────────
// @clara/types — Shared TypeScript types across all Clara Suite apps
// ─────────────────────────────────────────────────────────────────────────────

// ── Subscription Plans ────────────────────────────────────────────────────────

export type PlanId = "free" | "starter" | "pro" | "enterprise";

export type SubscriptionPlan = {
  id: PlanId;
  name: string;
  description: string;
  price: number; // USD/month, 0 = free
  limits: PlanLimits;
  features: string[];
};

export type PlanLimits = {
  maxKbs: number;          // -1 = unlimited
  maxDocumentsPerKb: number;
  maxRequestsPerDay: number;
  maxStorageMb: number;
  maxIntegrations: number; // -1 = unlimited
  voiceEnabled: boolean;
  analyticsLevel: "basic" | "full" | "advanced" | "custom";
  apiAccessEnabled: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
  ssoEnabled: boolean;
};

export const PLANS: Record<PlanId, SubscriptionPlan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Get started with Clara AI at no cost",
    price: 0,
    limits: {
      maxKbs: 1,
      maxDocumentsPerKb: 10,
      maxRequestsPerDay: 100,
      maxStorageMb: 100,
      maxIntegrations: 0,
      voiceEnabled: false,
      analyticsLevel: "basic",
      apiAccessEnabled: false,
      customBranding: false,
      prioritySupport: false,
      ssoEnabled: false,
    },
    features: ["1 Knowledge Base", "10 documents", "100 requests/day", "Text chat only", "Basic analytics"],
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "Perfect for small teams getting started with AI",
    price: 49,
    limits: {
      maxKbs: 3,
      maxDocumentsPerKb: 50,
      maxRequestsPerDay: 1000,
      maxStorageMb: 1000,
      maxIntegrations: 3,
      voiceEnabled: true,
      analyticsLevel: "full",
      apiAccessEnabled: true,
      customBranding: false,
      prioritySupport: false,
      ssoEnabled: false,
    },
    features: ["3 Knowledge Bases", "50 docs per KB", "1,000 requests/day", "Voice assistant", "Full analytics", "API access", "Email support"],
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For growing businesses with advanced AI needs",
    price: 149,
    limits: {
      maxKbs: 10,
      maxDocumentsPerKb: 200,
      maxRequestsPerDay: 10000,
      maxStorageMb: 10000,
      maxIntegrations: 10,
      voiceEnabled: true,
      analyticsLevel: "advanced",
      apiAccessEnabled: true,
      customBranding: true,
      prioritySupport: true,
      ssoEnabled: false,
    },
    features: ["10 Knowledge Bases", "200 docs per KB", "10,000 requests/day", "Voice + realtime", "Advanced analytics", "Custom branding", "Priority support", "Webhook integrations"],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Unlimited power for large organizations",
    price: -1, // Custom pricing
    limits: {
      maxKbs: -1,
      maxDocumentsPerKb: -1,
      maxRequestsPerDay: -1,
      maxStorageMb: -1,
      maxIntegrations: -1,
      voiceEnabled: true,
      analyticsLevel: "custom",
      apiAccessEnabled: true,
      customBranding: true,
      prioritySupport: true,
      ssoEnabled: true,
    },
    features: ["Unlimited KBs", "Unlimited documents", "Unlimited requests", "SSO / SAML", "Custom LLM", "SLA guarantee", "Dedicated support", "On-premise option"],
  },
};

// ── Organisation types ────────────────────────────────────────────────────────

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgWithSubscription = Organisation & {
  subscription: OrgSubscription | null;
  projectCount: number;
  kbCount: number;
  userCount: number;
};

export type OrgSubscription = {
  id: string;
  orgId: string;
  planId: PlanId;
  status: "active" | "trialing" | "past_due" | "canceled";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
};

// ── Project types ─────────────────────────────────────────────────────────────

export type Project = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Knowledge Base types ──────────────────────────────────────────────────────

export type KnowledgeBase = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  qdrantCollection: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type KbWithStats = KnowledgeBase & {
  docCount: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  totalChunks: number;
  assistant: AssistantConfig | null;
};

// ── Assistant Config types ────────────────────────────────────────────────────

export type AssistantConfig = {
  id: string;
  kbId: string;
  assistantName: string;
  avatarUrl: string | null;
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;
  voiceId: string;
  speed: number;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;
  primaryColour: string;
  accentColour: string;
  createdAt: string;
  updatedAt: string;
};

// ── Document types ────────────────────────────────────────────────────────────

export type Document = {
  id: string;
  kbId: string;
  title: string;
  originalFilename: string;
  sourceType: "upload" | "url" | "api";
  mimeType: string | null;
  fileSize: number | null;
  chunkCount: number | null;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── API Key types ─────────────────────────────────────────────────────────────

export type ApiKey = {
  id: string;
  kbId: string;
  orgId: string;
  name: string;
  keyPrefix: string;
  allowedOrigins: string[];
  isActive: boolean;
  rateLimitPerHour: number;
  lastUsedAt: string | null;
  createdAt: string;
  usage?: {
    thisHour: number;
    totalLast24h: number;
    totalLast7d: number;
  };
};

// ── Analytics types ───────────────────────────────────────────────────────────

export type KbAnalytics = {
  totalQueries: number;
  queriesThisWeek: number;
  averageLatencyMs: number;
  averageSources: number;
  dailyBreakdown: Array<{ date: string; count: number }>;
  topQueries: Array<{ text: string; count: number }>;
};

// ── User types ────────────────────────────────────────────────────────────────

export type User = {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  status: "active" | "suspended" | "pending_verification";
  emailVerified: boolean;
  isSuperAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type OrgMember = {
  id: string;
  orgId: string;
  userId: string;
  roleId: string;
  joinedAt: string;
  user: User;
  roleName: string;
};

// ── Auth types ────────────────────────────────────────────────────────────────

export type AuthSession = {
  user: User;
  token: string;
  expiresAt: string;
};

// ── API response wrappers ─────────────────────────────────────────────────────

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; status: number };

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
};
