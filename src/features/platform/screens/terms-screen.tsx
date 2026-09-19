"use client";
import Link from "next/link";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: `By accessing or using Clara AI, you agree to be bound by these Terms of Service and our Privacy Policy. If you are using Clara AI on behalf of an organisation, you represent that you have authority to bind that organisation to these terms.`,
  },
  {
    title: "2. Service Description",
    body: `Clara AI provides a cloud-based platform for building and deploying AI assistants powered by Retrieval-Augmented Generation (RAG). Services include knowledge base management, document ingestion, vector search, AI chat, voice AI, and embeddable widgets.`,
  },
  {
    title: "3. Account & Organisation",
    body: `You must create an account to access the platform. You are responsible for maintaining the security of your API keys and admin credentials. Each organisation is allocated isolated resources according to their subscription plan. You may not share accounts or resell access without written permission.`,
  },
  {
    title: "4. Acceptable Use",
    body: `You may not use Clara AI to: (a) upload content that is illegal, harmful, or infringes third-party rights; (b) attempt to reverse-engineer or circumvent platform security; (c) use the service for spam, phishing, or disinformation; (d) exceed rate limits programmatically to gain unfair advantage; or (e) re-export the service in violation of applicable export laws.`,
  },
  {
    title: "5. Subscriptions & Billing",
    body: `Paid plans are billed monthly or annually in advance. Upgrades take effect immediately; downgrades take effect at the next billing cycle. Refunds are provided only where required by law. We reserve the right to suspend accounts with overdue payments after a 7-day grace period.`,
  },
  {
    title: "6. Intellectual Property",
    body: `Clara AI and its underlying technology remain the exclusive property of Clara AI Platform. Documents and knowledge you upload remain your property. You grant Clara AI a limited license to process your content solely to provide the services described in these terms.`,
  },
  {
    title: "7. Uptime & SLA",
    body: `We target 99.9% monthly uptime for the API. Scheduled maintenance windows will be announced at least 48 hours in advance. Service credits for SLA breaches are available for Pro and Enterprise plans; details are in our SLA addendum available on request.`,
  },
  {
    title: "8. Disclaimer of Warranties",
    body: `The service is provided "as is" without warranty of any kind. AI-generated answers may be inaccurate. You should not rely on Clara AI responses for medical, legal, or financial decisions without independent verification.`,
  },
  {
    title: "9. Limitation of Liability",
    body: `To the maximum extent permitted by law, Clara AI's total liability for any claim shall not exceed the fees paid by you in the 12 months preceding the claim. We are not liable for indirect, incidental, or consequential damages.`,
  },
  {
    title: "10. Governing Law",
    body: `These terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.`,
  },
  {
    title: "11. Changes to Terms",
    body: `We may update these terms with 14 days' notice via email or in-app notification. Continued use of Clara AI after that period constitutes acceptance. If you disagree with changes, you may terminate your account before the effective date.`,
  },
];

export default function TermsScreen() {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 sm:py-20">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <div className="text-xs text-muted-foreground/70 mb-4">Last updated: 1 June 2025</div>
          <h1 className="text-4xl md:text-5xl font-black text-foreground mb-4">Terms of Service</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Please read these terms carefully before using Clara AI. They govern your use of our platform.
          </p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="border border-border bg-card rounded-xl p-6">
              <h2 className="text-base font-bold text-foreground mb-3">{sec.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{sec.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/privacy" className="text-primary hover:text-primary/80 transition-colors">Privacy Policy →</Link>
          <Link href="/contact" className="text-muted-foreground hover:text-foreground transition-colors">Contact us</Link>
        </div>
      </div>
    </div>
  );
}
