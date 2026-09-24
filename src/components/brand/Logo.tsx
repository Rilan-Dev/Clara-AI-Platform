import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The Clara AI brand mark. One component instead of a copy-pasted gradient
 * square, so a rebrand touches a single file. Pass sizing/spacing classes via
 * `className` (box) and `iconClassName` (glyph).
 */
export function LogoMark({ className, iconClassName }: { className?: string; iconClassName?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600",
        "h-12 w-12 rounded-2xl",
        className,
      )}
    >
      <Brain className={cn("h-6 w-6 text-white", iconClassName)} />
    </span>
  );
}
