"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("light");

  // Follow the app's resolved theme (the "dark" class the theme toggle and
  // platform default set on <html>), not the OS preference — otherwise a user
  // who picked light on a dark-mode OS gets dark toasts.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.documentElement;
    const updateTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light");

    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group clara-responsive-toaster"
      toastOptions={{
        classNames: {
          toast:
            "group toast box-border w-[calc(100vw-2rem)] min-w-0 max-w-[min(28rem,calc(100vw-2rem))] sm:w-[min(28rem,calc(100vw-3rem))] overflow-hidden break-words [overflow-wrap:anywhere] transition-[transform,box-shadow] duration-200 ease-out hover:z-50 hover:shadow-xl group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          title: "line-clamp-1 overflow-hidden break-words [overflow-wrap:anywhere] transition-[max-height] duration-200 group-hover:line-clamp-none group-hover:overflow-visible",
          description: "group-[.toast]:text-muted-foreground line-clamp-1 overflow-hidden break-words [overflow-wrap:anywhere] transition-[max-height] duration-200 group-hover:line-clamp-none group-hover:overflow-visible",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
