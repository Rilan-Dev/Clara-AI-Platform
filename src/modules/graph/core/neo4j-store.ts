/**
 * Persistent, tenant/KB-scoped graph adapter. No Cypher text is supplied by
 * a visitor or a language model. Document replacement is transactional.
 */
import neo4j, { type Driver, type ManagedTransaction, type Integer } from "neo4j-driver";
import type { DocumentGraphExtraction, GraphSearchHit, GraphStats, GraphStore, GraphStoreSearchParams } from "./types";

let driver: Driver | undefined;
let schema: Promise<void> | undefined;
/** Close the shared Bolt pool for one-shot operator tools and tests. */
export async function closeNeo4jDriver(): Promise<void> {
  const current=driver;
  driver=undefined;
  schema=undefined;
  if(current) await current.close();
}
function getDriver(): Driver {
  if (driver) return driver;
  const password = process.env.NEO4J_PASSWORD;
  if (!password || password.length < 8) throw Error("Neo4j requires NEO4J_PASSWORD (minimum 8 characters)");
  const uri = process.env.NEO4J_URI || "bolt://neo4j:7687";
  if (!/^(bolt|neo4j)(\+s|\+ssc)?:\/\//.test(uri)) throw Error("Invalid Neo4j Bolt URI");
  driver = neo4j.driver(uri, neo4j.auth.basic(process.env.NEO4J_USERNAME || "neo4j", password), {
    maxConnectionPoolSize: 8, connectionTimeout: 5000, connectionAcquisitionTimeout: 5000,
    maxTransactionRetryTime: 8000,
  });
  return driver;
}
async function ensureSchema() {
  if (!schema) schema = (async () => {
    const session = getDriver().session();
    try {
      await session.run("CREATE CONSTRAINT clara_graph_nodes IF NOT EXISTS FOR (n:ClaraGraphEntity) REQUIRE (n.kbId,n.id) IS UNIQUE");
      await session.run("CREATE CONSTRAINT clara_graph_chunks IF NOT EXISTS FOR (n:ClaraGraphChunk) REQUIRE (n.kbId,n.documentId,n.chunkId) IS UNIQUE");
    } finally { await session.close(); }
  })().catch(e => { schema = undefined; throw e; });
  return schema;
}
function validate(extraction: DocumentGraphExtraction) {
  if (!extraction.kbId || !extraction.documentId) throw Error("Graph extraction needs KB and document");
  const ids = new Set<string>();
  for (const n of extraction.nodes) {
    if (n.kbId !== extraction.kbId || !n.id || ids.has(n.id) ||
        n.documentIds?.some(d => d !== extraction.documentId) ||
        n.chunks?.some(c => c.documentId && c.documentId !== extraction.documentId))
      throw Error("Invalid or cross-document graph node");
    ids.add(n.id);
  }
  for (const e of extraction.edges) {
    if (e.kbId !== extraction.kbId || !e.id || !ids.has(e.source) || !ids.has(e.target) ||
        e.documentIds?.some(d => d !== extraction.documentId))
      throw Error("Invalid or cross-document graph edge");
  }
}
async function removeDocument(tx: ManagedTransaction, kbId: string, documentId: string) {
  await tx.run("MATCH (n:ClaraGraphEntity {kbId:$kbId}) WHERE $documentId IN n.documentIds SET n.documentIds=[d IN n.documentIds WHERE d <> $documentId]", {kbId, documentId});
  await tx.run("MATCH ()-[r:CLARA_RELATES {kbId:$kbId}]->() WHERE $documentId IN r.documentIds SET r.documentIds=[d IN r.documentIds WHERE d <> $documentId]", {kbId, documentId});
  await tx.run("MATCH (c:ClaraGraphChunk {kbId:$kbId,documentId:$documentId}) DETACH DELETE c", {kbId, documentId});
  await tx.run("MATCH ()-[r:CLARA_RELATES {kbId:$kbId}]->() WHERE size(r.documentIds)=0 DELETE r", {kbId});
  await tx.run("MATCH (n:ClaraGraphEntity {kbId:$kbId}) WHERE size(n.documentIds)=0 DETACH DELETE n", {kbId});
}

export class Neo4jGraphStore implements GraphStore {
  async upsertExtraction(extraction: DocumentGraphExtraction): Promise<void> {
    validate(extraction);
    await ensureSchema();
    const session = getDriver().session();
    try {
      await session.executeWrite(async tx => {
        await removeDocument(tx, extraction.kbId, extraction.documentId);
        for (const n of extraction.nodes) {
          const params = {kbId: extraction.kbId, documentId: extraction.documentId,
            id:n.id, label:n.label, type:n.type, aliases:[...new Set([n.label,...(n.aliases??[])])]};
          await tx.run("MERGE (n:ClaraGraphEntity {kbId:$kbId,id:$id}) ON CREATE SET n.documentIds=[] SET n.label=$label,n.type=$type,n.aliases=$aliases,n.documentIds=CASE WHEN $documentId IN n.documentIds THEN n.documentIds ELSE n.documentIds+$documentId END", params);
          for (const c of n.chunks ?? []) {
            await tx.run("MATCH (n:ClaraGraphEntity {kbId:$kbId,id:$id}) MERGE (c:ClaraGraphChunk {kbId:$kbId,documentId:$documentId,chunkId:$chunkId}) SET c.title=$title,c.text=$text MERGE (n)-[:CLARA_SUPPORTED_BY]->(c)",
              {...params, chunkId:c.chunkId, title:c.title??extraction.title??"", text:c.text.slice(0,1800)});
          }
        }
        for (const e of extraction.edges) {
          await tx.run("MATCH (a:ClaraGraphEntity {kbId:$kbId,id:$source}),(b:ClaraGraphEntity {kbId:$kbId,id:$target}) MERGE (a)-[r:CLARA_RELATES {kbId:$kbId,id:$id}]->(b) ON CREATE SET r.documentIds=[] SET r.type=$type,r.weight=$weight,r.documentIds=CASE WHEN $documentId IN r.documentIds THEN r.documentIds ELSE r.documentIds+$documentId END",
            {kbId:extraction.kbId,documentId:extraction.documentId,id:e.id,source:e.source,target:e.target,
              type:e.type,weight:e.weight??1});
        }
      });
    } finally { await session.close(); }
  }

  async deleteDocument(kbId: string, documentId: string): Promise<void> {
    if (!kbId || !documentId) throw Error("Graph deletion requires KB and document");
    const session = getDriver().session();
    try { await session.executeWrite(tx => removeDocument(tx, kbId, documentId)); }
    finally { await session.close(); }
  }

  async search(params: GraphStoreSearchParams): Promise<GraphSearchHit[]> {
    if (!params.kbId || !params.query.trim()) return [];
    const stop = new Set(["the","and","for","with","what","which","are","does","from","how","all","this","that","show","list","please"]);
    const terms = [...new Set(params.query.toLowerCase().match(/[\p{L}\p{N}._-]+/gu) ?? [])]
      .filter(t => t.length > 1 && !stop.has(t)).slice(0,12);
    if (!terms.length) return [];
    const session = getDriver().session({defaultAccessMode: neo4j.session.READ});
    const statement = [
      "MATCH (n:ClaraGraphEntity {kbId:$kbId})",
      "WHERE ($documentId IS NULL OR $documentId IN n.documentIds)",
      "AND any(t IN $terms WHERE toLower(n.label) CONTAINS t OR any(alias IN n.aliases WHERE toLower(alias) CONTAINS t))",
      "WITH n,size([t IN $terms WHERE toLower(n.label) CONTAINS t OR any(alias IN n.aliases WHERE toLower(alias) CONTAINS t)]) AS lexical",
      "ORDER BY lexical DESC,n.id LIMIT $limit",
      "OPTIONAL MATCH (n)-[:CLARA_SUPPORTED_BY]->(c:ClaraGraphChunk {kbId:$kbId})",
      "WHERE $documentId IS NULL OR c.documentId=$documentId",
      "WITH n,lexical,collect(DISTINCT c) AS chunks",
      "OPTIONAL MATCH (n)-[r:CLARA_RELATES {kbId:$kbId}]-(m:ClaraGraphEntity {kbId:$kbId})",
      "WHERE $documentId IS NULL OR ($documentId IN r.documentIds AND $documentId IN m.documentIds)",
      "RETURN n.id AS id,n.label AS label,n.type AS type,lexical,",
      "[c IN chunks WHERE c IS NOT NULL | c{.chunkId,.documentId,.title,.text}][0..4] AS chunks,",
      "[rel IN collect(DISTINCT r) WHERE rel IS NOT NULL |",
      "{id:rel.id,type:rel.type,source:startNode(rel).id,target:endNode(rel).id,weight:rel.weight}][0..6] AS relations",
      "ORDER BY lexical DESC,id",
    ].join("\n");
    try {
      const result = await session.executeRead(tx => tx.run(statement,
        {kbId:params.kbId, documentId:params.documentId??null, terms,
          limit:neo4j.int(Math.max(1,Math.min(params.topK||4,20)))}));
      return result.records.map(record => {
        const chunks = record.get("chunks") as Array<{chunkId:string;documentId:string;title:string;text:string}>;
        const relations = record.get("relations") as GraphSearchHit["relations"];
        const lexical = record.get("lexical") as Integer;
        return {
          id:String(record.get("id")),label:String(record.get("label")),
          type:String(record.get("type")) as GraphSearchHit["type"],
          score:lexical.toNumber()*2+Math.min(relations.length,5),
          supportingChunks:chunks.map(c=>({chunkId:c.chunkId,documentId:c.documentId,title:c.title,text:c.text})),
          relations,
        };
      }).filter(hit=>hit.supportingChunks.length>0);
    } finally { await session.close(); }
  }

  async getStats(kbId?: string): Promise<GraphStats> {
    const session = getDriver().session({defaultAccessMode: neo4j.session.READ});
    const p = {kbId:kbId??null};
    try {
      const n = await session.executeRead(tx=>tx.run("MATCH (n:ClaraGraphEntity) WHERE $kbId IS NULL OR n.kbId=$kbId RETURN count(n) AS count",p));
      const e = await session.executeRead(tx=>tx.run("MATCH ()-[r:CLARA_RELATES]->() WHERE $kbId IS NULL OR r.kbId=$kbId RETURN count(r) AS count",p));
      const d = await session.executeRead(tx=>tx.run("MATCH (c:ClaraGraphChunk) WHERE $kbId IS NULL OR c.kbId=$kbId RETURN count(DISTINCT c.kbId+':'+c.documentId) AS count",p));
      return {
        nodeCount:(n.records[0]!.get("count") as Integer).toNumber(),
        edgeCount:(e.records[0]!.get("count") as Integer).toNumber(),
        documentCount:(d.records[0]!.get("count") as Integer).toNumber(),
      };
    } finally {await session.close();}
  }
}
