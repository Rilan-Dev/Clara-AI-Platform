/**
 * Shared, fail-closed query filter parsing for platform-wide Q&A audit views.
 * An explicit invalid orgId/date must not be silently treated as "all".
 */
export class AuditFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditFilterError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL_RE = /^(?:0|[1-9]\d*)$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/;

export function parseAuditOrgId(params: URLSearchParams): string | null {
  const id = params.get("orgId");
  if (id === null) return null;
  if (!UUID_RE.test(id)) throw new AuditFilterError("orgId must be a valid organisation UUID.");
  return id;
}

function parseAuditDate(raw: string | null, fallback: Date, name: "from" | "to"): Date {
  if (raw === null) return fallback;
  if (!ISO_RE.test(raw)) throw new AuditFilterError(name + " must be an ISO 8601 date.");
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new AuditFilterError(name + " must be a valid ISO 8601 date.");
  }
  // JS Date normalizes impossible calendar dates, including timestamps.
  // Validate the calendar portion in UTC without confusing a valid timezone
  // offset with the resulting UTC date rollover.
  const calendarPart = raw.slice(0, 10);
  if (new Date(calendarPart + "T00:00:00Z").toISOString().slice(0, 10) !== calendarPart) {
    throw new AuditFilterError(name + " must be a valid calendar date.");
  }
  return date;
}

function auditNumber(raw: string | null, fallback: number, field: "limit" | "offset", minimum: number): number {
  if (raw === null) return fallback;
  if (!DECIMAL_RE.test(raw)) throw new AuditFilterError(field + " must be a nonnegative integer.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new AuditFilterError(field + " is out of range.");
  }
  return value;
}

type Options = { defaultLimit: number; maxLimit: number; withOffset: boolean };

export function parseAuditFilters(params: URLSearchParams, now: Date, options: Options): {
  fromDate: Date;
  toDate: Date;
  orgId: string | null;
  search: string;
  limit: number;
  offset: number;
} {
  const toDate = parseAuditDate(params.get("to"), now, "to");
  const fromDate = parseAuditDate(
    params.get("from"),
    new Date(now.getTime() - 7 * 86400 * 1000),
    "from",
  );
  if (fromDate.getTime() > toDate.getTime()) {
    throw new AuditFilterError("from cannot be later than to.");
  }
  const orgId = parseAuditOrgId(params);
  const search = (params.get("q") ?? "").trim().slice(0, 120);
  const limit = Math.min(options.maxLimit, auditNumber(params.get("limit"), options.defaultLimit, "limit", 1));
  const offset = options.withOffset ? auditNumber(params.get("offset"), 0, "offset", 0) : 0;
  return { fromDate, toDate, orgId, search, limit, offset };
}
