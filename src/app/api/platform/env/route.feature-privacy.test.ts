import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  ensureMigrated: vi.fn(),
  getPlatformEnvSettings: vi.fn(),
  setPlatformEnvSetting: vi.fn(),
  requireAuth: vi.fn(),
  requireSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/db/migrate", () => ({ ensureMigrated: mocks.ensureMigrated }));
vi.mock("@/modules/phone/core/db", () => ({
  getPlatformEnvSettings: mocks.getPlatformEnvSettings,
  setPlatformEnvSetting: mocks.setPlatformEnvSetting,
}));
vi.mock("@/modules/auth/core/rbac", () => ({
  requireAuth: mocks.requireAuth,
  requireSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/modules/assistant/api/openai-catalog-cache", () => ({ invalidateOpenAICatalogCache: vi.fn() }));
vi.mock("@/lib/email", () => ({ resetEmailTransportCache: vi.fn() }));
vi.mock("@/modules/ai-core/model-catalog", () => ({ validateModelField: vi.fn() }));
vi.mock("@/modules/ai-governance/core/registry-db", () => ({ listProviderModels: vi.fn() }));
vi.mock("@/modules/voice-core/model-catalog", () => ({ isPlaceholderProviderBaseUrl: vi.fn() }));

import { GET, POST } from "./route";

const key = "NEXT_PUBLIC_LANDING_EMBED_API_KEY";
const settings = [
  { key, value: "clr_widget-secret", isSecret: true, description: "Widget", category: "widget", updatedAt: null },
  { key: "EMAIL_PROVIDER", value: "smtp", isSecret: false, description: "Email", category: "email", updatedAt: null },
];
const get = () => new NextRequest("https://clara.example.test/api/platform/env");
const post = (data: unknown) => new NextRequest("https://clara.example.test/api/platform/env", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
});

afterEach(() => vi.unstubAllEnvs());

describe("widget feature isolation at the shared platform env endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLARA_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "unit-test-confirmation-secret-at-least-32-characters");
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.getPlatformEnvSettings.mockResolvedValue(settings);
    mocks.setPlatformEnvSetting.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({ user: { id: "platform-admin" } });
    mocks.requireSuperAdmin.mockResolvedValue(undefined);
  });

  it("omits the widget API key but leaves email and other core settings available", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settings.map((row: { key: string }) => row.key)).toEqual(["EMAIL_PROVIDER"]);
  });

  it("blocks minting a widget-key confirmation token before signing or writing", async () => {
    const res = await POST(post({ action: "token", key, value: "clr_new-key" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.setPlatformEnvSetting).not.toHaveBeenCalled();
  });

  it("blocks a previously minted widget-key confirmation token during disabled production", async () => {
    const res = await POST(post({ key, value: "clr_new-key", timestamp: Date.now(), confirmation_token: "a".repeat(64) }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "FEATURE_DISABLED" });
    expect(mocks.setPlatformEnvSetting).not.toHaveBeenCalled();
  });

  it("preserves existing development widget-key management", async () => {
    vi.stubEnv("CLARA_ENV", "development");
    const list = await GET(get());
    expect(list.status).toBe(200);
    expect((await list.json()).settings.some((row: { key: string }) => row.key === key)).toBe(true);
    const token = await POST(post({ action: "token", key, value: "clr_new-key" }));
    expect(token.status).toBe(200);
    expect((await token.json()).confirmation_token).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not block unrelated platform settings token creation", async () => {
    const token = await POST(post({ action: "token", key: "EMAIL_PROVIDER", value: "smtp" }));
    expect(token.status).toBe(200);
    expect((await token.json()).confirmation_token).toMatch(/^[a-f0-9]{64}$/);
  });
});
