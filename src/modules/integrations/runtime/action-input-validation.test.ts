import { describe, expect, it } from "vitest";
import { validateActionProps } from "@/modules/integrations/runtime/action-input-validation";

describe("integration action input validation", () => {
  const schema = {
    to: { required: true, type: "STRING" },
    count: { required: true, type: "NUMBER" },
    options: {
      type: "OBJECT",
      properties: {
        urgent: { required: true, type: "BOOLEAN" },
      },
    },
  };

  it("rejects missing required values", () => {
    expect(validateActionProps(schema, { count: 2 })).toEqual(["to is required"]);
  });

  it("rejects primitive type mismatches and nested invalid values", () => {
    expect(validateActionProps(schema, {
      to: 42,
      count: "2",
      options: { urgent: "yes" },
    })).toEqual([
      "to must be of type STRING",
      "count must be of type NUMBER",
      "options.urgent must be of type BOOLEAN",
    ]);
  });
});

  it("allows extra properties for forward compatibility by default", () => {
    expect(validateActionProps(schema, {
      to: "user@example.com",
      count: 1,
      options: { urgent: true },
      futureField: "accepted",
    })).toEqual([]);
  });
  it("rejects unknown properties in strict mode", () => {
    expect(validateActionProps(schema, {
      to: "user@example.com",
      count: 1,
      options: { urgent: true, unexpected: "blocked" },
      futureField: "blocked",
    }, true)).toEqual([
      "futureField is not allowed",
      "options.unexpected is not allowed",
    ]);
  });
