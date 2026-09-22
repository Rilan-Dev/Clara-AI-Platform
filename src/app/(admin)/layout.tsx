import AdminShellLayout from "@/features/admin/layouts/admin-shell";
import { PlatformHealthAlertBanner } from "@/components/admin/PlatformHealthAlertBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShellLayout>
      <PlatformHealthAlertBanner />
      {children}
    </AdminShellLayout>
  );
}
