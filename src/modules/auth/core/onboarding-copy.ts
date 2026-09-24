export type VerificationContext = "login" | "signup" | "verification";
export type VerificationTokenState = "expired" | "invalid" | "already_verified";

export type VerificationCopyInput = {
  context: VerificationContext;
  emailVerified: boolean;
  plan: "free" | "starter" | "pro" | "enterprise" | null;
  onboardingStatus: string | null;
  tokenState?: VerificationTokenState;
};

export type VerificationCopy = {
  title: string;
  description: string;
  nextAction: string;
  destination: "login" | "payment" | "workspace";
};

const PAID_PLANS = new Set(["starter", "pro", "enterprise"]);

export function getVerificationCopy(input: VerificationCopyInput): VerificationCopy {
  if (input.tokenState === "already_verified" || input.emailVerified) {
    if (input.context === "signup" && PAID_PLANS.has(input.plan ?? "") &&
        ["payment_required", "payment_pending", "payment_failed", "payment_cancelled", "payment_review"].includes(input.onboardingStatus ?? "")) {
      return {
        title: "Email verified",
        description: "Your email is confirmed. Return to your signup window to continue to payment. Your paid plan will activate after payment is confirmed.",
        nextAction: "Continue to payment",
        destination: "payment",
      };
    }

    // A just-verified signup (free, or paid and already active) goes straight
    // into the product instead of being told it was "already" verified.
    if (input.context === "signup" && input.tokenState !== "already_verified") {
      return {
        title: "Email verified",
        description: "Your email is confirmed. Continue to Clara AI to finish setting up your workspace.",
        nextAction: "Continue to Clara AI",
        destination: "workspace",
      };
    }

    return {
      title: "Email already verified",
      description: "Your email address is already confirmed. Return to Clara AI to continue.",
      nextAction: "Return to Clara AI",
      destination: "login",
    };
  }

  if (input.tokenState === "expired" || input.tokenState === "invalid") {
    return {
      title: input.tokenState === "expired" ? "Verification link expired" : "Verification link is invalid",
      description: input.tokenState === "expired"
        ? "This verification link has expired. Request a new verification email and use the latest link."
        : "This verification link is no longer valid. Request a new verification email and use the latest link.",
      nextAction: "Request a new verification email",
      destination: "login",
    };
  }

  if (input.context === "login") {
    return {
      title: "Verify your email",
      description: "We’ve sent a confirmation link to your email address. Verify it, then return to Clara AI and sign in to continue.",
      nextAction: "Return to Clara AI",
      destination: "login",
    };
  }

  return {
    title: "Check your inbox",
    description: PAID_PLANS.has(input.plan ?? "")
      ? "Verify your email, then return to your signup window to continue to payment."
      : "Verify your email, then return to your signup window to finish setting up Clara AI.",
    nextAction: PAID_PLANS.has(input.plan ?? "") ? "Continue to payment" : "Continue to Clara AI",
    destination: PAID_PLANS.has(input.plan ?? "") ? "payment" : "workspace",
  };
}
