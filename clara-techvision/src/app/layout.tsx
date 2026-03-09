import "./globals.css";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#0f172a] antialiased min-h-screen">{children}</div>
  );
}

export default AppShell;
