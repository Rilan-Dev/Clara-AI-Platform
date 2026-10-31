import {beforeEach,describe,expect,it,vi} from "vitest";
import {NextRequest,NextResponse} from "next/server";
const mocks=vi.hoisted(()=>({
  ensureMigrated:vi.fn(),requireAuth:vi.fn(),requireOrgPermission:vi.fn(),requireAgentPermission:vi.fn(),
  getOrganisationById:vi.fn(),getAgentById:vi.fn(),getOrgRetrievalPolicy:vi.fn(),
  getAgentRetrievalPolicy:vi.fn(),setOrgRetrievalPolicy:vi.fn(),setAgentDraftRetrievalMode:vi.fn(),
}));
vi.mock("@/lib/db/migrate",()=>({ensureMigrated:mocks.ensureMigrated}));
vi.mock("@/modules/auth/core/rbac",()=>({
  requireAuth:mocks.requireAuth,requireOrgPermission:mocks.requireOrgPermission,requireAgentPermission:mocks.requireAgentPermission,
}));
vi.mock("@/modules/organisations/core/db",()=>({getOrganisationById:mocks.getOrganisationById,getAgentById:mocks.getAgentById}));
vi.mock("../core/retrieval-policy",async(importOriginal)=>{
  const actual=await importOriginal<typeof import("../core/retrieval-policy")>();
  return {...actual,getOrgRetrievalPolicy:mocks.getOrgRetrievalPolicy,getAgentRetrievalPolicy:mocks.getAgentRetrievalPolicy,
    setOrgRetrievalPolicy:mocks.setOrgRetrievalPolicy,setAgentDraftRetrievalMode:mocks.setAgentDraftRetrievalMode};
});
import {getAgentRetrievalHandler,patchAgentRetrievalHandler,patchOrgRetrievalHandler} from "./retrieval-policy";
const endpoint="https://test.local/api/agents/agent-id/retrieval-policy";
const request=(method:"GET"|"PATCH",body?:object)=>new NextRequest(endpoint,{method,...(body?{body:JSON.stringify(body),headers:{"content-type":"application/json"}}:{})});
describe("retrieval policy APIs enforce tenant-scoped role permissions",()=>{
  beforeEach(()=>{
    vi.resetAllMocks();
    mocks.ensureMigrated.mockResolvedValue(undefined);
    mocks.requireAuth.mockResolvedValue({user:{id:"user-1",isSuperAdmin:false}});
    mocks.requireAgentPermission.mockResolvedValue({orgId:"org-1"});
    mocks.getAgentById.mockResolvedValue({id:"agent-id",orgId:"org-1"});
    mocks.getOrganisationById.mockResolvedValue({id:"org-1"});
    mocks.getOrgRetrievalPolicy.mockResolvedValue({orgId:"org-1",defaultMode:"vector",allowedModes:["vector","hybrid"]});
    mocks.getAgentRetrievalPolicy.mockResolvedValue({agentId:"agent-id",orgId:"org-1",draftMode:"vector",publishedMode:"vector"});
    mocks.setAgentDraftRetrievalMode.mockResolvedValue({agentId:"agent-id",orgId:"org-1",draftMode:"hybrid",publishedMode:"vector"});
    mocks.setOrgRetrievalPolicy.mockResolvedValue({orgId:"org-1",defaultMode:"vector",allowedModes:["vector","hybrid"]});
    vi.spyOn(console,"error").mockImplementation(()=>undefined);
  });
  it("does not leak agent policy without project permission",async()=>{
    mocks.requireAgentPermission.mockRejectedValueOnce(NextResponse.json({error:"Forbidden"},{status:403}));
    const res=await getAgentRetrievalHandler(request("GET"),"agent-id");
    expect(res.status).toBe(403);
    expect(mocks.getAgentRetrievalPolicy).not.toHaveBeenCalled();
  });
  it("does not expose a foreign tenant agent even after a scoped token",async()=>{
    mocks.getAgentById.mockResolvedValueOnce({id:"agent-id",orgId:"org-2"});
    const res=await patchAgentRetrievalHandler(request("PATCH",{draftMode:"hybrid"}),"agent-id");
    expect(res.status).toBe(404);
    expect(mocks.setAgentDraftRetrievalMode).not.toHaveBeenCalled();
  });
  it("rejects graph modes outside the organization's allowed modes",async()=>{
    const res=await patchAgentRetrievalHandler(request("PATCH",{draftMode:"graph"}),"agent-id");
    expect(res.status).toBe(403);
    expect(mocks.setAgentDraftRetrievalMode).not.toHaveBeenCalled();
  });
  it("stores a valid draft while published mode remains vector",async()=>{
    const res=await patchAgentRetrievalHandler(request("PATCH",{draftMode:"hybrid"}),"agent-id");
    expect(res.status).toBe(200);
    const b=await res.json();
    expect(b.policy).toMatchObject({draftMode:"hybrid",publishedMode:"vector"});
    expect(b.preview.effective).toBe("vector");
  });
  it("rejects malformed org allowedModes without writing",async()=>{
    const res=await patchOrgRetrievalHandler(request("PATCH",{defaultMode:"hybrid",allowedModes:["hybrid"]}),"org-1");
    expect(res.status).toBe(400);
    expect(mocks.setOrgRetrievalPolicy).not.toHaveBeenCalled();
  });
});
