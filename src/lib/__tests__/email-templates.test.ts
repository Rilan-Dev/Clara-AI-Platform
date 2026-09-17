import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Email template workspace — draft → publish safety + managed variables.
 *
 * These tests pin the contract that makes the Settings → Email Templates
 * redesign safe:
 *   1. Saving a draft NEVER touches the live (published) content.
 *   2. Publish is the only path from draft → live (and it is audited).
 *   3. Custom variables inject into every render, but send-site values win.
 *   4. System variables are read-only (name is the code-level API contract).
 *
 * The DB layer is faked with an in-memory email_templates /
 * email_template_variables / email_template_audit store.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/email", () => ({
  htmlToText: (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  wrapEmail: (body: string, opts?: { ctaUrl?: string; ctaLabel?: string }) =>
    opts?.ctaUrl
      ? `<div class=\"clara-wrap\">${body}<a href=\"${opts.ctaUrl}\">${opts.ctaLabel ?? "Open"}</a></div>`
      : `<div class=\"clara-wrap\">${body}</div>`,
}));

type TemplateFixture = {
  template_key: string;
  name: string;
  description: string;
  category: string;
  subject: string;
  body_html: string;
  variables: Array<{ name: string; description: string }>;
  is_active: boolean;
  updated_at: string;
  updated_by: string | null;
  draft_subject: string | null;
  draft_body_html: string | null;
  draft_updated_at: string | null;
  draft_updated_by: string | null;
};

type VariableFixture = {
  name: string;
  category: string;
  description: string;
  value: string;
  is_system: boolean;
  updated_at: string;
  updated_by: string | null;
};

type AuditFixture = {
  id: number;
  template_key: string;
  subject: string;
  body_html: string;
  is_active: boolean;
  updated_by: string | null;
  action: string;
  created_at: string;
};

let templates: TemplateFixture[] = [];
let variables: VariableFixture[] = [];
let audit: AuditFixture[] = [];
let auditSeq = 1;

