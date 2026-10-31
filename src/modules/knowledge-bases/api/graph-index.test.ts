import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const m=vi.hoisted(()=>({read:vi.fn(),permission:vi.fn(),auth:vi.fn(),kb:vi.fn()}));
vi.mock("@/lib/db/migrate",()=>({ensureMigrated:vi.fn(async()=>{})}));
vi.mock("@/modules/auth/core/rbac",()=>({requireAuth:m.auth,requireKbPermission:m.permission}));
vi.mock("@/modules/knowledge-bases/core/db",()=>({getKnowledgeBaseById:m.kb}));
vi.mock("@/modules/graph/core/graph-readiness",()=>({getGraphSnapshotStatus:m.read}));
import {getKbGraphIndexHandler} from "./graph-index";
const req=()=>new NextRequest("http://localhost/api/kbs/kb1/graph-index");
describe("KB graph status read security and accuracy",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    delete process.env.ENABLE_GRAPH_INDEXING;
    delete process.env.GRAPH_INDEXING_KB_ID;
    delete process.env.GRAPH_STORE_PROVIDER;
    delete process.env.ENABLE_RAG_RETRIEVAL_POLICY;
    delete process.env.ENABLE_GRAPH_RAG;
    m.auth.mockResolvedValue({user:{id:"u1"}});
    m.permission.mockResolvedValue(undefined);
    m.kb.mockResolvedValue({id:"kb1",qdrantCollection:"live-collection"});
    m.read.mockResolvedValue({ready:true,reason:"verified"});
  });
  it("authenticates the exact KB before revealing its verification",async()=>{
    const r=await getKbGraphIndexHandler(req(),"kb1");
    expect(r.status).toBe(200);
    expect(m.permission).toHaveBeenCalledWith({user:{id:"u1"}},"kb1","document:read");
    expect(m.read).toHaveBeenCalledWith("kb1","live-collection");
    expect(await r.json()).toMatchObject({
      graph:{status:"verified",verified:true},
      ingestion:{vectorEnabled:true,graphAutoIndexing:false},
      retrieval:{graphRuntimeConfigured:false,customerSwitchingAvailable:false},
    });
  });
  it("does not leak graph details across tenant permissions",async()=>{
    m.permission.mockRejectedValueOnce(NextResponse.json({error:"Forbidden"},{status:403}));
    const r=await getKbGraphIndexHandler(req(),"kb1");
    expect(r.status).toBe(403);
    expect(m.read).not.toHaveBeenCalled();
  });
  it("shows the true scoped Neo4j ingestion status without claiming graph retrieval is enabled",async()=>{
    process.env.GRAPH_STORE_PROVIDER="memory";
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.GRAPH_INDEXING_KB_ID="kb1";
    const r=await getKbGraphIndexHandler(req(),"kb1");
    expect(await r.json()).toMatchObject({
      graph:{verified:true},
      ingestion:{graphAutoIndexing:true},
      retrieval:{graphRuntimeConfigured:false,customerSwitchingAvailable:false},
    });
    m.kb.mockResolvedValueOnce({id:"kb2",qdrantCollection:"other"});
    const other=await getKbGraphIndexHandler(req(),"kb2");
    expect(await other.json()).toMatchObject({ingestion:{graphAutoIndexing:false}});
  });
  it("shows stale index and explicit opt-in status",async()=>{
    process.env.GRAPH_STORE_PROVIDER="neo4j";
    process.env.ENABLE_GRAPH_INDEXING="true";
    process.env.ENABLE_GRAPH_RAG="true";
    process.env.ENABLE_RAG_RETRIEVAL_POLICY="true";
    m.read.mockResolvedValueOnce({ready:false,reason:"index_stale"});
    const r=await getKbGraphIndexHandler(req(),"kb1");
    expect(await r.json()).toMatchObject({
      graph:{verified:false,status:"index_stale"},
      ingestion:{graphAutoIndexing:true},
      retrieval:{graphRuntimeConfigured:true,customerSwitchingAvailable:false},
    });
  });
});
