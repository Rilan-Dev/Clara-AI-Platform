"use client";
import Link from "next/link";
import { Building2, CreditCard, KeyRound, Settings2 } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { PlatformEnvPanel } from "@/components/admin/PlatformEnvPanel";

export default function AdminSettingsPage(){
 return <div className="p-6 lg:p-8 max-w-6xl space-y-8">
  <AdminPageHeader icon={Settings2} title="Platform Settings" description="Platform-level runtime configuration for the landing embed and live subscription payment gateways. Tenant projects, knowledge bases, members, and AI configuration are not managed from this area." breadcrumbs={[{label:"Settings"}]} chips={["Platform only","Live runtime config","Payments"]}/>
  <div className="grid md:grid-cols-3 gap-4">
   <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"><KeyRound className="w-5 h-5 text-indigo-300 mb-3"/><h2 className="font-semibold text-white">Landing Embed</h2><p className="text-sm text-white/40 mt-2">Configure the public landing-page embed API key. The DB value overrides the environment fallback.</p></div>
   <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"><CreditCard className="w-5 h-5 text-emerald-300 mb-3"/><h2 className="font-semibold text-white">Payment Gateways</h2><p className="text-sm text-white/40 mt-2">Change Stripe and Razorpay credentials, price IDs, webhook secrets, and the public application URL without restarting.</p></div>
   <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5"><Building2 className="w-5 h-5 text-violet-300 mb-3"/><h2 className="font-semibold text-white">Organisation Profiles</h2><p className="text-sm text-white/40 mt-2">Manage names and profile metadata separately. Only aggregate project and KB counts are visible at platform level.</p><Link href="/orgs" className="inline-flex mt-4"><Button variant="outline" size="sm">Manage Profiles</Button></Link></div>
  </div>
  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6"><PlatformEnvPanel/></div>
 </div>;
}
