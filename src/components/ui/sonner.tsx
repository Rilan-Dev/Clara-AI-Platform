"use client";

import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<ToasterProps["theme"]>("light");

  // Follow the app's resolved theme (the "dark" class the theme toggle and
  // platform default set on <html>), not the OS preference.
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const updateTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light");

    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      expand={false}
      theme={theme}
      className="toaster group clara-responsive-toaster"
      toastOptions={{
        classNames: {
          toast:
            "group toast relative box-border w-[calc(100vw-2rem)] min-w-0 max-w-[min(28rem,calc(100vw-2rem))] sm:w-[min(28rem,calc(100vw-3rem))] min-h-20 pr-11 break-words [overflow-wrap:anywhere] whitespace-normal transition-[transform,opacity,box-shadow] duration-300 ease-in-out hover:z-50 hover:shadow-xl group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          title:
            "block max-h-10 overflow-hidden whitespace-normal break-words [overflow-wrap:anywhere] pr-1 leading-5 transition-[max-height] duration-300 ease-in-out group-hover:max-h-[1000px] group-hover:overflow-visible",
          description:
            "block max-h-12 overflow-hidden whitespace-normal break-words [overflow-wrap:anywhere] pr-1 leading-5 transition-[max-height] duration-300 ease-in-out group-hover:max-h-[1000px] group-hover:overflow-visible",
          closeButton:
            "!left-auto !right-2 !top-2 !translate-x-0 !translate-y-0 z-10 flex size-6 items-center justify-center rounded-full border border-current/20 bg-background/90 p-0 shadow-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
