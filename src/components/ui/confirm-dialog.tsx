"use client";

/**
 * Promise-based confirmation dialog — the accessible replacement for the
 * browser's native confirm().
 *
 *   if (!(await confirmAction({ title: "Delete agent?", destructive: true }))) return;
 *
 * <ConfirmDialogHost /> is mounted once in the root layout. Passing
 * `requireText` asks the user to type a value (e.g. the resource name) before
 * the confirm button unlocks — use it for irreversible deletes.
 */

import { useEffect, useId, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  requireText?: string;
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let enqueue: ((request: Request) => void) | null = null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!enqueue) {
      // Host not mounted (e.g. an isolated test render) — fall back safely.
      resolve(typeof window !== "undefined" && window.confirm(options.title));
      return;
    }
    enqueue({ ...options, resolve });
  });
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const [typed, setTyped] = useState("");
  const inputId = useId();

  useEffect(() => {
    enqueue = (next) => {
      setTyped("");
      setRequest((current) => {
        current?.resolve(false);
        return next;
      });
    };
    return () => { enqueue = null; };
  }, []);

  function settle(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  const locked = Boolean(request?.requireText) && typed.trim() !== request?.requireText;

  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {request?.description ? (
            <AlertDialogDescription>{request.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {request?.requireText ? (
          <div className="space-y-1.5">
            <label htmlFor={inputId} className="text-sm text-muted-foreground">
              Type <span className="font-semibold text-foreground">{request.requireText}</span> to confirm
            </label>
            <input
              id={inputId}
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {request?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={locked}
            onClick={(e) => {
              if (locked) { e.preventDefault(); return; }
              settle(true);
            }}
            className={cn(
              request?.destructive && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {request?.confirmLabel ?? (request?.destructive ? "Delete" : "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
