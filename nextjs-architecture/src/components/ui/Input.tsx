import { forwardRef } from "react";
import { cn } from "@/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const inputId = id ?? props.name;

    return (
      <label className="flex flex-col gap-2 text-sm text-slate-700" htmlFor={inputId}>
        {label ? <span className="font-medium text-slate-900">{label}</span> : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-12 rounded-2xl border border-slate-200 bg-white px-4 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-slate-900",
            error ? "border-rose-300 focus:border-rose-500" : null,
            className,
          )}
          {...props}
        />
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
        {!error && hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </label>
    );
  },
);

Input.displayName = "Input";
