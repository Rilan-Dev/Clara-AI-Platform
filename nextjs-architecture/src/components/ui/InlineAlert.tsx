import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/utils/cn";

const iconByTone = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const toneClasses = {
  error: "border-rose-200 bg-rose-50 text-rose-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

export function InlineAlert({
  tone,
  title,
  description,
}: {
  tone: keyof typeof iconByTone;
  title: string;
  description?: string;
}) {
  const Icon = iconByTone[tone];

  return (
    <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", toneClasses[tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {description ? <p className="mt-1 opacity-90">{description}</p> : null}
      </div>
    </div>
  );
}
