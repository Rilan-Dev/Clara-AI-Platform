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

  it("rejects non-object action props before schema traversal", () => {
    expect(validateActionProps(schema, null, true)).toEqual(["props must be an object"]);
    expect(validateActionProps(schema, ["unexpected"], true)).toEqual(["props must be an object"]);
  });

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

  it("rejects null, empty, and wrong-typed primitive array items", () => {
    const arraySchema = {
      tags: {
        required: true,
        type: "ARRAY",
        items: { type: "STRING" },
      },
      counts: {
        type: "ARRAY",
        items: { type: "NUMBER" },
      },
    };

    expect(validateActionProps(arraySchema, {
      tags: ["ok", null, ""],
      counts: [1, "2", null],
    }, true)).toEqual([
      "tags[1] must be of type STRING",
      "tags[2] must be of type STRING",
      "counts[1] must be of type NUMBER",
      "counts[2] must be of type NUMBER",
    ]);
  });

  it("validates array item schemas and nested strict properties", () => {
    const arraySchema = {
      recipients: {
        required: true,
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            email: { required: true, type: "STRING" },
            priority: { type: "NUMBER" },
          },
        },
      },
    };

    expect(validateActionProps(arraySchema, {
      recipients: [
        { email: "ok@example.com", priority: 1 },
        { priority: "high", unexpected: true },
      ],
    }, true)).toEqual([
      "recipients[1].unexpected is not allowed",
      "recipients[1].email is required",
      "recipients[1].priority must be of type NUMBER",
    ]);
  });
});
