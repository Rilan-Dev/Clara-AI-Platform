"use client";

import * as React from "react";

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1000;

export type ToastActionElement = React.ReactNode;

export type ToastProps = {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type ToasterToast = ToastProps & {
  open: boolean;
  readonly? : boolean;
};

type State = {
  toasts: ToasterToast[];
};

type ToastAction =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string };

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const toastState: State = {
  toasts: [],
};

function addToRemoveQueue(toastId: string) {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    toastState.toasts = toastState.toasts.filter((toast) => toast.id !== toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

const listeners = new Set<(state: State) => void>();

function dispatch(action: ToastAction) {
  switch (action.type) {
    case "ADD_TOAST":
      toastState.toasts = [action.toast, ...toastState.toasts].slice(0, TOAST_LIMIT);
      break;
    case "UPDATE_TOAST":
      toastState.toasts = toastState.toasts.map((toast) =>
        toast.id === action.toast.id ? { ...toast, ...action.toast } : toast,
      );
      break;
    case "DISMISS_TOAST":
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        toastState.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      toastState.toasts = toastState.toasts.map((toast) =>
        toast.id === toastId || toastId === undefined
          ? { ...toast, open: false }
          : toast,
      );
      break;
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        toastState.toasts = [];
        break;
      }
      toastState.toasts = toastState.toasts.filter((toast) => toast.id !== action.toastId);
      break;
  }

  listeners.forEach((listener) => {
    listener(toastState);
  });
}

export function useToast() {
  const [state, setState] = React.useState<State>(toastState);

  React.useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export function toast(props: Omit<ToastProps, "id">) {
  const id = crypto.randomUUID();

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
    },
  });

  return {
    id,
    dismiss: () => dispatch({ type: "DISMISS_TOAST", toastId: id }),
  };
}
