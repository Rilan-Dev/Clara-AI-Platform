import { randomUUID } from "node:crypto";

type CookieValue = { name: string; value: string };

class RequestCookies {
  private readonly store = new Map<string, string>();

  constructor(cookieHeader: string | null) {
    for (const part of (cookieHeader ?? "").split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (!name) continue;
      this.store.set(name, rest.join("=") ?? "");
    }
  }

  get(name: string): CookieValue | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }
}

export class NextRequest extends Request {
  readonly nextUrl: URL;
  readonly cookies: RequestCookies;
  readonly ip?: string;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(this.url);
    this.cookies = new RequestCookies(this.headers.get("cookie"));
    this.ip = this.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  }
}

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  }

  static redirect(url: string | URL, init?: number | ResponseInit) {
    const responseInit = typeof init === "number" ? { status: init } : (init ?? {});
    return new NextResponse(null, {
      ...responseInit,
      status: responseInit.status ?? 307,
      headers: { Location: String(url), ...(responseInit.headers ?? {}) },
    });
  }

  static next(init?: ResponseInit & { request?: { headers?: Headers } }) {
    const headers = new Headers(init?.headers ?? {});
    if (init?.request?.headers) {
      init.request.headers.forEach((value, key) => headers.set(`x-forward-${key}`, value));
    }
    headers.set("x-nextjs-next", randomUUID());
    return new NextResponse(null, { ...init, status: init?.status ?? 200, headers });
  }
}
