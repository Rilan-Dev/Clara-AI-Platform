"use client";

import { useAssistantContext } from "../context/AssistantProvider";

export function useAssistant() {
  return useAssistantContext();
}
