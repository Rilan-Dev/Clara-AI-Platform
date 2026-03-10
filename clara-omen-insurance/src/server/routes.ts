import type { Express, Request, Response, RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { NextRequest, NextResponse } from "@/server/next-shim";

import * as authLoginRoute from "@/app/api/auth/login/route";
import * as authLogoutRoute from "@/app/api/auth/logout/route";

type RouteModule = {
  GET?: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
  POST?: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
  DELETE?: (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
};

function wrap(
  mod: RouteModule,
  method: "GET" | "POST" | "DELETE",
): RequestHandler {
  return async (req: Request, res: Response) => {
    const handler = mod[method];
    if (!handler) {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    try {
      const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === "string") headers.set(k, v);
        else if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
      }
      const hasBody = method !== "GET" && req.body;
      const body = hasBody
        ? Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
            ? req.body
            : JSON.stringify(req.body)
        : undefined;
      const nextReq = new NextRequest(url, { method, headers, body });
      const nextRes = await handler(nextReq, { params: Promise.resolve({}) });
      res.status(nextRes.status);
      nextRes.headers.forEach((value: string, key: string) => res.setHeader(key, value));
      const text = await nextRes.text();
      res.send(text);
    } catch (err) {
      console.error("[routes] handler error", err);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

export function registerRoutes(
  app: Express,
  opts: { backendUrl: string; cookieName: string },
) {
  const { backendUrl, cookieName } = opts;

  // ── Auth routes ─────────────────────────────────────────────────────────
  app.post("/api/auth/login", wrap(authLoginRoute, "POST"));
  app.post("/api/auth/logout", wrap(authLogoutRoute, "POST"));

  // ── Proxy /api/proxy/* → backend /api/* ─────────────────────────────────
  app.use(
    "/api/proxy",
    ((req: Request, _res: Response, next: () => void) => {
      const cookie = (req as any).cookies?.[cookieName];
      if (cookie) {
        req.headers["authorization"] = `Bearer ${cookie}`;
      }
      next();
    }) as RequestHandler,
    createProxyMiddleware({
      target: backendUrl,
      changeOrigin: true,
      pathRewrite: { "^/api/proxy": "/api" },
      on: {
        error: (err, _req, res) => {
          console.error("[proxy] error", err);
          (res as Response).status(502).json({ error: "Bad gateway" });
        },
      },
    }) as unknown as RequestHandler,
  );
}