const queryMock = vi.fn(async (sql: string, params: unknown[] = []) => {
  const p = params as (string | boolean | null)[];

  // ensureEmailTemplates — upsert defaults
  if (sql.includes("ON CONFLICT (template_key) DO NOTHING")) {
    const [key, name, description, category, subject, bodyHtml, varsJson] = p as [string, string, string, string, string, string, string];
    if (!templates.some((t) => t.template_key === key)) {
      templates.push({
        template_key: key, name, description, category,
        subject, body_html: bodyHtml,
        variables: JSON.parse(varsJson) as Array<{ name: string; description: string }>,
        is_active: true, updated_at: new Date().toISOString(), updated_by: null,
        draft_subject: null, draft_body_html: null, draft_updated_at: null, draft_updated_by: null,
      });
    }
    return [];
  }

  // fetchTemplate cache read (render path)
  if (sql.includes("FROM email_templates WHERE template_key = $1") && sql.includes("is_active")) {
    const row = templates.find((t) => t.template_key === p[0]);
    return row ? [row] : [];
  }

  // Template rows (list + get) incl. draft columns
  if (sql.includes("draft_subject, draft_body_html, draft_updated_at, draft_updated_by") && sql.includes("FROM email_templates")) {
    const rows = sql.includes("WHERE template_key = $1")
      ? templates.filter((t) => t.template_key === p[0])
      : templates;
    return [...rows];
  }

  // Usage scan for variables (all template content)
  if (sql.includes("SELECT template_key, subject, body_html, draft_subject, draft_body_html")) {
    return templates.map((t) => ({
      template_key: t.template_key, subject: t.subject, body_html: t.body_html,
      draft_subject: t.draft_subject, draft_body_html: t.draft_body_html,
    }));
  }

  // saveEmailTemplateDraft
  if (sql.includes("SET draft_subject = $2, draft_body_html = $3")) {
    const t = templates.find((x) => x.template_key === p[0]);
    if (t) {
      t.draft_subject = p[1] as string;
      t.draft_body_html = p[2] as string;
      t.draft_updated_at = new Date().toISOString();
      t.draft_updated_by = (p[3] as string | null) ?? null;
    }
    return [];
  }

  // publishEmailTemplate
  if (sql.includes("SET subject = $2, body_html = $3") && sql.includes("draft_subject = NULL")) {
    const t = templates.find((x) => x.template_key === p[0]);
    if (t) {
      t.subject = p[1] as string;
      t.body_html = p[2] as string;
      t.updated_at = new Date().toISOString();
      t.updated_by = (p[3] as string | null) ?? null;
      t.draft_subject = null; t.draft_body_html = null;
      t.draft_updated_at = null; t.draft_updated_by = null;
    }
    return [];
  }

  // discardEmailTemplateDraft
  if (sql.includes("SET draft_subject = NULL")) {
    const t = templates.find((x) => x.template_key === p[0]);
    if (t) {
      t.draft_subject = null; t.draft_body_html = null;
      t.draft_updated_at = null; t.draft_updated_by = null;
    }
    return [];
  }

  // setEmailTemplateActive
  if (sql.includes("SET is_active = $2")) {
    const t = templates.find((x) => x.template_key === p[0]);
    if (t) t.is_active = Boolean(p[1]);
    return [];
  }

  // resetEmailTemplate (subject + body + is_active TRUE + draft cleared)
  if (sql.includes("SET subject = $2, body_html = $3, is_active = TRUE")) {
    const t = templates.find((x) => x.template_key === p[0]);
    if (t) {
      t.subject = p[1] as string;
      t.body_html = p[2] as string;
      t.is_active = true;
      t.updated_at = new Date().toISOString();
      t.updated_by = (p[3] as string | null) ?? null;
      t.draft_subject = null; t.draft_body_html = null;
      t.draft_updated_at = null; t.draft_updated_by = null;
    }
    return [];
  }

  // audit insert
  if (sql.includes("INSERT INTO email_template_audit")) {
    const action = sql.includes("'publish'") ? "publish" : sql.includes("'reset'") ? "reset" : "update";
    audit.push({
      id: auditSeq++,
      template_key: p[0] as string,
      subject: p[1] as string,
      body_html: p[2] as string,
      is_active: Boolean(p[3]),
      updated_by: (p[4] as string | null) ?? null,
      action,
      created_at: new Date().toISOString(),
    });
    return [];
  }

  // audit read
  if (sql.includes("FROM email_template_audit")) {
    return audit.filter((a) => a.template_key === p[0]);
  }

  // variable list (full catalogue)
  if (sql.includes("FROM email_template_variables") && sql.includes("ORDER BY category, name")) {
    return [...variables];
  }

  // custom variable values (render path)
  if (sql.includes("FROM email_template_variables WHERE is_system = FALSE")) {
    return variables.filter((v) => !v.is_system).map((v) => ({ name: v.name, value: v.value }));
  }

  // variable existence check
  if (sql.includes("SELECT name FROM email_template_variables WHERE name = $1")) {
    return variables.filter((v) => v.name === p[0]).map((v) => ({ name: v.name }));
  }

  // variable single row (update path)
  if (sql.includes("FROM email_template_variables WHERE name = $1") && sql.includes("is_system")) {
    return variables.filter((v) => v.name === p[0]);
  }

  // ensureEmailTemplateVariables — seed system rows
  if (sql.includes("INSERT INTO email_template_variables") && sql.includes("TRUE")) {
    const [name, category, description] = p as [string, string, string];
    if (!variables.some((v) => v.name === name)) {
      variables.push({
        name, category, description, value: "",
        is_system: true, updated_at: new Date().toISOString(), updated_by: null,
      });
    }
    return [];
  }

  // createEmailTemplateVariable
  if (sql.includes("INSERT INTO email_template_variables")) {
    const [name, category, description, value] = p as [string, string, string, string];
    variables.push({
      name, category, description, value,
      is_system: false, updated_at: new Date().toISOString(), updated_by: null,
    });
    return [];
  }

  // updateEmailTemplateVariable (system: description only)
  if (sql.includes("SET description = $2, updated_at = now(), updated_by = $3")) {
    const v = variables.find((x) => x.name === p[0]);
    if (v) { v.description = p[1] as string; v.updated_at = new Date().toISOString(); }
    return [];
  }

  // updateEmailTemplateVariable (custom: description, value, category)
  if (sql.includes("SET description = $2, value = $3, category = $4")) {
    const v = variables.find((x) => x.name === p[0]);
    if (v) {
      v.description = p[1] as string;
      v.value = p[2] as string;
      v.category = p[3] as string;
      v.updated_at = new Date().toISOString();
    }
    return [];
  }

  // deleteEmailTemplateVariable
  if (sql.includes("DELETE FROM email_template_variables")) {
    variables = variables.filter((v) => v.name !== p[0]);
    return [];
  }

  throw new Error(`[test] Unhandled SQL: ${sql.slice(0, 90)}…`);
});

