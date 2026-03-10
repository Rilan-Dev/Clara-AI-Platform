import TechVisionPortalShell from "@/features/portal-shell/layouts/portal-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <TechVisionPortalShell>{children}</TechVisionPortalShell>;
}
