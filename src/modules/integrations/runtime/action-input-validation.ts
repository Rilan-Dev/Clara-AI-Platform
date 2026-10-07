export type ActionPropDefinition = {
  required?: boolean;
  type?: string;
  properties?: Record<string, ActionPropDefinition>;
};

const TYPE_CHECKS: Record<string, (value: unknown) => boolean> = {
  STRING: (value) => typeof value === "string",
  TEXT: (value) => typeof value === "string",
  SECRET: (value) => typeof value === "string",
  NUMBER: (value) => typeof value === "number" && Number.isFinite(value),
  BOOLEAN: (value) => typeof value === "boolean",
  ARRAY: (value) => Array.isArray(value),
  OBJECT: (value) => value !== null && typeof value === "object" && !Array.isArray(value),
};

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Validate the subset of Activepieces action schemas that is stable across
 * pieces. Unknown properties remain allowed for forward compatibility.
 */
export function validateActionProps(
  definitions: Record<string, unknown> | undefined,
  props: Record<string, unknown>,
  strict = false,
): string[] {
  if (!definitions || typeof definitions !== "object") return [];

  const errors: string[] = [];
  if (strict) {
    for (const name of Object.keys(props)) {
      if (!(name in definitions)) errors.push(`${name} is not allowed`);
    }
  }
  for (const [name, rawDefinition] of Object.entries(definitions)) {
    if (!rawDefinition || typeof rawDefinition !== "object") continue;
    const definition = rawDefinition as ActionPropDefinition;
    const value = props[name];

    if (definition.required && isMissing(value)) {
      errors.push(`${name} is required`);
      continue;
    }
    if (isMissing(value)) continue;

    const type = definition.type?.toUpperCase();
    const check = type ? TYPE_CHECKS[type] : undefined;
    if (check && !check(value)) {
      errors.push(`${name} must be of type ${type}`);
      continue;
    }

    if (
      definition.properties &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      errors.push(
        ...validateActionProps(
          definition.properties,
          value as Record<string, unknown>,
          strict,
        ).map((error) => `${name}.${error}`),
      );
    }
  }
  return errors;
}
