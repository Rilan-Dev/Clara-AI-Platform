type CookieValue = { name: string; value: string };
type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  maxAge?: number;
  path?: string;
};

class RequestCookies {
  private readonly store = new Map<string, string>();

  constructor(cookieHeader: string | null) {
    for (const part of (cookieHeader ?? "").split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name) {
        this.store.set(name, rest.join("="));
      }
    }
  }

  get(name: string): CookieValue | undefined {
    const value = this.store.get(name);
    return value === undefined ? undefined : { name, value };
  }
}

class ResponseCookies {
  private readonly headers: Headers;

  constructor(headers: Headers) {
    this.headers = headers;
  }

  set(name: string, value: string, options: CookieOptions = {}) {
    const parts = [`${name}=${value}`];
    if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
    if (options.path) parts.push(`Path=${options.path}`);
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
    this.headers.append("Set-Cookie", parts.join("; "));
  }
}

export class NextRequest extends Request {
  readonly nextUrl: URL;
  readonly cookies: RequestCookies;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(this.url);
    this.cookies = new RequestCookies(this.headers.get("cookie"));
  }
}

export class NextResponse extends Response {
  readonly cookies: ResponseCookies;

  constructor(body?: BodyInit | null, init?: ResponseInit) {
    super(body, init);
    this.cookies = new ResponseCookies(this.headers);
  }

  static json(data: unknown, init?: ResponseInit) {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  }

  static redirect(url: string | URL, init?: number | ResponseInit) {
    const responseInit = typeof init === "number" ? { status: init } : (init ?? {});
    return new NextResponse(null, {
      ...responseInit,
      status: responseInit.status ?? 307,
      headers: {
        Location: String(url),
        ...(responseInit.headers ?? {}),
      },
    });
  }

  static next(init?: ResponseInit) {
    return new NextResponse(null, init);
  }
}
