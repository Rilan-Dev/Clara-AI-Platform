/**
 * src/modules/agents/core/models.ts
 * TypeScript types for agents and project-agent assignments.
 */

// ── Agent ─────────────────────────────────────────────────────────────────────

export type AgentStatus = "draft" | "published" | "archived";

export type Agent = {
  id: string;
  orgId: string;

  // Labelling & lifecycle
  name: string;
  description: string | null;
  status: AgentStatus;

  // Identity (customer-facing)
  assistantName: string;
  avatarUrl: string | null;

  // Behaviour
  systemPrompt: string;
  welcomeMessage: string;
  outOfScopeReply: string;
  rules: string[];

  // Language
  defaultLanguage: string;
  allowedLanguages: string[];
  alwaysRespondIn: string | null;

  // Voice
  voiceProvider: "openai" | "gemini" | null;
  voiceId: string | null;
  speed: number;

  // Model / generation
  chatModel: string | null;
  temperature: number;
  maxTokens: number;
  citeSources: boolean;
  strictMode: boolean;

  // Audit
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;

  // Joined fields (list views)
  orgName?: string | null;
  projectCount?: number;
};

export type AgentSummary = Pick<
  Agent,
  | "id" | "orgId" | "name" | "description" | "status" | "assistantName"
  | "avatarUrl" | "voiceProvider" | "voiceId" | "defaultLanguage"
  | "allowedLanguages" | "chatModel" | "orgName" | "projectCount"
  | "createdAt" | "updatedAt"
>;

export type CreateAgentInput = {
  orgId: string;
  name: string;
  description?: string;
  assistantName?: string;
  avatarUrl?: string;
  systemPrompt?: string;
  welcomeMessage?: string;
  outOfScopeReply?: string;
  rules?: string[];
  defaultLanguage?: string;
  allowedLanguages?: string[];
  alwaysRespondIn?: string;
  voiceId?: string;
  voiceSpeed?: number;
  createdBy?: string;
};

export type UpdateAgentInput = Partial<
  Omit<Agent, "id" | "orgId" | "createdBy" | "createdAt" | "updatedAt" | "orgName" | "projectCount">
>;

// ── Project ↔ Agent assignment ────────────────────────────────────────────────

export type ProjectAgentAssignment = {
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  orgId: string;
  isActive: boolean;
  assignedBy: string | null;
  assignedAt: string;
};

export type AssignAgentResult = {
  projectId: string;
  previousAgentId: string | null;
  agentId: string | null;
};
