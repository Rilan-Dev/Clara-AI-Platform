import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({
  loadWebPage:vi.fn(),findDocumentBySourceUrl:vi.fn(),createDocument:vi.fn(),
  createIngestJob:vi.fn(),enqueueIngestJob:vi.fn(),
  getSessionById:vi.fn(),listIncludedPendingUrls:vi.fn(),
  markUrlScraping:vi.fn(),markUrlCompleted:vi.fn(),markUrlFailed:vi.fn(),
  markSessionCompleted:vi.fn(),markSessionFailed:vi.fn(),markSessionIngesting:vi.fn(),
  recalcSessionProgress:vi.fn(),publishScrapeSessionRefresh:vi.fn(),
}));
vi.mock("@/modules/admin/core/ingest/web-loader",()=>({
  loadWebPage:m.loadWebPage,
  WebLoadError:class WebLoadError extends Error {code="retry";retryable=false;},
}));
vi.mock("@/modules/knowledge-bases/core/documents-db",()=>({
  findDocumentBySourceUrl:m.findDocumentBySourceUrl,
  createDocument:m.createDocument,createIngestJob:m.createIngestJob,
}));
vi.mock("@/modules/knowledge-bases/core/scrape-sessions-db",()=>({
  getSessionById:m.getSessionById,listIncludedPendingUrls:m.listIncludedPendingUrls,
  markUrlScraping:m.markUrlScraping,markUrlCompleted:m.markUrlCompleted,
  markUrlFailed:m.markUrlFailed,markSessionCompleted:m.markSessionCompleted,
  markSessionFailed:m.markSessionFailed,markSessionIngesting:m.markSessionIngesting,
  recalcSessionProgress:m.recalcSessionProgress,
}));
vi.mock("@/modules/knowledge-bases/core/scrape-progress-stream",()=>({
  publishScrapeSessionRefresh:m.publishScrapeSessionRefresh,
}));
vi.mock("@/modules/cloud-jobs/queue",()=>({enqueueIngestJob:m.enqueueIngestJob}));
vi.mock("@/modules/knowledge-bases/worker/retry-scheduler",()=>({scheduleFailedUrlRetries:vi.fn()}));
import {runScrapeSession} from "./scrape-worker";
describe("web scraper to common document ingestion queue",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    m.getSessionById.mockResolvedValue({id:"session",kbId:"kb-1",status:"scraping",cancelRequested:false});
    m.listIncludedPendingUrls.mockResolvedValueOnce([{id:"url-1",url:"https://example.org/policy"}]).mockResolvedValue([]);
    m.findDocumentBySourceUrl.mockResolvedValue(null);
    m.loadWebPage.mockResolvedValue({url:"https://example.org/policy",title:"Policy",text:"DO.4.2 requires a policy.",metadata:{}});
    m.createDocument.mockResolvedValue({id:"doc-1"});
    m.createIngestJob.mockResolvedValue({id:"job-1"});
    m.enqueueIngestJob.mockResolvedValue(undefined);
    m.publishScrapeSessionRefresh.mockResolvedValue(undefined);
  });
  it("creates an ingestion job for a new page (same vector + optional graph pipeline as file upload)",async()=>{
    const result=await runScrapeSession("session");
    expect(result).toMatchObject({scraped:1,skipped:0,refreshed:0,failed:0});
    expect(m.createDocument).toHaveBeenCalledWith(expect.objectContaining({kbId:"kb-1",sourceType:"url"}));
    expect(m.createIngestJob).toHaveBeenCalledWith("doc-1","kb-1",
      expect.objectContaining({mimeType:"text/markdown"}));
    const payload=m.createIngestJob.mock.calls[0]?.[2];
    expect(Buffer.from(payload.base64,"base64").toString()).toContain("DO.4.2");
    expect(m.enqueueIngestJob).toHaveBeenCalledWith("job-1");
    expect(m.markSessionIngesting).toHaveBeenCalledWith("session");
  });
  it("reuses ready URL documents without accidentally duplicating Qdrant/Neo4j data",async()=>{
    m.findDocumentBySourceUrl.mockResolvedValue({id:"ready-1",status:"ready"});
    const result=await runScrapeSession("session");
    expect(result).toMatchObject({scraped:0,skipped:1,refreshed:0});
    expect(m.loadWebPage).not.toHaveBeenCalled();
    expect(m.createDocument).not.toHaveBeenCalled();
    expect(m.enqueueIngestJob).not.toHaveBeenCalled();
    expect(m.markUrlCompleted).toHaveBeenCalledWith("url-1","ready-1");
    expect(m.markSessionCompleted).toHaveBeenCalledWith("session");
  });
});
