import SettingsScreen from "@/features/admin/screens/settings-screen";

export const metadata = { title: "Appearance Settings | Clara AI" };

// Platform-default theme mode (light / dark / system) for new visitors.
// Org users are steered back to their Account section by SettingsScreen —
// the platform default is a super-admin control.
export default function AppearanceSettingsPage() {
  return <SettingsScreen section="appearance" />;
}
