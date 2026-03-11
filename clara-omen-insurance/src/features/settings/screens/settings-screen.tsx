"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Save, Palette, Bot, Bell, Shield, RefreshCw } from "lucide-react";
import { useKnowledgeBases } from "@/features/knowledge-bases/hooks/use-knowledge-bases";
import {
  useAssistantConfig,
  useUpdateAssistantConfig,
} from "@/features/settings/hooks/use-assistant-config";
import type { KnowledgeBase } from "@/services/api/portal.types";

const assistantConfigSchema = z.object({
  assistantName: z.string().min(1, "Assistant name is required"),
  avatarUrl: z.string().url("Enter a valid URL").or(z.literal("")),
  systemPrompt: z.string().min(1, "System prompt is required"),
  welcomeMessage: z.string().min(1, "Welcome message is required"),
  outOfScopeReply: z.string().min(1, "Out-of-scope reply is required"),
  defaultLanguage: z.string().min(2, "Default language is required"),
  temperature: z.coerce.number().min(0).max(1),
  maxTokens: z.coerce.number().int().min(100).max(4000),
  citeSources: z.boolean(),
  strictMode: z.boolean(),
  primaryColour: z.string().min(4, "Primary colour is required"),
  accentColour: z.string().min(4, "Accent colour is required"),
  voiceId: z.string().min(0),
  speed: z.coerce.number().min(0.5).max(2),
});

type AssistantConfigFormValues = z.infer<typeof assistantConfigSchema>;

const emptyValues: AssistantConfigFormValues = {
  assistantName: "",
  avatarUrl: "",
  systemPrompt: "",
  welcomeMessage: "",
  outOfScopeReply: "",
  defaultLanguage: "en",
  temperature: 0.7,
  maxTokens: 500,
  citeSources: true,
  strictMode: true,
  primaryColour: "#0a1628",
  accentColour: "#c8821a",
  voiceId: "",
  speed: 1,
};

