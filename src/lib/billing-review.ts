import { sendPlatformEmail } from "@/lib/email";

export async function notifyBillingReview(input: {
  orgId: string;
  orgName?: string;
  planId?: string;
  reason: string;
}): Promise<void> {
  const recipient = process.env.CLARA_SUPPORT_EMAIL;
  if (!recipient) {
    console.error("[billing-review] CLARA_SUPPORT_EMAIL is not configured", input.orgId, input.reason);
    return;
  }

  const result = await sendPlatformEmail({
    to: recipient,
    subject: `Clara AI payment activation review: ${input.orgName ?? input.orgId}`,
    html: `<p>Manual billing review is required.</p>
      <p><strong>Organisation:</strong> ${input.orgName ?? input.orgId}</p>
      <p><strong>Plan:</strong> ${input.planId ?? "unknown"}</p>
      <p><strong>Reason:</strong> ${input.reason}</p>`,
  });

  if (!result.sent) {
    console.error("[billing-review] support notification failed:", result.error ?? "provider rejected message");
  }
}
