import {describe,it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({queryOne:vi.fn(),query:vi.fn()}));
vi.mock("@/lib/db",()=>mocks);
import { getOrgRetrievalPolicy,getAgentRetrievalPolicy,setAgentDraftRetrievalMode,
  validateOrgModes,resolveAllowedRetrievalMode,setOrgRetrievalPolicy } from "./retrieval-policy";
describe("tenant retrieval policy and safety",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.queryOne.mockResolvedValue(null);mocks.query.mockResolvedValue([]);});
  it("defaults to vector for all unconfigured tenants",async()=>{
    expect(await getOrgRetrievalPolicy("org1")).toMatchObject({defaultMode:"vector",allowedModes:["vector"]});
    expect(await getAgentRetrievalPolicy("agent1","org1")).toMatchObject({draftMode:"vector",publishedMode:"vector"});
  });
  it("validates organization mode allowlist with vector included",()=>{
    expect(()=>validateOrgModes(["hybrid"],"hybrid")).toThrow();
    expect(()=>validateOrgModes(["vector","vector"],"vector")).toThrow();
    expect(()=>validateOrgModes(["vector","hybrid"],"graph")).toThrow();
    expect(validateOrgModes(["vector","hybrid"],"hybrid")).toEqual(["vector","hybrid"]);
  });
  it("never trusts an agent setting disallowed by org or an unready graph",()=>{
    const org={orgId:"o",defaultMode:"vector" as const,allowedModes:["vector","hybrid"] as Array<"vector"|"hybrid"|"graph">};
    const agent={agentId:"a",orgId:"o",draftMode:"hybrid" as const,publishedMode:"vector" as const};
    expect(resolveAllowedRetrievalMode({org,agent,draft:true,graphReady:false})).toMatchObject({effective:"vector",reason:"graph_not_ready"});
    expect(resolveAllowedRetrievalMode({org,agent,draft:false,graphReady:false}).effective).toBe("vector");
    expect(resolveAllowedRetrievalMode({org:{...org,allowedModes:["vector"]},agent,draft:true,graphReady:true}).reason).toBe("org_policy_restricted");
  });
  it("rejects draft elevation outside the org's allowlist before writing",async()=>{
    await expect(setAgentDraftRetrievalMode("agent","org","hybrid")).rejects.toThrow("not allowed");
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it("refuses org policy removal when a published agent would be stranded",async()=>{
    mocks.query.mockResolvedValueOnce([{agent_id:"another_agent"}]);
    await expect(setOrgRetrievalPolicy("org",{defaultMode:"vector",allowedModes:["vector"]})).rejects.toThrow("published agent");
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
});
