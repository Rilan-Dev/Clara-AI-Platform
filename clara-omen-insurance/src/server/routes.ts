type Express = any;
type RequestHandler = any;
import { NextRequest, NextResponse } from "@/server/next-shim";

import * as authRoute from "@/features/auth/api/auth-route";
import * as authLoginRoute from "@/features/auth/api/login-route";
import * as authLogoutRoute from "@/features/auth/api/logout-route";
import * as proxyRoute from "@/features/proxy/api/proxy-route";

type RouteHandler = (request: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response> | Response;
type RouteDefinition = { method: "get" | "post" | "put" | "patch" | "delete"; path: string; handler: RouteHandler };

function toNextRequest(req: any) {
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else if (typeof value === "string") headers.set(key, value);
  }

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : req.body
      ? Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body))
      : undefined;

  return new NextRequest(url, { method: req.method, headers, body: body as unknown as BodyInit | undefined });
}

async function sendResponse(res: any, response: Response) {
  res.status(response.status);
  response.headers.forEach((value, key) => res.append(key, value));
  const buffer = Buffer.from(await response.arrayBuffer());
  res.send(buffer);
}

function wrap(handler: RouteHandler): RequestHandler {
  return async (req: any, res: any, next: any) => {
    try {
      const request = toNextRequest(req);
      const response = await handler(request, { params: Promise.resolve(req.params as Record<string, string>) });
      await sendResponse(res, response instanceof NextResponse ? response : new NextResponse(response.body, response));
    } catch (error) {
      next(error);
    }
  };
}

const routes: RouteDefinition[] = [
  { method: "post", path: "/api/auth", handler: authRoute.POST as RouteHandler },
  { method: "delete", path: "/api/auth", handler: authRoute.DELETE as RouteHandler },
  { method: "post", path: "/api/auth/login", handler: authLoginRoute.POST as RouteHandler },
  { method: "post", path: "/api/auth/logout", handler: authLogoutRoute.POST as RouteHandler },
  { method: "get", path: "/api/proxy/*path", handler: proxyRoute.GET as RouteHandler },
  { method: "post", path: "/api/proxy/*path", handler: proxyRoute.POST as RouteHandler },
  { method: "put", path: "/api/proxy/*path", handler: proxyRoute.PUT as RouteHandler },
  { method: "patch", path: "/api/proxy/*path", handler: proxyRoute.PATCH as RouteHandler },
  { method: "delete", path: "/api/proxy/*path", handler: proxyRoute.DELETE as RouteHandler },
];

export function registerApiRoutes(app: Express) {
  app.get("/api/health", (_req: any, res: any) => {
    res.json({ status: "healthy", app: "clara-omen-insurance", timestamp: new Date().toISOString() });
  });

  for (const route of routes) {
    app[route.method](route.path, wrap(route.handler));
  }
}
