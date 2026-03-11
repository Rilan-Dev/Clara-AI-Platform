import type { Express, Request, Response, NextFunction } from "express";
import { NextRequest, NextResponse } from "./next-shim.js";

import * as authLoginRoute  from "../features/auth/api/login-route.js";
import * as authLogoutRoute from "../features/auth/api/logout-route.js";
import * as proxyRoute      from "../features/proxy/api/proxy-route.js";

type RouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> }
) => Promise<Response> | Response;

function toNextRequest(req: Request): NextRequest {
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (typeof value === "string") headers.set(key, value);
  }
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : Buffer.isBuffer(req.body) && req.body.length > 0
      ? req.body
      : undefined;
  return new NextRequest(url, { method: req.method, headers, body: body as unknown as BodyInit | undefined });
}

async function sendResponse(expressRes: Response, response: globalThis.Response) {
  (expressRes as any).status(response.status);
  response.headers.forEach((value, key) => (expressRes as any).append(key, value));
  (expressRes as any).send(Buffer.from(await response.arrayBuffer()));
}

function wrap(handler: RouteHandler) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const request  = toNextRequest(req);
      const response = await handler(request, { params: Promise.resolve(req.params as Record<string, string>) });
      await sendResponse(res, response instanceof NextResponse ? response : new NextResponse(response.body, response));
    } catch (error) { next(error); }
  };
}

export function registerApiRoutes(app: Express) {
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "healthy", app: "clara-omen-insurance", timestamp: new Date().toISOString() });
  });

  app.post  ("/api/auth/login",  wrap(authLoginRoute.POST  as RouteHandler));
  app.post  ("/api/auth/logout", wrap(authLogoutRoute.POST as RouteHandler));

  app.get   ("/api/proxy/*path", wrap(proxyRoute.GET    as RouteHandler));
  app.post  ("/api/proxy/*path", wrap(proxyRoute.POST   as RouteHandler));
  app.put   ("/api/proxy/*path", wrap(proxyRoute.PUT    as RouteHandler));
  app.patch ("/api/proxy/*path", wrap(proxyRoute.PATCH  as RouteHandler));
  app.delete("/api/proxy/*path", wrap(proxyRoute.DELETE as RouteHandler));
}
