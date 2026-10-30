import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/embed/core/api-keys-db", () => ({ validateApiKey: vi.fn() }));
vi.mock("@/modules/embed/core/validate-embed", () => ({
  isOriginAllowedForEmbed: vi.fn(() => true),
}));
vi.mock("@/modules/embed/core/public-token", () => ({
  isPublicSessionToken: (raw:string) => raw.startsWith("pub_v1."),
  verifyPublicSessionToken: vi.fn((raw:string) => raw === "pub_v1.valid.signature"
    ? {payload:{a:"agent-1",k:"kb-1",o:"org-1",d:"deployment-1",e:Date.now()+60000},
       expiresAt:Date.now()+60000}
    : null),
}));
vi.mock("@/modules/agent-versioning/core/db", () => ({
  getActiveDeploymentCached: vi.fn(async () => ({
    id:"deployment-1", publicAccess:true,
  })),
}));

import { embedVoiceGuard } from "./embed-auth";
import { getActiveDeploymentCached } from "@/modules/agent-versioning/core/db";

function request(raw:string) {
  return new NextRequest("https://clara.example.test/api/voice/sarvam/tts", {
    method:"POST",headers:{authorization:"Bearer "+raw},
  });
}

describe("published-session authorization on voice STT/TTS endpoints", () => {
  beforeEach(() => {
    vi.mocked(getActiveDeploymentCached).mockReset();
    vi.mocked(getActiveDeploymentCached).mockResolvedValue({
      id:"deployment-1",publicAccess:true,
    } as Awaited<ReturnType<typeof getActiveDeploymentCached>>);
  });

  it("rejects invalid public session HMACs without touching a KB", async () => {
    expect((await embedVoiceGuard(request("pub_v1.forged.signature"),"kb-1"))?.status).toBe(401);
  });
  it("rejects valid sessions that point to another KB", async () => {
    expect((await embedVoiceGuard(request("pub_v1.valid.signature"),"kb-other"))?.status).toBe(403);
  });
  it("allows a valid, deployment-bound published session to its own KB", async () => {
    expect(await embedVoiceGuard(request("pub_v1.valid.signature"),"kb-1")).toBeNull();
  });
  it("rejects once an agent is unpublished or its deployment changes", async () => {
    for (const deployment of [
      {id:"deployment-1",publicAccess:false},
      {id:"different-deployment",publicAccess:true},
      null,
    ]) {
      vi.mocked(getActiveDeploymentCached).mockResolvedValueOnce(deployment as Awaited<ReturnType<typeof getActiveDeploymentCached>>);
      expect((await embedVoiceGuard(request("pub_v1.valid.signature"),"kb-1"))?.status).toBe(403);
    }
  });
});
