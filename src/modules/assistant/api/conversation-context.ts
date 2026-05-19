type ConversationMessage = {
  role: string;
  content: string;
};

const MAX_CONTEXT_MESSAGES = 6;
const MAX_CONTEXT_CHARS = 4_800;
const MAX_SEARCH_QUERY_CHARS = 5_500;

const FOLLOW_UP_OR_VISUALIZATION_PATTERN =
  /\b(now|show|chart|graph|plot|visuali[sz]e|view|table|compare|comparison|variant|variants|those|these|that|them|above|previous|same|it|cost|costs|price|prices|course|courses)\b/i;

export const CHART_RESPONSE_INSTRUCTIONS = [
  "When the user asks for a chart, graph, trend, comparison, breakdown, or visualization, and the available answer includes real numeric data, render the visualization as a fenced code block with language `chart`.",
  "The chart block must contain strict JSON only, with no comments and no trailing commas.",
  'Use this shape: {"type":"bar|line|area|pie","title":"Short title","description":"Optional note","xKey":"label","series":[{"key":"value","label":"Value","color":"#2563eb"}],"data":[{"label":"Jan","value":12}]}',
  "Use stable snake_case keys, numeric values for every series, at most 80 rows, and at most 5 series.",
  "Never output a chart block that only has a title or description; every chart block must include non-empty data rows with numeric series values.",
  "For course, product, price, or cost comparisons, use a bar chart and include only items with actual numeric prices in the chart data; list unavailable prices separately in normal text if needed.",
  "If the user asks to visualize, chart, reformat, sort, compare, or summarize values already given earlier in this same conversation, use that prior sourced assistant answer as conversation context instead of replying out-of-scope.",
  "Do not create a chart when neither the knowledge-base context nor the prior sourced conversation contains enough numeric data; answer normally instead.",
].join(" ");

export function withChartInstructions(systemPrompt: string): string {
  return `${systemPrompt}\n\n${CHART_RESPONSE_INSTRUCTIONS}`;
}

function normalizeContent(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildRecentConversationContext(messages: ConversationMessage[]): string {
  const priorMessages = messages
    .slice(0, -1)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-MAX_CONTEXT_MESSAGES);

  if (priorMessages.length === 0) {
    return "";
  }

  return priorMessages
    .map((message) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      return `${role}: ${normalizeContent(message.content).slice(0, 1_200)}`;
    })
    .join("\n")
    .slice(-MAX_CONTEXT_CHARS);
}

export function buildConversationAwareSearchQuery(
  messages: ConversationMessage[],
  latestUserContent: string,
): string {
  const query = latestUserContent.trim();
  const recentConversation = buildRecentConversationContext(messages);

  if (!recentConversation) {
    return query;
  }

  if (!FOLLOW_UP_OR_VISUALIZATION_PATTERN.test(query) && query.length >= 80) {
    return query;
  }

  return [
    `Latest user request: ${query}`,
    "Use the recent conversation to resolve references like now, this, these, those, above, same, chart view, cost, price, course, or variants.",
    "Recent conversation:",
    recentConversation,
  ]
    .join("\n\n")
    .slice(0, MAX_SEARCH_QUERY_CHARS);
}
