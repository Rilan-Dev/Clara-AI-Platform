import {describe, expect, it} from "vitest";
import {buildConversationAwareSearchQuery} from "./conversation-context";

describe("control identifier typo-tolerant search", () => {
  it("uses canonical D-O spelling for retrieval without changing the user question", () => {
    const messages=[{role:"user",content:"List all the requirements of control D0.4.2."}];
    const query=buildConversationAwareSearchQuery(messages,messages[0]!.content);
    expect(query).toContain("DO.4.2");
    expect(query).not.toContain("D0.4.2");
  });
  it("supports Arabic-script questions without changing the requested answer language", () => {
    const messages=[{role:"user",content:"اذكر متطلبات الضابط D0.4.2"}];
    const query=buildConversationAwareSearchQuery(messages,messages[0]!.content);
    expect(query).toContain("DO.4.2");
    expect(query).toContain("اذكر");
  });
  it("does not rewrite ordinary numeric identifiers or already valid controls", () => {
    const messages=[{role:"user",content:"Explain D0.4 with code DO.4.2 and version D0.4.2x"}];
    const q=buildConversationAwareSearchQuery(messages,messages[0]!.content);
    expect(q).toContain("DO.4.2");
    expect(q).toContain("D0.4.2x");
  });
});
