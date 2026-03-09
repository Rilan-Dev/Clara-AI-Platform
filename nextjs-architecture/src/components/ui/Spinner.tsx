import { cn } from "@/utils/cn";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("size-5 animate-spin rounded-full border-2 border-slate-300 border-r-slate-950", className)} />;
}
