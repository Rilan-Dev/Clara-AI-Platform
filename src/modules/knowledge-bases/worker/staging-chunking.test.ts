import { describe, expect, it } from "vitest";
import { resolveIngestChunkingFlags } from "./staging-chunking";

const target = {
  id: "11111111-2222-4333-8444-555555555555",
  name: "RAG-STAGING-DO42-Isolated",
  status: "active",
};
const selected = {
  RAG_STAGING_PAGE_SECTION_CHUNKING: "true",
  RAG_STAGING_KB_ID: target.id,
};

describe("single-KB page+section ingestion canary", () => {
  it("leaves legacy ingestion completely unchanged without operator opt-in", () => {
    expect(resolveIngestChunkingFlags(target, {})).toEqual({
      pageAware: false, sectionAware: false, stagingOverride: false,
    });
  });

  it("enables page and section metadata together only for the exact active staging KB", () => {
    expect(resolveIngestChunkingFlags(target, selected)).toEqual({
      pageAware: true, sectionAware: true, stagingOverride: true,
    });
  });

  it("rejects any different tenant KB even with the same staging prefix", () => {
    const other = {...target, id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"};
    expect(resolveIngestChunkingFlags(other, selected).stagingOverride).toBe(false);
    expect(resolveIngestChunkingFlags(other, selected).pageAware).toBe(false);
  });

  it("rejects production KBs, archived staging KBs and misleading names", () => {
    for (const kb of [
      {...target, name: "Customer Production KB"},
      {...target, name: "RAG-STAGING"},
      {...target, name: "my-RAG-STAGING-DO42"},
      {...target, status: "archived"},
    ]) expect(resolveIngestChunkingFlags(kb, selected).stagingOverride).toBe(false);
  });

  it("fails closed for missing, malformed or partial operator settings", () => {
    for(const env of [
      {RAG_STAGING_PAGE_SECTION_CHUNKING:"true"},
      {RAG_STAGING_KB_ID:target.id},
      {...selected,RAG_STAGING_PAGE_SECTION_CHUNKING:"TRUE"},
      {...selected,RAG_STAGING_KB_ID:"not-a-uuid"},
      {...selected,RAG_STAGING_KB_ID:target.id.slice(0,-1)},
    ]) expect(resolveIngestChunkingFlags(target, env).stagingOverride).toBe(false);
  });

  it("preserves pre-existing global rollout semantics independently", () => {
    expect(resolveIngestChunkingFlags(target,{
      RAG_SOURCE_PAGE_CHUNKING:"true",RAG_SECTION_AWARE_CHUNKING:"false",
    })).toEqual({pageAware:true,sectionAware:false,stagingOverride:false});
    expect(resolveIngestChunkingFlags({...target,name:"Production"},{
      ...selected,RAG_SOURCE_PAGE_CHUNKING:"false",RAG_SECTION_AWARE_CHUNKING:"true",
    })).toEqual({pageAware:false,sectionAware:true,stagingOverride:false});
  });

  it("accepts UUID case equivalence without allowing a partial match", () => {
    expect(resolveIngestChunkingFlags(target,{
      ...selected,RAG_STAGING_KB_ID:target.id.toUpperCase(),
    }).stagingOverride).toBe(true);
  });
});
