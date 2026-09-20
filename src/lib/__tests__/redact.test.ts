import { describe, it, expect } from "vitest";
import { redactText, redactionEntries } from "@/lib/redact";

describe("redactText (WS-1.4 default-ON PII masking)", () => {
  it("masks email addresses", () => {
    const r = redactText("Contact support@example.com for claim details.");
    expect(r.text).toBe("Contact [email] for claim details.");
    expect(r.changed).toBe(true);
    expect(r.counts.email).toBe(1);
  });

  it("masks multiple emails and counts them", () => {
    const r = redactText("From a.b@corp.io to c_d@mailer.example.org, cc: x@y.co");
    expect(r.counts.email).toBe(3);
    expect(r.text).not.toContain("@");
  });

  it("masks international and Indian phone numbers", () => {
    expect(redactText("Call +91 98765 43210 anytime").text).toBe("Call [phone] anytime");
    expect(redactText("Call +1 (415) 555-2671 now").text).toBe("Call [phone] now");
    expect(redactText("Ph: 9876543210").text).toBe("Ph: [phone]");
  });

  it("masks payment card identifiers", () => {
    const r = redactText("Card 4111 1111 1111 1111 was charged.");
    expect(r.text).toBe("Card [payment] was charged.");
    expect(r.counts.payment).toBe(1);
  });

  it("does not treat ordinary short numbers as PII", () => {
    const r = redactText("Policy covers 2 adults for 365 days at INR 5000.");
    expect(r.changed).toBe(false);
    expect(r.text).toBe("Policy covers 2 adults for 365 days at INR 5000.");
  });

  it("masks mixed PII in one message with per-type counts", () => {
    const r = redactText(
      "Email jane.doe@example.com or call +91 98765 43210. Card 5500 0000 0000 0004 on file.",
    );
    expect(r.counts).toEqual({ payment: 1, phone: 1, email: 1 });
    // Only the PII itself is masked — the label word "Card" is not PII.
    expect(r.text).toBe("Email [email] or call [phone]. Card [payment] on file.");
  });

  it("leaves clean text untouched (changed=false, no raw retention)", () => {
    const r = redactText("What is the waiting period for cataract surgery?");
    expect(r.changed).toBe(false);
    expect(r.counts).toEqual({});
  });

  it("handles null/empty safely", () => {
    expect(redactText(null).text).toBe("");
    expect(redactText("").changed).toBe(false);
  });

  it("a 16-digit card is never split into two phone numbers", () => {
    const r = redactText("4242424242424242");
    expect(r.text).toBe("[payment]");
    expect(r.counts).toEqual({ payment: 1 });
  });
});

describe("redactionEntries (JSONB column value)", () => {
  it("serialises counts as [{type, count}]", () => {
    expect(redactionEntries({ email: 2, phone: 1 })).toEqual([
      { type: "email", count: 2 },
      { type: "phone", count: 1 },
    ]);
  });

  it("empty counts serialise to an empty array", () => {
    expect(redactionEntries({})).toEqual([]);
  });
});
