"use client";
import Link from "next/link";

const SECTIONS = [
  {
    title: "1. Information We Collect",
    body: `We collect information you provide directly (account registration, payment details, uploaded documents) and information collected automatically when you use Clara AI (usage logs, query metadata, IP addresses, browser type). We do not read the content of documents you upload beyond what is necessary to generate vector embeddings for search.`,
  },
  {
    title: "2. How We Use Your Information",
    body: `We use collected information to: provide and improve the Clara AI platform; process payments and manage subscriptions; respond to support requests; send product updates and security notices; and detect and prevent abuse. We do not sell your personal data or use it for third-party advertising.`,
  },
  {
    title: "3. Data Isolation & Tenant Security",
    body: `All knowledge bases, documents, and embeddings are strictly isolated per organisation. No organisation can access another's data. API keys are hashed and never stored in plaintext. All data is encrypted at rest (AES-256) and in transit (TLS 1.3).`,
  },
  {
    title: "4. Data Retention",
    body: `Document data and embeddings are retained for as long as your account is active. Upon account deletion, all associated data is purged within 30 days. Usage logs are retained for 90 days. You may request earlier deletion by contacting support.`,
  },
  {
    title: "5. Third-Party Services",
    body: `Clara AI uses the following sub-processors: OpenAI (LLM inference and embeddings), Qdrant (vector database), Stripe (payment processing), and cloud infrastructure providers. Each sub-processor is bound by a data processing agreement consistent with this policy.`,
  },
  {
    title: "6. Your Rights",
    body: `Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal data. To exercise these rights, email privacy@clara.ai. For EEA/UK residents, we process data under the legitimate interest and contractual necessity lawful bases under GDPR.`,
  },
  {
    title: "7. Cookies",
    body: `We use strictly necessary session cookies for authentication and optional analytics cookies (opt-out available in account settings). We do not use advertising or cross-site tracking cookies.`,
  },
  {
    title: "8. Changes to This Policy",
    body: `We may update this policy periodically. Material changes will be communicated via email or an in-app notice at least 14 days before they take effect. Continued use of Clara AI after that date constitutes acceptance of the updated policy.`,
  },
  {
    title: "9. Contact",
    body: `If you have questions about this policy, please contact us at privacy@clara.ai or write to: Clara AI Platform, Legal Department.`,
  },
];

export default function PrivacyScreen() {
  return (
    <div className="min-h-screen px-4 sm:px-6 py-10 sm:py-20">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <div className="text-xs text-white/30 mb-4">Last updated: 1 June 2025</div>
          <h1 className="text-4xl md:text-5xl font-black text-white mb-4">Privacy Policy</h1>
          <p className="text-white/50 text-lg leading-relaxed">
            Clara AI (&ldquo;we&rdquo;, &ldquo;us&rdquo;, &ldquo;our&rdquo;) is committed to protecting your privacy.
            This policy explains what data we collect, why, and how we protect it.
          </p>
        </div>

        <div className="space-y-6">
          {SECTIONS.map(sec => (
            <div key={sec.title} className="border border-white/[0.08] bg-white/[0.03] rounded-xl p-6">
              <h2 className="text-base font-bold text-white mb-3">{sec.title}</h2>
              <p className="text-sm text-white/60 leading-relaxed">{sec.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex gap-4 text-sm">
          <Link href="/terms" className="text-indigo-400 hover:text-indigo-300 transition-colors">Terms of Service →</Link>
          <Link href="/contact" className="text-white/40 hover:text-white/70 transition-colors">Contact us</Link>
        </div>
      </div>
    </div>
  );
}
