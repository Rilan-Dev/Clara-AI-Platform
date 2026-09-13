import { redirect } from "next/navigation";

// The settings screen is split into sub-routes so the main sidebar can link
// directly to each section (Account / AI Configuration / Embed Key / Payments).
// /settings itself always lands on the Account section.
export default function SettingsIndexPage() {
  redirect("/settings/account");
}