export default function SettingsPage() {
  const [activeKbId, setActiveKbId] = useState("");
  const [saved, setSaved] = useState(false);
  const knowledgeBasesQuery = useKnowledgeBases();
  const assistantConfigQuery = useAssistantConfig(activeKbId);
  const updateAssistantConfigMutation = useUpdateAssistantConfig(activeKbId);
  const knowledgeBases: KnowledgeBase[] = knowledgeBasesQuery.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<AssistantConfigFormValues>({
    resolver: zodResolver(assistantConfigSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!activeKbId && knowledgeBasesQuery.data && knowledgeBasesQuery.data.length > 0) {
      setActiveKbId(knowledgeBasesQuery.data[0].id);
    }
  }, [activeKbId, knowledgeBasesQuery.data]);

  useEffect(() => {
    if (!assistantConfigQuery.data) {
      return;
    }

    reset({
      assistantName: assistantConfigQuery.data.assistantName ?? "",
      avatarUrl: assistantConfigQuery.data.avatarUrl ?? "",
      systemPrompt: assistantConfigQuery.data.systemPrompt ?? "",
      welcomeMessage: assistantConfigQuery.data.welcomeMessage ?? "",
      outOfScopeReply: assistantConfigQuery.data.outOfScopeReply ?? "",
      defaultLanguage: assistantConfigQuery.data.defaultLanguage ?? "en",
      temperature: assistantConfigQuery.data.temperature ?? 0.7,
      maxTokens: assistantConfigQuery.data.maxTokens ?? 500,
      citeSources: assistantConfigQuery.data.citeSources ?? true,
      strictMode: assistantConfigQuery.data.strictMode ?? true,
      primaryColour: assistantConfigQuery.data.primaryColour ?? "#0a1628",
      accentColour: assistantConfigQuery.data.accentColour ?? "#c8821a",
      voiceId: assistantConfigQuery.data.voiceId ?? "",
      speed: assistantConfigQuery.data.speed ?? 1,
    });
  }, [assistantConfigQuery.data, reset]);

  async function onSubmit(values: AssistantConfigFormValues) {
    await updateAssistantConfigMutation.mutateAsync({
      ...values,
      avatarUrl: values.avatarUrl || null,
      voiceId: values.voiceId || null,
    });

    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  const loading = knowledgeBasesQuery.isLoading || assistantConfigQuery.isLoading;
  const formValues = watch();
  const mutationError = updateAssistantConfigMutation.error?.message ?? "";

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Assistant Settings</h1>
        <p className="text-sm text-white/40 mt-1">Configure your AI assistant persona and behaviour per knowledge base</p>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-white/50 mb-2">Configure for Knowledge Base</label>
        <select
          value={activeKbId}
          onChange={(event) => setActiveKbId(event.target.value)}
          className="bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60"
        >
          {knowledgeBases.map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/30 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading settings…
        </div>
      ) : (
        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-white">Identity</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Assistant Name</label>
                <input {...register("assistantName")} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                {errors.assistantName ? <p className="mt-1 text-xs text-red-400">{errors.assistantName.message}</p> : null}
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Avatar URL</label>
                <input {...register("avatarUrl")} placeholder="https://..." className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                {errors.avatarUrl ? <p className="mt-1 text-xs text-red-400">{errors.avatarUrl.message}</p> : null}
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Welcome Message</label>
                <input {...register("welcomeMessage")} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                {errors.welcomeMessage ? <p className="mt-1 text-xs text-red-400">{errors.welcomeMessage.message}</p> : null}
              </div>
            </div>
          </section>

          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-white">Behaviour</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">System Prompt</label>
                <textarea {...register("systemPrompt")} rows={5} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60 resize-y" />
                {errors.systemPrompt ? <p className="mt-1 text-xs text-red-400">{errors.systemPrompt.message}</p> : null}
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Out-of-Scope Reply</label>
                <textarea {...register("outOfScopeReply")} rows={2} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60 resize-y" />
                {errors.outOfScopeReply ? <p className="mt-1 text-xs text-red-400">{errors.outOfScopeReply.message}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Temperature</label>
                  <input type="number" step="0.1" min={0} max={1} {...register("temperature", { valueAsNumber: true })} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                  {errors.temperature ? <p className="mt-1 text-xs text-red-400">{errors.temperature.message}</p> : null}
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Max Tokens</label>
                  <input type="number" step="100" min={100} max={4000} {...register("maxTokens", { valueAsNumber: true })} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                  {errors.maxTokens ? <p className="mt-1 text-xs text-red-400">{errors.maxTokens.message}</p> : null}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Default Language</label>
                  <input {...register("defaultLanguage")} className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1">Voice ID</label>
                  <input {...register("voiceId")} placeholder="alloy" className="w-full bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                </div>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register("citeSources")} className="w-4 h-4 rounded accent-[#c8821a]" />
                  <span className="text-sm text-white/70">Cite sources ([S1], [S2]…)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" {...register("strictMode")} className="w-4 h-4 rounded accent-[#c8821a]" />
                  <span className="text-sm text-white/70">Strict mode (KB only)</span>
                </label>
              </div>
            </div>
          </section>

          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-white">Appearance</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Primary Colour</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formValues.primaryColour}
                    onChange={(event) => setValue("primaryColour", event.target.value, { shouldDirty: true })}
                    className="w-10 h-9 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input {...register("primaryColour")} className="flex-1 bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1">Accent Colour</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formValues.accentColour}
                    onChange={(event) => setValue("accentColour", event.target.value, { shouldDirty: true })}
                    className="w-10 h-9 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input {...register("accentColour")} className="flex-1 bg-white/[0.05] border border-white/[0.10] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#c8821a]/60" />
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Voice Settings</h2>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">Speed ({formValues.speed}×)</label>
              <input type="range" min={0.5} max={2} step={0.1} {...register("speed", { valueAsNumber: true })} className="w-full accent-[#c8821a]" />
            </div>
          </section>

          {mutationError ? (
            <p className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {mutationError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={updateAssistantConfigMutation.isPending || !isDirty}
            className="flex items-center gap-2 bg-[#c8821a] hover:bg-[#a86214] disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          >
            <Save className="w-4 h-4" />
            {updateAssistantConfigMutation.isPending ? "Saving…" : saved ? "Saved ✓" : "Save Settings"}
          </button>
        </form>
      )}
    </div>
  );
}
