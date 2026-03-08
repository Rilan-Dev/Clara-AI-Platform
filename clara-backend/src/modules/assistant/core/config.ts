const OUT_OF_SCOPE_REDIRECT =
  "If the conversation drifts away from this policy, acknowledge the request and guide the customer back to how you can help with this coverage.";

const LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  es: "Spanish",
  fr: "French",
  hi: "Hindi",
  ur: "Urdu",
};

export type LanguagePreferences = {
  assistant: string;
  customer: string[];
};

const LANGUAGE_DEFAULTS: LanguagePreferences = {
  assistant: "en",
  customer: ["en"],
};

const SUGGESTED_PROMPT_PRESETS = [
  "Walk me through the most important coverage benefits.",
  "What exclusions should the customer know before buying?",
  "How do I explain the claims process in simple terms?",
  "Which sections matter for premiums and billing?",
  "What guidance can I offer about renewals or cancellations?",
  "How can I reassure a customer who is comparing plans?",
] as const;

function createFallbackSummary(documentTitle?: string): string {
  const title = documentTitle?.trim();
  const readableTitle = title ? `"${title}"` : "this policy document";
  return [
    `Here is the distilled intent, coverage scope, and obligations described in ${readableTitle}.`,
    "Focus on the protections offered, clarify notable exclusions, outline the claims journey, and surface any unique benefits that help an advisor serve the customer.",
  ].join(" ");
}

const VOICE_SESSION_INSTRUCTIONS = [
  "You are Clara, a confident insurance support specialist speaking in real time.",
  "Use the knowledge you already have about the active policy plus any extra context you receive.",
  "Never mention documents, retrieval, or suggest you might lack information; respond like a well-briefed human advisor.",
  OUT_OF_SCOPE_REDIRECT,
  "Keep answers concise, friendly, and actionable.",
].join(" ");

const CHAT_SYSTEM_INSTRUCTIONS = [
  "You are Clara, an insurance knowledge assistant for a single policy.",
  "Answer using the supplied context and your retained understanding of the policy while sounding like a human advisor.",
  "Never mention documents, retrieval, or imply limited access to information.",
  OUT_OF_SCOPE_REDIRECT,
  "Keep replies warm, concise, and confidence-inspiring.",
].join(" ");

const ADAPT_PHRASE =
  "If the customer switches languages, mirror them briefly before guiding the conversation back to the preferred languages for clarity.";

function normaliseLanguageCode(code: string): string {
  return code.trim().toLowerCase();
}

export function describeLanguage(code: string): string {
  const normalised = normaliseLanguageCode(code);
  const label = LANGUAGE_LABELS[normalised];
  return label ? `${label} (${normalised})` : code;
}

function cleanLanguagePreferences(
  preferences: Partial<LanguagePreferences> | undefined,
): LanguagePreferences {
  const primary =
    preferences?.assistant && preferences.assistant.trim().length > 0
      ? normaliseLanguageCode(preferences.assistant)
      : LANGUAGE_DEFAULTS.assistant;

  const customerList =
    Array.isArray(preferences?.customer) && preferences?.customer?.length
      ? (preferences?.customer as string[])
      : LANGUAGE_DEFAULTS.customer;

  const cleaned = Array.from(
    new Set(
      customerList
        .map((code) => normaliseLanguageCode(code))
        .filter(Boolean),
    ),
  );

  const customer =
    cleaned.length > 0 ? cleaned : [LANGUAGE_DEFAULTS.assistant];

  return {
    assistant: primary,
    customer,
  };
}

export function resolveLanguagePreferences(
  preferences?: Partial<LanguagePreferences>,
): LanguagePreferences {
  return cleanLanguagePreferences(preferences);
}

export function buildLanguageGuidance(preferences: LanguagePreferences) {
  const { assistant, customer } = cleanLanguagePreferences(preferences);
  const priority = customer.filter((code) => code !== assistant);
  const primaryLabel = describeLanguage(assistant);
  const priorityLabels = priority.map(describeLanguage);

  const prioritySentence =
    priorityLabels.length > 0
      ? `Give priority to ${priorityLabels.join(", ")} when mirroring the customer's preference.`
      : "";

  const session = [
    `Default to ${primaryLabel}.`,
    prioritySentence,
    ADAPT_PHRASE,
  ]
    .filter(Boolean)
    .join(" ");

  const quick = [
    `Speak ${primaryLabel} unless the customer is actively using ${
      priorityLabels.length > 0 ? priorityLabels.join(", ") : "another language"
    }.`,
    ADAPT_PHRASE,
  ]
    .filter(Boolean)
    .join(" ");

  const follow = [
    `When expanding on an answer, continue in ${primaryLabel} unless the customer requests ${
      priorityLabels.length > 0 ? priorityLabels.join(", ") : "a different language"
    }.`,
    ADAPT_PHRASE,
  ]
    .filter(Boolean)
    .join(" ");

  const chat = [
    `Default to ${primaryLabel} for written responses.`,
    prioritySentence,
    ADAPT_PHRASE,
  ]
    .filter(Boolean)
    .join(" ");

  return { session, quick, follow, chat };
}

export const assistantPrompts = {
  /**
   * High-level conversational nudges that drive the assistant experience.
   * Update these exports to retune tone or focus without touching component code.
   */
  suggestedPrompts: SUGGESTED_PROMPT_PRESETS,

  createFallbackSummary,

  language: LANGUAGE_DEFAULTS,

  voice: {
    sessionInstructions: VOICE_SESSION_INSTRUCTIONS,
    quickResponseInstructions:
      "Answer immediately using the policy highlights you already know. Sound natural and helpful, and offer clear next steps if appropriate.",
    followUpInstructions:
      "Build on your earlier answer using these extra details. Invite the customer to explore the highlights further, and suggest practical next steps.",
    quickResponseContextLabel: "Key points already on hand:",
    followUpContextLabel: "Additional supporting detail:",
    outOfScopeRedirect: OUT_OF_SCOPE_REDIRECT,
  },

  chat: {
    systemInstructions: CHAT_SYSTEM_INSTRUCTIONS,
  },
} as const;