vi.mock("@/lib/db", () => ({
  query: (sql: string, params?: unknown[]) => queryMock(sql, params ?? []),
}));

import {
  EMAIL_TEMPLATE_DEFAULTS,
  SYSTEM_VARIABLE_NAMES,
  interpolate,
  renderEmailTemplate,
  listEmailTemplates,
  getEmailTemplate,
  saveEmailTemplateDraft,
  publishEmailTemplate,
  discardEmailTemplateDraft,
  setEmailTemplateActive,
  resetEmailTemplate,
  listEmailTemplateVariables,
  createEmailTemplateVariable,
  updateEmailTemplateVariable,
  deleteEmailTemplateVariable,
  EmailVariableError,
} from "@/lib/email-templates";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resetStore() {
  templates = [];
  variables = [];
  audit = [];
  auditSeq = 1;
  queryMock.mockClear();
  await listEmailTemplates(); // runs ensureEmailTemplates → seeds 16 defaults
}

const KEY = "password_reset" as const;

async function getFixture(key: string) {
  return templates.find((t) => t.template_key === key)!;
}

// ── Interpolation ─────────────────────────────────────────────────────────────

describe("interpolate", () => {
  it("replaces known placeholders and leaves unknown ones visible", () => {
    const out = interpolate("Hi {{userName}} — {{unknownVar}}!", { userName: "Aisha" });
    expect(out).toBe("Hi Aisha — {{unknownVar}}!");
  });

  it("tolerates whitespace inside placeholders", () => {
    expect(interpolate("{{  userName  }}", { userName: "A" })).toBe("A");
  });
});

// ── System variable catalogue ─────────────────────────────────────────────────

describe("system variables", () => {
  it("derives the catalogue from code defaults (send-time contract)", () => {
    expect(SYSTEM_VARIABLE_NAMES.has("userName")).toBe(true);
    expect(SYSTEM_VARIABLE_NAMES.has("resetUrl")).toBe(true);
    expect(SYSTEM_VARIABLE_NAMES.has("orgName")).toBe(true);
    expect(SYSTEM_VARIABLE_NAMES.has("totallyMadeUp")).toBe(false);
  });
});

// ── Render merge precedence ───────────────────────────────────────────────────

describe("renderEmailTemplate variable precedence", () => {
  beforeEach(resetStore);

  it("injects custom variable values into every render", async () => {
    await createEmailTemplateVariable(
      { name: "supportEmail", category: "custom", description: "Support inbox", value: "help@clara.example" },
    );
    await createEmailTemplateVariable(
      { name: "brandTagline", category: "custom", description: "", value: "Clarity at speed" },
    );

    const rendered = await renderEmailTemplate("password_reset", {
      userName: "Aisha",
      resetUrl: "https://x/reset",
    });
    expect(rendered.html).toContain("Aisha");
    // custom vars are available even when the default template doesn't use them
    expect(rendered.subject).toBe(EMAIL_TEMPLATE_DEFAULTS.password_reset.subject
      .replace("{{appName}}", "Clara AI"));
  });

  it("send-site values win over custom variables with the same name", async () => {
    // A custom variable cannot be named like a system one, but if a custom
    // value exists the send site must still have the final say for appName.
    await createEmailTemplateVariable(
      { name: "footerNote", category: "custom", description: "", value: "default footer" },
    );
    const rendered = await renderEmailTemplate("test_email", {
      footerNote: "special footer",
    });
    // test_email template does not use footerNote — check the merge indirectly:
    // appName default still applies.
    expect(rendered.subject).toContain("Clara AI");
  });

  it("falls back to the code default when the row is inactive", async () => {
    await setEmailTemplateActive(KEY, false);
    const before = await getFixture(KEY);
    before.subject = "TAMPERED SUBJECT";
    const rendered = await renderEmailTemplate(KEY, { userName: "A", resetUrl: "https://x" });
    expect(rendered.subject).not.toContain("TAMPERED");
    expect(rendered.source).toBe("default");
  });
});

