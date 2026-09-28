import { describe, expect, it } from "vitest";
import { claraRuntime } from "./clara-runtime";

describe("claraRuntime", () => {
  it("exposes the core runtime seams", () => {
    expect(typeof claraRuntime.resolveProvider).toBe("function");
    expect(typeof claraRuntime.resolveVoice).toBe("function");
    expect(typeof claraRuntime.retrieve).toBe("function");
    expect(typeof claraRuntime.createChatTurn).toBe("function");
    expect(typeof claraRuntime.startRealtimeSession).toBe("function");
    expect(typeof claraRuntime.tools.list).toBe("function");
    expect(typeof claraRuntime.tools.invoke).toBe("function");
  });

  it("exposes only the Clara-owned grounded tool surface", () => {
    expect(claraRuntime.tools.list().map((tool) => tool.name)).toEqual(["rag_search"]);
  });
});
