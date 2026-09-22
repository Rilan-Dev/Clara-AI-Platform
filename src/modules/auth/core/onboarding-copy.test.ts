import { describe, expect, it } from "vitest";
import { getVerificationCopy } from "./onboarding-copy";

describe("getVerificationCopy", () => {
  it("uses payment continuation for a verified paid signup", () => {
    const result = getVerificationCopy({
      context: "signup",
      emailVerified: true,
      plan: "starter",
      onboardingStatus: "payment_required",
    });

    expect(result.title).toBe("Email verified");
    expect(result.nextAction).toBe("Continue to payment");
    expect(result.description.toLowerCase()).toContain("payment");
    expect(result.destination).toBe("payment");
  });

  it("does not mention payment for a verified free signup", () => {
    const result = getVerificationCopy({
      context: "signup",
      emailVerified: true,
      plan: "free",
      onboardingStatus: "active",
    });

    expect(result.nextAction).toBe("Continue to Clara AI");
    expect(result.description.toLowerCase()).not.toContain("payment");
    expect(result.destination).toBe("workspace");
  });

  it("never uses registration wording for login verification", () => {
    const result = getVerificationCopy({
      context: "login",
      emailVerified: false,
      plan: null,
      onboardingStatus: null,
    });

    expect(result.title).toBe("Verify your email");
    expect(result.description.toLowerCase()).not.toContain("registration");
    expect(result.nextAction).toBe("Return to Clara AI");
    expect(result.destination).toBe("login");
  });

  it("gives an explicit recovery action for an expired token", () => {
    const result = getVerificationCopy({
      context: "verification",
      emailVerified: false,
      plan: null,
      onboardingStatus: null,
      tokenState: "expired",
    });

    expect(result.nextAction).toBe("Request a new verification email");
    expect(result.destination).toBe("login");
  });

  it("handles already-verified accounts without asking them to verify again", () => {
    const result = getVerificationCopy({
      context: "verification",
      emailVerified: true,
      plan: null,
      onboardingStatus: null,
      tokenState: "already_verified",
    });

    expect(result.title).toBe("Email already verified");
    expect(result.nextAction).toBe("Return to Clara AI");
  });
});