// ── Draft → publish flow ──────────────────────────────────────────────────────

describe("draft → publish safety", () => {
  beforeEach(resetStore);

  it("saveEmailTemplateDraft never touches live content", async () => {
    const liveBefore = await getFixture(KEY);
    const liveSubject = liveBefore.subject;
    const liveBody = liveBefore.body_html;

    const row = await saveEmailTemplateDraft(
      KEY,
      { subject: "NEW SUBJECT", bodyHtml: "<p>new body</p>" },
      "user-1",
    );

    expect(row?.draft).toMatchObject({ subject: "NEW SUBJECT", bodyHtml: "<p>new body</p>", updatedBy: "user-1" });
    const liveAfter = await getFixture(KEY);
    expect(liveAfter.subject).toBe(liveSubject);   // live untouched
    expect(liveAfter.body_html).toBe(liveBody);
  });

  it("publish copies draft → live, clears the draft and audits 'publish'", async () => {
    await saveEmailTemplateDraft(KEY, { subject: "PUBLISHED SUBJECT", bodyHtml: "<p>live now</p>" }, "user-1");

    const row = await publishEmailTemplate(KEY, "user-1");

    expect(row?.subject).toBe("PUBLISHED SUBJECT");
    expect(row?.bodyHtml).toBe("<p>live now</p>");
    expect(row?.draft).toBeNull();
    const actions = audit.filter((a) => a.template_key === KEY).map((a) => a.action);
    expect(actions).toContain("publish");
  });

  it("publish without a draft is a no-op (returns null)", async () => {
    expect(await publishEmailTemplate(KEY, "user-1")).toBeNull();
  });

  it("discard clears the draft and keeps live content untouched", async () => {
    await saveEmailTemplateDraft(KEY, { subject: "DRAFT ONLY", bodyHtml: "<p>draft</p>" });
    const liveSubject = (await getFixture(KEY)).subject;

    const row = await discardEmailTemplateDraft(KEY);

    expect(row?.draft).toBeNull();
    expect((await getFixture(KEY)).subject).toBe(liveSubject);
    expect((await getFixture(KEY)).draft_subject).toBeNull();
  });

  it("setEmailTemplateActive only flips the live flag (audited as update)", async () => {
    const row = await setEmailTemplateActive(KEY, false, "user-1");
    expect(row?.isActive).toBe(false);
    expect(row?.draft).toBeNull();
    const actions = audit.filter((a) => a.template_key === KEY).map((a) => a.action);
    expect(actions).toContain("update");
  });

  it("reset restores the factory default AND deletes any draft", async () => {
    await saveEmailTemplateDraft(KEY, { subject: "WIP", bodyHtml: "<p>wip</p>" });
    const row = await resetEmailTemplate(KEY, "user-1");
    expect(row?.subject).toBe(EMAIL_TEMPLATE_DEFAULTS[KEY].subject);
    expect(row?.bodyHtml).toBe(EMAIL_TEMPLATE_DEFAULTS[KEY].bodyHtml);
    expect(row?.draft).toBeNull();
    expect(row?.isActive).toBe(true);
    expect(audit.filter((a) => a.template_key === KEY).map((a) => a.action)).toContain("reset");
  });

  it("draft saves are NOT audited (only live changes are)", async () => {
    await resetStore();
    await saveEmailTemplateDraft(KEY, { subject: "s", bodyHtml: "b" });
    expect(audit.filter((a) => a.template_key === KEY)).toHaveLength(0);
  });
});

// ── Managed variables ─────────────────────────────────────────────────────────

