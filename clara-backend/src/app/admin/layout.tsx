import LegacyAdminShellLayout from "@/features/legacy-admin/layouts/legacy-admin-shell";

export default function LegacyAdminLayout({ children }: { children: React.ReactNode }) {
  return <LegacyAdminShellLayout>{children}</LegacyAdminShellLayout>;
}
