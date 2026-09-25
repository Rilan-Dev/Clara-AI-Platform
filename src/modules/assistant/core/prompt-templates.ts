/**
 * src/modules/assistant/core/prompt-templates.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * System-prompt templates for "Generate system prompt from knowledge base".
 * Client-safe (the picker renders it; the generator uses the guidance).
 *
 * A template decides the SHAPE of the prompt (role, audience, rules, safety,
 * escalation). The CONTENT always comes from the agent's own knowledge base,
 * so the same template serves any organisation. "auto" lets the model read
 * the knowledge base and pick the best template itself.
 */

export type PromptTemplateId =
  | "auto"
  | "customer_support"
  | "faq"
  | "organization_policy"
  | "clinical"
  | "product_sales"
  | "technical_docs"
  | "education"
  | "personal"
  | "financial_services";

export type PromptTemplate = {
  id: PromptTemplateId;
  label: string;
  description: string;
  /** What the generated prompt must cover for this kind of assistant. */
  guidance: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "auto",
    label: "Let AI decide",
    description: "Clara reads your knowledge base and picks the best style for it.",
    guidance: "",
  },
  {
    id: "customer_support",
    label: "Customer support",
    description: "Helps customers with products, services, orders, accounts and issues.",
    guidance:
      "A customer-support assistant for the organisation. Cover: who the customers are; what the assistant helps with (from the knowledge base); step-by-step guidance for common tasks; a calm, empathetic tone; asking one clarifying question when a request is unclear; never promising outcomes, refunds or timelines the knowledge base does not state; escalating to a human team for account-specific, sensitive or unresolved issues; privacy (never ask for passwords, OTPs or full card numbers).",
  },
  {
    id: "faq",
    label: "FAQ assistant",
    description: "Answers frequently asked questions quickly and accurately.",
    guidance:
      "A concise FAQ assistant. Cover: answering directly from the matching question and answer; keeping replies short and scannable; suggesting related questions the knowledge base covers; saying clearly when a question is not covered and pointing to what is.",
  },
  {
    id: "organization_policy",
    label: "Organisation policy / HR",
    description: "Explains internal policies, procedures, HR and compliance rules.",
    guidance:
      "An internal policy assistant for employees or members. Cover: explaining policies and procedures exactly as written; citing the relevant policy area; never giving legal advice or making exceptions; pointing to the responsible team (HR, compliance, IT) for approvals, disputes or personal cases; confidentiality of personal matters; neutral, professional tone.",
  },
  {
    id: "clinical",
    label: "Clinical / healthcare",
    description: "Shares healthcare or clinical information safely.",
    guidance:
      "A healthcare information assistant. Cover: sharing general, knowledge-base-grounded information only; never diagnosing, prescribing or replacing a clinician; telling the user to contact emergency services immediately for urgent symptoms; recommending a qualified professional for personal medical decisions; privacy of health information; clear, compassionate, plain-language tone.",
  },
  {
    id: "product_sales",
    label: "Product & sales",
    description: "Explains products and plans and helps visitors choose.",
    guidance:
      "A product and pre-sales assistant. Cover: explaining products, features and plans from the knowledge base; asking about the visitor's needs to recommend a fit; honest comparisons; never inventing prices, discounts or availability; guiding to the next step (sign-up, quote, contact sales); friendly, confident tone without pressure.",
  },
  {
    id: "technical_docs",
    label: "Technical documentation",
    description: "Guides developers or users through technical docs and setup.",
    guidance:
      "A technical documentation assistant. Cover: precise, step-by-step instructions; code or configuration examples only when they appear in the knowledge base; naming versions and prerequisites; troubleshooting by asking for error messages; linking steps together; clear, exact tone.",
  },
  {
    id: "education",
    label: "Education / training",
    description: "Teaches and explains course or training material.",
    guidance:
      "A tutor for the course or training material. Cover: explaining concepts simply and building up step by step; checking understanding with a short question; giving examples from the material; encouraging tone; not doing graded work for the learner; pointing to the relevant module or section.",
  },
  {
    id: "personal",
    label: "Personal assistant",
    description: "A personal knowledge assistant for one person's own notes and files.",
    guidance:
      "A personal knowledge assistant for the owner of the knowledge base. Cover: answering from the owner's own notes and documents; summarising and connecting information across them; a warm, direct tone; privacy of the owner's information; saying when something is not in their notes.",
  },
  {
    id: "financial_services",
    label: "Financial / insurance services",
    description: "Explains financial, banking or insurance products and processes.",
    guidance:
      "A financial or insurance services assistant. Cover: explaining products, coverage, claims or account processes from the knowledge base; never giving personalised financial, investment or legal advice; never quoting amounts, rates or outcomes that are not in the knowledge base; directing policy- or account-specific requests to the secure channel or a human; regulatory care and privacy; professional, reassuring tone.",
  },
];

export const CONCRETE_TEMPLATE_IDS = PROMPT_TEMPLATES.filter((t) => t.id !== "auto").map((t) => t.id);

export function findPromptTemplate(id: string | null | undefined): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((template) => template.id === id);
}