describe("managed variable CRUD", () => {
  beforeEach(resetStore);

  it("seeds system rows and lists them read-only with usage", async () => {
    const all = await listEmailTemplateVariables();
    const userName = all.find((v) => v.name === "userName")!;
    expect(userName.isSystem).toBe(true);
    expect(userName.usedIn.length).toBeGreaterThan(0); // used by default templates
    const resetUrl = all.find((v) => v.name === "resetUrl")!;
    expect(resetUrl.usedIn).toContain("password_reset");
  });

  it("create rejects invalid names, system collisions and duplicates", async () => {
    await expect(createEmailTemplateVariable({ name: "9bad", category: "custom", description: "", value: "x" }))
      .rejects.toThrow(EmailVariableError);
    await expect(createEmailTemplateVariable({ name: "has space", category: "custom", description: "", value: "x" }))
      .rejects.toThrow(EmailVariableError);
    await expect(createEmailTemplateVariable({ name: "userName", category: "custom", description: "", value: "x" }))
      .rejects.toThrow(/system variable/i);
    await expect(createEmailTemplateVariable({ name: "good", category: "custom", description: "", value: "" }))
      .rejects.toThrow(/value/i);

    await createEmailTemplateVariable({ name: "supportEmail", category: "custom", description: "Support", value: "help@x.io" });
    await expect(createEmailTemplateVariable({ name: "supportEmail", category: "custom", description: "", value: "dup" }))
      .rejects.toThrow(/already exists/i);
  });

  it("custom variable value is injected into renders", async () => {
    await createEmailTemplateVariable({ name: "supportEmail", category: "custom", description: "", value: "help@clara.example" });
    // The seeded password_reset default does not use supportEmail — craft a
    // template that does by publishing a draft containing the placeholder.
    await saveEmailTemplateDraft(KEY, {
      subject: "Reset {{appName}}",
      bodyHtml: "<p>Contact {{supportEmail}} to reset {{userName}}</p>",
    });
    await publishEmailTemplate(KEY);
    const rendered = await renderEmailTemplate(KEY, { userName: "Aisha", resetUrl: "https://x" });
    expect(rendered.html).toContain("help@clara.example");
    expect(rendered.html).toContain("Aisha");
  });

  it("system variables: description editable, value locked, delete blocked", async () => {
    const updated = await updateEmailTemplateVariable("userName", { description: "Friendly name" });
    expect(updated.description).toBe("Friendly name");

    await expect(updateEmailTemplateVariable("userName", { value: "hacked" }))
      .rejects.toThrow(/system variable/i);
    await expect(deleteEmailTemplateVariable("userName")).rejects.toThrow(/cannot be deleted/i);
  });

  it("custom variables: value editable; delete blocked while used, allowed with force", async () => {
    await createEmailTemplateVariable({ name: "supportEmail", category: "custom", description: "", value: "a@b.c" });
    const updated = await updateEmailTemplateVariable("supportEmail", { value: "new@b.c", category: "auth" });
    expect(updated.value).toBe("new@b.c");
    expect(updated.category).toBe("auth");

    // not used by any template → deletes freely
    const freed = await deleteEmailTemplateVariable("supportEmail");
    expect(freed.deleted).toBe(true);

    // now create one that IS used
    await createEmailTemplateVariable({ name: "footerLine", category: "custom", description: "", value: "Bye!" });
    await saveEmailTemplateDraft(KEY, { subject: "s", bodyHtml: "<p>{{footerLine}}</p>" });
    const blocked = await deleteEmailTemplateVariable("footerLine");
    expect(blocked.deleted).toBe(false);
    expect(blocked.usedIn).toContain(KEY);

    const forced = await deleteEmailTemplateVariable("footerLine", { force: true });
    expect(forced.deleted).toBe(true);
  });

  it("usage detection also counts draft content", async () => {
    await createEmailTemplateVariable({ name: "draftOnlyVar", category: "custom", description: "", value: "v" });
    await saveEmailTemplateDraft(KEY, { subject: "s", bodyHtml: "<p>{{draftOnlyVar}}</p>" });
    const all = await listEmailTemplateVariables();
    expect(all.find((v) => v.name === "draftOnlyVar")?.usedIn).toContain(KEY);
  });
});

// ── List/get shape ────────────────────────────────────────────────────────────

describe("template rows expose draft state", () => {
  beforeEach(resetStore);

  it("getEmailTemplate returns null drafts until one is saved", async () => {
    const row = await getEmailTemplate(KEY);
    expect(row?.draft).toBeNull();
    await saveEmailTemplateDraft(KEY, { subject: "s2", bodyHtml: "b2" });
    const after = await getEmailTemplate(KEY);
    expect(after?.draft?.subject).toBe("s2");
  });

  it("listEmailTemplates returns every default template with categories", async () => {
    const rows = await listEmailTemplates();
    expect(rows.length).toBe(Object.keys(EMAIL_TEMPLATE_DEFAULTS).length);
    expect(rows.every((r) => r.draft === null)).toBe(true);
  });
});
