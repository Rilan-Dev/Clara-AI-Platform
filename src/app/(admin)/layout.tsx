import AdminShellLayout from "@/features/admin/layouts/admin-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShellLayout>
      {children}
    </AdminShellLayout>
  );
}
