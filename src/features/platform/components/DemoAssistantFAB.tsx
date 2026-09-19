"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Sparkles, X } from "lucide-react";

export default function DemoAssistantFAB() {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadDemoKey = async () => {
      try {
        const response = await fetch("/api/embed/demo-config", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { key?: string };
        if (!cancelled) {
          setKey(data.key?.trim() ?? "");
        }
      } catch {
        if (!cancelled) setKey("");
      }
    };

    void loadDemoKey();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!key) return null;

  return (
    <AnimatePresence mode="wait">
      {!open ? (
        <motion.div
          key="launcher"
          className="fixed bottom-6 right-6 z-[9999]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-pulse-ring" />
          <div className="absolute inset-0 rounded-full bg-secondary/15 animate-pulse-ring" style={{ animationDelay: "0.7s" }} />
          <div className="absolute inset-[-12px] animate-orbit"><div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]" /></div>
          <div className="absolute inset-[-16px] animate-orbit" style={{ animationDuration: "15s", animationDirection: "reverse" }}><div className="absolute bottom-0 right-0 w-1 h-1 rounded-full bg-violet-400 shadow-[0_0_6px_rgba(167,139,250,0.6)]" /></div>
          <button id="demo-assistant-fab" type="button" onClick={() => setOpen(true)} className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-2xl shadow-primary/20 flex items-center justify-center group transition-all duration-300 hover:scale-110 hover:shadow-primary/30 animate-breathe cursor-pointer" aria-label="Open Clara AI assistant">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-white relative z-10 group-hover:scale-110 transition-transform" />
          </button>
          <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }} className="absolute right-full top-1/2 -translate-y-1/2 mr-3 whitespace-nowrap hidden sm:block">
            <div className="glass-premium rounded-xl px-4 py-2 text-sm font-medium text-foreground/80 flex items-center gap-2"><Bot className="w-4 h-4 text-primary" />Try Clara AI</div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.div
          key="chat"
          className="fixed bottom-6 right-6 z-[9999] w-[420px] max-w-[calc(100vw-2rem)] h-[680px] max-h-[calc(100vh-3rem)] rounded-3xl overflow-hidden bg-card border border-border shadow-2xl shadow-primary/10"
          initial={{ opacity: 0, scale: 0.5, y: 40, borderRadius: "50%" }}
          animate={{ opacity: 1, scale: 1, y: 0, borderRadius: "1.5rem" }}
          exit={{ opacity: 0, scale: 0.5, y: 40 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          <div className="absolute top-2 right-2 z-20">
            <button type="button" onClick={() => setOpen(false)} className="w-9 h-9 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground bg-background/85 backdrop-blur-md border border-border/70 hover:bg-background transition-all cursor-pointer" aria-label="Close Clara AI assistant"><X className="w-4 h-4" /></button>
          </div>
          <iframe title="Clara AI chat assistant" src={`/embed/widget?key=${encodeURIComponent(key)}`} className="block w-full h-full border-0" allow="microphone; autoplay" referrerPolicy="strict-origin-when-cross-origin" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
