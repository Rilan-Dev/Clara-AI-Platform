import { describe, expect, it } from "vitest";
import { parseContactLead, renderContactEmail } from "@/lib/contact";

describe("parseContactLead", () => {
  it("requires name, a valid email and company", () => {
    expect(parseContactLead({ email: "a@b.co", company: "Acme" })).toEqual({ error: "Please enter your name." });
    expect(parseContactLead({ name: "Jane", email: "nope", company: "Acme" })).toEqual({
      error: "Please enter a valid work email.",
    });
    expect(parseContactLead({ name: "Jane", email: "a@b.co" })).toEqual({ error: "Please enter your company." });
  });

  it("trims fields and falls back to the pro plan for unknown values", () => {
    const lead = parseContactLead({ name: " Jane ", email: "jane@acme.com", company: "Acme", plan: "gold" });
    expect(lead).toMatchObject({ name: "Jane", plan: "pro", message: "" });
  });
});

describe("renderContactEmail", () => {
  it("escapes visitor-supplied HTML", () => {
    const { html, subject } = renderContactEmail({
      name: "<img src=x onerror=alert(1)>",
      email: "jane@acme.com",
      company: "Acme",
      plan: "starter",
      message: "<script>x</script>",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(subject).toBe("New demo request: Acme (starter)");
  });
});
