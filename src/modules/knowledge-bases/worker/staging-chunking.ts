/**
 * One-KB canary override for page-aware section ingestion. Disabled by default.
 *
 * The global feature flags remain unchanged. To run a disposable staging KB,
 * an operator must explicitly set BOTH:
 *   RAG_STAGING_PAGE_SECTION_CHUNKING=true
 *   RAG_STAGING_KB_ID=<exact UUID of RAG-STAGING-* KB>
 *
 * The isolated match prevents reindexing any other tenant or production KB.
 * This helper does not grant KB permissions or change provider configuration.
 */
/** Env entries may be absent; ProcessEnv and narrow test fixture objects both satisfy this. */
type IngestFlags = Record<string, string | undefined>;
type Target = { id: string; name: string; status?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveIngestChunkingFlags(
  kb: Target,
  env: IngestFlags = process.env,
): { pageAware: boolean; sectionAware: boolean; stagingOverride: boolean } {
  const globalPage = env.RAG_SOURCE_PAGE_CHUNKING === "true";
  const globalSection = env.RAG_SECTION_AWARE_CHUNKING === "true";
  const configuredId = env.RAG_STAGING_KB_ID?.trim() ?? "";
  const stagingOverride =
    env.RAG_STAGING_PAGE_SECTION_CHUNKING === "true" &&
    UUID.test(configuredId) &&
    kb.id.toLowerCase() === configuredId.toLowerCase() &&
    kb.name.startsWith("RAG-STAGING-") &&
    kb.status === "active";
  return {
    pageAware: globalPage || stagingOverride,
    sectionAware: globalSection || stagingOverride,
    stagingOverride,
  };
}
