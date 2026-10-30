import { describe, expect, it } from "vitest";
import { classifyVoicePipelineSession } from "./pipeline-chat-audience";

describe("Voice pipeline chat routing by credential family", () => {
  it("routes signed published-agent visitors through public chat without workspace login", () => {
    expect(classifyVoicePipelineSession("Bearer pub_v1.payload.signature")).toEqual({
      chatEndpoint: "/api/public/chat",
      isExternalSession: true,
    });
  });
  it("keeps third-party widget API keys on their separately gated embed path", () => {
    expect(classifyVoicePipelineSession("Bearer clr_external_widget")).toEqual({
      chatEndpoint: "/api/embed/chat",
      isExternalSession: true,
    });
  });
  it.each(["Bearer workspace.jwt.signature", null, "", "pub_v1.missingBearer"])(
    "requires workspace authentication for Preview or missing credentials (%s)",
    (authorization) => {
      expect(classifyVoicePipelineSession(authorization)).toEqual({
        chatEndpoint: "/api/chat",
        isExternalSession: false,
      });
    },
  );
  it("never treats an unrelated Bearer token as a public visitor", () => {
    expect(classifyVoicePipelineSession("Bearer random-api-token").isExternalSession).toBe(false);
  });
});
