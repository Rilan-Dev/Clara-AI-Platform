"use client";

import { Badge } from "@/components/ui/badge";
import type { MessageRole } from "@/modules/assistant/core";

export function RoleBadge({ role }: { role: MessageRole }) {
  const isUser = role === "user";
  return (
    <Badge
      variant={isUser ? "secondary" : "default"}
      className={isUser ? "bg-secondary text-secondary-foreground" : undefined}
    >
      {isUser ? "You" : "Clara"}
    </Badge>
  );
}
