export type AIChartType = "area" | "bar" | "line" | "pie";
export type AIChartDatum = Record<string, string | number | null>;

export type AIChartSeries = {
  key: string;
  label: string;
  color: string;
};

export type ParsedAIChart = {
  type: AIChartType;
  title?: string;
  description?: string;
  xKey: string;
  data: AIChartDatum[];
  series: AIChartSeries[];
};

export type MarkdownChartSegment =
  | { type: "markdown"; content: string }
  | { type: "chart"; chart: ParsedAIChart };

const MAX_CHART_JSON_LENGTH = 24_000;
const MAX_CHART_ROWS = 80;
const MAX_CHART_COLUMNS = 12;
const MAX_CARTESIAN_SERIES = 5;

const DEFAULT_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#f97316",
  "#dc2626",
  "#9333ea",
  "#0f766e",
] as const;

const CURRENCY_TOKEN_PATTERN =
  "(?:sar|rs\\.?|riyals?|usd|aed|eur|gbp|inr|[$€£₹]|ر\\.?س\\.?)";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSafeKey(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const key = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  if (!key) return null;
  return /^[A-Za-z_]/.test(key) ? key : `value_${key}`;
}

function toShortText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, maxLength) : undefined;
}

function toDatumValue(value: unknown): string | number | null | undefined {
  if (value === null) return null;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const text = value.trim();
  if (!text) return "";

  const numericText = text.replace(/[$,%\s,]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(numericText)) {
    const numberValue = Number(numericText);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  const currencyNumberPattern = new RegExp(
    `^(?:${CURRENCY_TOKEN_PATTERN}\\s*)?-?\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${CURRENCY_TOKEN_PATTERN})?(?:\\s*\\([^)]*\\))?$`,
    "i",
  );
  if (currencyNumberPattern.test(text)) {
    const match = text.match(/-?\d[\d,]*(?:\.\d+)?/);
    const numberValue = match ? Number(match[0].replace(/,/g, "")) : Number.NaN;
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return text.slice(0, 120);
}

function normalizeChartType(value: unknown): AIChartType {
  if (typeof value !== "string") return "bar";

  switch (value.trim().toLowerCase()) {
    case "area":
      return "area";
    case "column":
    case "bar":
      return "bar";
    case "line":
      return "line";
    case "donut":
    case "doughnut":
    case "pie":
      return "pie";
    default:
      return "bar";
  }
}

function normalizeColor(value: unknown, index: number): string {
  if (typeof value === "string" && /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?([0-9A-Fa-f]{2})?$/.test(value.trim())) {
    return value.trim();
  }

  return DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

function prettifyKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeRows(input: unknown): AIChartDatum[] {
  if (!Array.isArray(input)) return [];

  const rows: AIChartDatum[] = [];

  for (const rawRow of input.slice(0, MAX_CHART_ROWS)) {
    if (!isRecord(rawRow)) continue;

    const row: AIChartDatum = {};

    for (const [rawKey, rawValue] of Object.entries(rawRow).slice(0, MAX_CHART_COLUMNS)) {
      const key = toSafeKey(rawKey);
      const value = toDatumValue(rawValue);

      if (!key || value === undefined) continue;
      row[key] = value;
    }

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

function hasNumericValue(rows: AIChartDatum[], key: string): boolean {
  return rows.some((row) => typeof row[key] === "number" && Number.isFinite(row[key]));
}

function inferXKey(rows: AIChartDatum[]): string | null {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (keys.length === 0) return null;

  const preferredKeys = ["label", "name", "category", "date", "month", "year", "period", "x"];
  const preferred = preferredKeys.find((key) => keys.includes(key));
  if (preferred) return preferred;

  const stringKey = keys.find((key) => rows.some((row) => typeof row[key] === "string"));
  return stringKey ?? keys[0] ?? null;
}

function normalizeSeries(
  input: Record<string, unknown>,
  rows: AIChartDatum[],
  xKey: string,
  type: AIChartType,
): AIChartSeries[] {
  const series: AIChartSeries[] = [];
  const seenKeys = new Set<string>();
  const maxSeries = type === "pie" ? 1 : MAX_CARTESIAN_SERIES;

  function addSeries(rawKey: unknown, rawLabel?: unknown, rawColor?: unknown) {
    if (series.length >= maxSeries) return;

    const key = toSafeKey(rawKey);
    if (!key || key === xKey || seenKeys.has(key) || !hasNumericValue(rows, key)) return;

    seenKeys.add(key);
    series.push({
      key,
      label: toShortText(rawLabel, 64) ?? prettifyKey(key),
      color: normalizeColor(rawColor, series.length),
    });
  }

  if (Array.isArray(input.series)) {
    for (const item of input.series) {
      if (typeof item === "string") {
        addSeries(item);
      } else if (isRecord(item)) {
        addSeries(item.key, item.label, item.color);
      }
    }
  }

  addSeries(input.yKey ?? input.valueKey, input.yLabel ?? input.valueLabel, input.color);

  if (series.length === 0) {
    const numericKeys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).filter(
      (key) => key !== xKey && hasNumericValue(rows, key),
    );

    for (const key of numericKeys) {
      addSeries(key);
    }
  }

  return series;
}

export function parseAIChartBlock(rawJson: string): ParsedAIChart | null {
  const json = rawJson.trim();
  if (!json || json.length > MAX_CHART_JSON_LENGTH) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;

  const data = normalizeRows(parsed.data ?? parsed.rows ?? parsed.values ?? parsed.items);
  if (data.length === 0) return null;

  const type = normalizeChartType(parsed.type);
  const xKey = toSafeKey(parsed.xKey ?? parsed.nameKey) ?? inferXKey(data);
  if (!xKey) return null;

  const series = normalizeSeries(parsed, data, xKey, type);
  if (series.length === 0) return null;

  return {
    type,
    title: toShortText(parsed.title, 90),
    description: toShortText(parsed.description, 180),
    xKey,
    data,
    series,
  };
}

export function splitAssistantChartBlocks(content: string): MarkdownChartSegment[] {
  const segments: MarkdownChartSegment[] = [];
  const chartFencePattern = /```(?:chart|ai-chart)(?:\s+json)?[^\S\r\n]*(?:\r?\n)?([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = chartFencePattern.exec(content)) !== null) {
    const chart = parseAIChartBlock(match[1] ?? "");

    if (!chart) {
      continue;
    }

    if (match.index > lastIndex) {
      segments.push({ type: "markdown", content: content.slice(lastIndex, match.index) });
    }

    segments.push({ type: "chart", chart });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "markdown", content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "markdown", content }];
}
