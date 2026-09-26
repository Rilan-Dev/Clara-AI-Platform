import { beforeEach, describe, expect, it, vi } from "vitest";

const scroll = vi.fn();
vi.mock("@/modules/admin/core/vector-store", () => ({ getQdrantClient: () => ({ scroll }) }));
const chatStream = vi.fn();
vi.mock("@/modules/ai-core/factory", () => ({ ProviderFactory: { getProvider: () => ({ chatStream }) } }));

import { clearKnowledgeTopicsCache, getKnowledgeTopics } from "./knowledge-topics";

const stream = (text: string) => (async function* () { yield text; })();

describe("getKnowledgeTopics — from the tenant's own KB, never hardcoded", () => {
  beforeEach(() => {
    clearKnowledgeTopicsCache();
    scroll.mockReset();
    chatStream.mockReset();
  });

  it("uses the admin's KB description when set", async () => {
    const topics = await getKnowledgeTopics({ collection: "c1", description: "Returns and refunds", documentTitles: ["FAQ"] });
    expect(topics).toBe("Returns and refunds");
    expect(scroll).not.toHaveBeenCalled();
  });

  it("summarises the KB's indexed content once and caches it", async () => {
    scroll.mockResolvedValue({ points: [{ payload: { chunk: "Home insurance covers the structure…" } }] });
    chatStream.mockImplementation(() => stream("Home insurance, Health insurance"));
    const first = await getKnowledgeTopics({ collection: "c2", documentTitles: ["FAQs (All)"], waitMs: 1000 });
    expect(first).toBe("Home insurance, Health insurance");
    const second = await getKnowledgeTopics({ collection: "c2", documentTitles: ["FAQs (All)"], waitMs: 1000 });
    expect(second).toBe("Home insurance, Health insurance");
    expect(chatStream).toHaveBeenCalledTimes(1);
  });

  it("falls back to document titles when the summary fails", async () => {
    scroll.mockRejectedValue(new Error("qdrant down"));
    const topics = await getKnowledgeTopics({ collection: "c3", documentTitles: ["Guide", "FAQ"], waitMs: 500 });
    expect(topics).toBe("Guide, FAQ");
  });

  it("does not block the turn when waitMs is 0", async () => {
    scroll.mockResolvedValue({ points: [] });
    expect(await getKnowledgeTopics({ collection: "c4", documentTitles: ["Doc"] })).toBe("Doc");
  });
});
