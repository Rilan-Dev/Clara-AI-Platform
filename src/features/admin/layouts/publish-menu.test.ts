import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (name: string) =>
  readFileSync(resolve(__dirname, name), "utf8");

const menuSource = read("publish-menu.tsx");
const reviewSource = read("publish-review-dialog.tsx");
const topbarSource = read("agent-topbar.tsx");
const publishScreenSource = read(
  "../screens/agent-workspace/publish-screen.tsx",
);
const versionsScreenSource = read(
  "../screens/agent-workspace/versions-screen.tsx",
);

describe("PublishMenu (topbar Publish update dropdown)", () => {
  it("carries every menu action the design requires, with exact labels", () => {
    for (const label of [
      "View pending changes",
      "Publish to a new branch",
      "Deploy traffic",
      "View all branches",
      "Copy shareable link",
      "Copy version permalink",
      "Discard changes",
    ]) {
      // Menu items render the label as JSX children on its own line.
      expect(menuSource).toMatch(new RegExp(`^\\s*${label}\\s*$`, "m"));
    }
  });

  it("shows draft-only actions (View pending changes, Discard changes) only when drafts exist", () => {
    // Both items live inside the hasPendingChanges guard.
    expect(menuSource).toMatch(/\{hasPendingChanges &&[\s\S]*?View pending changes/);
    expect(menuSource).toMatch(/\{hasPendingChanges &&[\s\S]*?Discard changes/);
    // The gate is wired from the topbar's draftEditedSinceVersion signal.
    expect(topbarSource).toContain("hasPendingChanges={!!draftEditedSinceVersion}");
  });

  it("is attached to the Publish update button as a split-button chevron", () => {
    expect(topbarSource).toMatch(/rounded-r-none/);
    expect(topbarSource).toContain('<PublishMenu');
    expect(menuSource).toMatch(/aria-haspopup="menu"/);
    expect(menuSource).toMatch(/aria-expanded=\{open\}/);
  });

  it("closes on outside click and Escape", () => {
    expect(menuSource).toMatch(/document\.addEventListener\("mousedown", onClick\)/);
    expect(menuSource).toMatch(/e\.key === "Escape"/);
  });

  it("copies the stable published page link directly — no explore-link minting detour", () => {
    // The owner asked for the shareable PUBLISHED link to be copied directly
    // instead of routing through the Publish tab's Generate-explore-link flow.
    expect(menuSource).toMatch(/\/agents\/\$\{agentId\}/);
    expect(menuSource).not.toMatch(/generateAgentExploreLink/);
    expect(menuSource).toMatch(/Shareable link copied/);
  });

  it("pins the version permalink to the exact live version", () => {
    expect(menuSource).toMatch(/\/agents\/\$\{agentId\}\?v=\$\{deployment\.versionNumber\}/);
    expect(menuSource).toMatch(/Version permalink copied/);
  });

  it("disables copy actions until the agent is published", () => {
    expect(menuSource).toMatch(/disabled=\{!deployment\}/);
    expect(menuSource).toMatch(/Publish first — nothing is live yet/);
  });

  it("navigates View all branches / Publish to a new branch to the Branches page", () => {
    expect(menuSource).toMatch(/\/orgs\/\$\{orgId\}\/agents\/\$\{agentId\}\/versions/);
    expect(menuSource).toMatch(/goVersions\(true\)/);
    expect(menuSource).toMatch(/\?create=1/);
  });

  it("routes production traffic by re-publishing the selected version (access mode preserved)", () => {
    expect(menuSource).toMatch(
      /publishAgentVersion\(agentId, selected, deployment\?\.publicAccess \?\? true\)/,
    );
    expect(menuSource).not.toMatch(/rollbackAgent\(/); // rollbackAgent hard-codes public access ON
  });

  it("discards changes by resetting the draft to the current version's configuration", () => {
    expect(menuSource).toMatch(/fetchAgentVersion\(agentId, currentVersion\.id\)/);
    expect(menuSource).toMatch(/putAgentDraft\(agentId, version\.configuration\)/);
    // Reload guarantees open editors drop the discarded local state.
    expect(menuSource).toMatch(/window\.location\.reload\(\)/);
    // Workspace surfaces are refreshed through the established events.
    expect(menuSource).toMatch(/agent-workspace:refresh/);
    expect(menuSource).toMatch(/agent-workspace:draft-updated/);
  });

  it("is provider-neutral — no AI provider or transport imports", () => {
    expect(menuSource).not.toMatch(/from "@\/modules\/(ai-core|voice-core|assistant)/);
    expect(reviewSource).not.toMatch(/from "@\/modules\/(ai-core|voice-core|assistant)/);
  });
});

describe("Review Changes dialog (View pending changes)", () => {
  it("follows the design: title, subtitle, publishing target, commit message, two tabs", () => {
    expect(reviewSource).toContain("Review Changes");
    expect(reviewSource).toContain("Review draft changes before publishing");
    expect(reviewSource).toContain("Publishing to");
    expect(reviewSource).toContain("Commit message");
    // Tab labels render as JSX children right before their updated chip.
    expect(reviewSource).toMatch(/Overview\s*\{updated &&/);
    expect(reviewSource).toMatch(/Raw JSON\s*\{jsonHasChanges &&/);
    expect(reviewSource).toContain("Cancel");
  });

  it("shows the updated chip on tabs when changes exist", () => {
    expect(reviewSource).toMatch(/\{updated && <UpdatedChip \/>}/);
    expect(reviewSource).toMatch(/\{jsonHasChanges && <UpdatedChip \/>}/);
  });

  it("publishes the draft as a version with the commit message, then routes production", () => {
    expect(reviewSource).toMatch(
      /saveAgentVersion\(agentId, effectiveCommitMessage\.trim\(\) \|\| null\)/,
    );
    expect(reviewSource).toMatch(
      /publishAgentVersion\(agentId, version\.id, deployment\?\.publicAccess \?\? true\)/,
    );
  });

  it("fetches the semantic diff AND both raw configurations in parallel", () => {
    expect(reviewSource).toMatch(/fetchAgentDiff\(agentId, currentVersion\.id, "draft"\)/);
    expect(reviewSource).toMatch(/fetchAgentVersion\(agentId, currentVersion\.id\)/);
    expect(reviewSource).toMatch(/fetchAgentDraft\(agentId\)/);
    expect(reviewSource).toMatch(/Promise\.all\(/);
  });

  it("Overview tab shows strikeouts and a split view for long values", () => {
    expect(reviewSource).toMatch(/line-through/);
    expect(reviewSource).toMatch(/SPLIT_VALUE_THRESHOLD = 100/);
    expect(reviewSource).toMatch(/Published version/);
    expect(reviewSource).toMatch(/Current changes/);
  });

  it("Raw JSON tab renders the side-by-side line diff with Expand-N-lines affordance", () => {
    expect(reviewSource).toMatch(/Expand \{segment\.count\} line/);
    expect(reviewSource).toMatch(/buildSideBySideRows/);
    expect(reviewSource).toMatch(/collapseUnchangedRuns/);
    expect(reviewSource).toMatch(/stringifyForDiff/);
  });

  it("suggests a commit message from the changed fields but lets the user edit it", () => {
    expect(reviewSource).toMatch(/suggestedCommitMessage/);
    expect(reviewSource).toMatch(/setCommitTouched\(true\)/);
  });
});

describe("Topbar wiring (agent-topbar.tsx)", () => {
  it("replaces the old pending-changes drawer with the Review Changes modal", () => {
    expect(topbarSource).toContain("<ReviewChangesDialog");
    expect(topbarSource).not.toContain("DraftChangesDrawer");
    expect(topbarSource).not.toContain("Pending changes</h2>");
  });

  it("keeps the Draft changes pill opening the same review modal", () => {
    expect(topbarSource).toMatch(/setDiffOpen\(true\)/);
    expect(topbarSource).toMatch(/onViewPendingChanges=\{\(\) => setDiffOpen\(true\)\}/);
  });

  it("keeps the one-click publish on the primary button (unchanged semantics)", () => {
    expect(topbarSource).toMatch(/onClick=\{\(\) => void publishNow\(\)\}/);
    expect(topbarSource).toMatch(/deployment \? "Publish update" : "Publish"/);
  });
});

describe("Publish screen (Open the published preview removal)", () => {
  it("no longer carries the duplicate preview button — the navbar owns previewing", () => {
    expect(publishScreenSource).not.toContain("Open the published preview");
    expect(publishScreenSource).not.toContain("previewHref");
  });

  it("mentions the dropdown menu in the guidance callout", () => {
    expect(publishScreenSource).toContain("dropdown menu also carries");
    expect(publishScreenSource).toContain("Deploy traffic");
  });
});

describe("Branches page (?create=1 deep link)", () => {
  it("opens the create-branch drawer from the Publish menu deep link, then cleans the URL", () => {
    expect(versionsScreenSource).toMatch(/searchParams\.get\("create"\) === "1"/);
    expect(versionsScreenSource).toMatch(/openCreateBranch\(\)/);
    expect(versionsScreenSource).toMatch(/router\.replace\(pathname\)/);
  });
});
