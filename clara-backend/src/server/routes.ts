import type { Express, RequestHandler } from "express";
import { NextRequest, NextResponse } from "@/server/next-shim";

import * as authLoginRoute from "@/app/api/auth/login/route";
import * as authLogoutRoute from "@/app/api/auth/logout/route";
import * as authMeRoute from "@/app/api/auth/me/route";
import * as authRegisterRoute from "@/app/api/auth/register/route";
import * as authSessionsRoute from "@/app/api/auth/sessions/route";
import * as chatRoute from "@/app/api/chat/route";
import * as documentsRoute from "@/app/api/documents/route";
import * as documentsOverviewRoute from "@/app/api/documents/overview/route";
import * as embedChatRoute from "@/app/api/embed/chat/route";
import * as embedConfigRoute from "@/app/api/embed/config/route";
import * as embedSessionRoute from "@/app/api/embed/session/route";
import * as geminiSessionRoute from "@/app/api/gemini/session/route";
import * as healthRoute from "@/app/api/health/route";
import * as ingestRoute from "@/app/api/ingest/route";
import * as kbsAllRoute from "@/app/api/kbs/all/route";
import * as kbsAnalyticsRoute from "@/app/api/kbs/[kbId]/analytics/route";
import * as kbsApiKeyRoute from "@/app/api/kbs/[kbId]/api-keys/route";
import * as kbsApiKeyByIdRoute from "@/app/api/kbs/[kbId]/api-keys/[keyId]/route";
import * as kbsConfigRoute from "@/app/api/kbs/[kbId]/config/route";
import * as kbsSnapshotsRoute from "@/app/api/kbs/[kbId]/config/snapshots/route";
import * as kbsSnapshotRestoreRoute from "@/app/api/kbs/[kbId]/config/snapshots/[snapshotId]/restore/route";
import * as kbsDocumentsRoute from "@/app/api/kbs/[kbId]/documents/route";
import * as kbsDocumentRoute from "@/app/api/kbs/[kbId]/documents/[docId]/route";
import * as kbsDocumentReprocessRoute from "@/app/api/kbs/[kbId]/documents/[docId]/reprocess/route";
import * as kbRoute from "@/app/api/kbs/[kbId]/route";
import * as orgsRoute from "@/app/api/orgs/route";
import * as orgRoute from "@/app/api/orgs/[orgId]/route";
import * as orgProjectsRoute from "@/app/api/orgs/[orgId]/projects/route";
import * as orgMembersRoute from "@/app/api/orgs/[orgId]/members/route";
import * as orgMemberRoute from "@/app/api/orgs/[orgId]/members/[userId]/route";
import * as orgSubscriptionRoute from "@/app/api/orgs/subscription/route";
import * as platformOrgsRoute from "@/app/api/platform/orgs/route";
import * as platformRevenueRoute from "@/app/api/platform/revenue/route";
import * as platformStatsRoute from "@/app/api/platform/stats/route";
import * as policiesRoute from "@/app/api/policies/route";
import * as policyRoute from "@/app/api/policies/[id]/route";
import * as projectRoute from "@/app/api/projects/[projectId]/route";
import * as projectKbsRoute from "@/app/api/projects/[projectId]/kbs/route";
import * as ragSearchRoute from "@/app/api/rag/search/route";
import * as realtimeSessionRoute from "@/app/api/realtime/session/route";
import * as realtimeGeminiSessionRoute from "@/app/api/realtime/gemini-session/route";
import * as subscriptionPlansRoute from "@/app/api/subscriptions/plans/route";
import * as workerIngestRoute from "@/app/api/worker/ingest/route";

