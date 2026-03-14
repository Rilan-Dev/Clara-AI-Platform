type CspReportPayload = {
  "csp-report"?: Record<string, unknown>;
  report?: Record<string, unknown>;
} & Record<string, unknown>;

function extractReport(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const report = payload as CspReportPayload;
  if (report["csp-report"] && typeof report["csp-report"] === "object") {
    return report["csp-report"] as Record<string, unknown>;
  }
  if (report.report && typeof report.report === "object") {
    return report.report as Record<string, unknown>;
  }
  return report as Record<string, unknown>;
}

function logReport(report: Record<string, unknown> | null): void {
  if (!report) return;
  const blockedUri = report["blocked-uri"] ?? report["blockedURI"];
  const directive = report["effective-directive"] ?? report["violated-directive"];
  const sourceFile = report["source-file"] ?? report["sourceFile"];
  const lineNumber = report["line-number"] ?? report["lineNumber"];
  const columnNumber = report["column-number"] ?? report["columnNumber"];
  const statusCode = report["status-code"] ?? report["statusCode"];

  console.warn(
    "[csp-report]",
    JSON.stringify({
      blockedUri,
      directive,
      sourceFile,
      lineNumber,
      columnNumber,
      statusCode,
    }),
  );
}

export async function POST(request: Request) {
  let payload: unknown = null;

  try {
    payload = await request.json();
  } catch {
    const text = await request.text().catch(() => "");
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { raw: text };
      }
    }
  }

  logReport(extractReport(payload));

  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