type RequestHandlerLike = (
  request: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

type RouteDefinition = {
  method: "get" | "post" | "put" | "patch" | "delete";
  path: string;
  handler?: any;
};

function toNextRequest(req: Parameters<RequestHandler>[0]) {
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  const body = req.method === "GET" || req.method === "HEAD"
    ? undefined
    : Buffer.isBuffer(req.body)
      ? req.body
      : req.body
        ? Buffer.from(typeof req.body === "string" ? req.body : JSON.stringify(req.body))
        : undefined;

  return new NextRequest(url, {
    method: req.method,
    headers,
    body: body as unknown as BodyInit | undefined,
  });
}

async function sendResponse(res: Parameters<RequestHandler>[1], response: Response) {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  res.send(Buffer.from(arrayBuffer));
}

function wrapRoute(handler?: RequestHandlerLike): RequestHandler {
  return async (req, res, next) => {
    if (!handler) {
      next();
      return;
    }

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
  { method: "post", path: "/api/auth/login", handler: authLoginRoute.POST },
  { method: "post", path: "/api/auth/logout", handler: authLogoutRoute.POST },
  { method: "get", path: "/api/auth/me", handler: authMeRoute.GET },
  { method: "post", path: "/api/auth/register", handler: authRegisterRoute.POST },
  { method: "delete", path: "/api/auth/sessions", handler: authSessionsRoute.DELETE },
  { method: "post", path: "/api/chat", handler: chatRoute.POST },
  { method: "get", path: "/api/documents", handler: documentsRoute.GET },
  { method: "post", path: "/api/documents/overview", handler: documentsOverviewRoute.POST },
  { method: "post", path: "/api/embed/chat", handler: embedChatRoute.POST },
  { method: "get", path: "/api/embed/config", handler: embedConfigRoute.GET },
  { method: "post", path: "/api/embed/session", handler: embedSessionRoute.POST },
  { method: "post", path: "/api/gemini/session", handler: geminiSessionRoute.POST },
  { method: "get", path: "/api/health", handler: healthRoute.GET },
  { method: "post", path: "/api/ingest", handler: ingestRoute.POST },
  { method: "get", path: "/api/kbs/all", handler: kbsAllRoute.GET },
  { method: "get", path: "/api/kbs/:kbId", handler: kbRoute.GET },
  { method: "patch", path: "/api/kbs/:kbId", handler: kbRoute.PATCH },
  { method: "delete", path: "/api/kbs/:kbId", handler: kbRoute.DELETE },
  { method: "get", path: "/api/kbs/:kbId/analytics", handler: kbsAnalyticsRoute.GET },
  { method: "get", path: "/api/kbs/:kbId/api-keys", handler: kbsApiKeyRoute.GET },
  { method: "post", path: "/api/kbs/:kbId/api-keys", handler: kbsApiKeyRoute.POST },
  { method: "patch", path: "/api/kbs/:kbId/api-keys/:keyId", handler: kbsApiKeyByIdRoute.PATCH },
  { method: "delete", path: "/api/kbs/:kbId/api-keys/:keyId", handler: kbsApiKeyByIdRoute.DELETE },
  { method: "get", path: "/api/kbs/:kbId/config", handler: kbsConfigRoute.GET },
  { method: "put", path: "/api/kbs/:kbId/config", handler: kbsConfigRoute.PUT },
  { method: "patch", path: "/api/kbs/:kbId/config", handler: kbsConfigRoute.PATCH },
  { method: "get", path: "/api/kbs/:kbId/config/snapshots", handler: kbsSnapshotsRoute.GET },
  { method: "post", path: "/api/kbs/:kbId/config/snapshots", handler: kbsSnapshotsRoute.POST },
  { method: "post", path: "/api/kbs/:kbId/config/snapshots/:snapshotId/restore", handler: kbsSnapshotRestoreRoute.POST },
  { method: "get", path: "/api/kbs/:kbId/documents", handler: kbsDocumentsRoute.GET },
  { method: "post", path: "/api/kbs/:kbId/documents", handler: kbsDocumentsRoute.POST },
  { method: "get", path: "/api/kbs/:kbId/documents/:docId", handler: kbsDocumentRoute.GET },
  { method: "delete", path: "/api/kbs/:kbId/documents/:docId", handler: kbsDocumentRoute.DELETE },
  { method: "post", path: "/api/kbs/:kbId/documents/:docId/reprocess", handler: kbsDocumentReprocessRoute.POST },
  { method: "get", path: "/api/orgs", handler: orgsRoute.GET },
  { method: "post", path: "/api/orgs", handler: orgsRoute.POST },
  { method: "get", path: "/api/orgs/:orgId", handler: orgRoute.GET },
  { method: "patch", path: "/api/orgs/:orgId", handler: orgRoute.PATCH },
  { method: "delete", path: "/api/orgs/:orgId", handler: orgRoute.DELETE },
  { method: "get", path: "/api/orgs/:orgId/projects", handler: orgProjectsRoute.GET },
  { method: "post", path: "/api/orgs/:orgId/projects", handler: orgProjectsRoute.POST },
  { method: "get", path: "/api/orgs/:orgId/members", handler: orgMembersRoute.GET },
  { method: "post", path: "/api/orgs/:orgId/members", handler: orgMembersRoute.POST },
  { method: "delete", path: "/api/orgs/:orgId/members/:userId", handler: orgMemberRoute.DELETE },
  { method: "get", path: "/api/orgs/subscription", handler: orgSubscriptionRoute.GET },
  { method: "put", path: "/api/orgs/subscription", handler: orgSubscriptionRoute.PUT },
  { method: "get", path: "/api/platform/orgs", handler: platformOrgsRoute.GET },
  { method: "get", path: "/api/platform/revenue", handler: platformRevenueRoute.GET },
  { method: "get", path: "/api/platform/stats", handler: platformStatsRoute.GET },
  { method: "get", path: "/api/policies", handler: policiesRoute.GET },
  { method: "get", path: "/api/policies", handler: policiesRoute.GET as RequestHandlerLike },
  { method: "get", path: "/api/policies/:id", handler: policyRoute.GET },
  { method: "get", path: "/api/projects/:projectId", handler: projectRoute.GET as RequestHandlerLike },
  { method: "patch", path: "/api/projects/:projectId", handler: projectRoute.PATCH as RequestHandlerLike },
  { method: "delete", path: "/api/projects/:projectId", handler: projectRoute.DELETE as RequestHandlerLike },
  { method: "get", path: "/api/projects/:projectId/kbs", handler: projectKbsRoute.GET as RequestHandlerLike },
  { method: "post", path: "/api/projects/:projectId/kbs", handler: projectKbsRoute.POST as RequestHandlerLike },
  { method: "post", path: "/api/rag/search", handler: ragSearchRoute.POST },
  { method: "post", path: "/api/realtime/session", handler: realtimeSessionRoute.POST },
  { method: "post", path: "/api/realtime/gemini-session", handler: realtimeGeminiSessionRoute.POST },
  { method: "get", path: "/api/subscriptions/plans", handler: subscriptionPlansRoute.GET },
  { method: "get", path: "/api/worker/ingest", handler: workerIngestRoute.GET },
  { method: "post", path: "/api/worker/ingest", handler: workerIngestRoute.POST },
];

export function registerApiRoutes(app: Express) {
  for (const route of routes) {
    app[route.method](route.path, wrapRoute(route.handler));
  }
}
