"use client";

import { useCallback, useEffect, useState } from "react";
import { GitBranch, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/runtime";
import { withAuthHeaders } from "@/lib/client-auth";

type GraphIndexStatus = {
  graph:{status:string;verified:boolean};
  ingestion:{vectorEnabled:boolean;graphAutoIndexing:boolean};
  retrieval:{graphRuntimeConfigured:boolean;customerSwitchingAvailable:boolean};
};

export function GraphIndexStatusPanel({kbId,processing=0}: {kbId:string;processing?:number}){
  const [data,setData]=useState<GraphIndexStatus|null>(null);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(false);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch(apiUrl(`/api/kbs/${encodeURIComponent(kbId)}/graph-index`),
        {headers:withAuthHeaders(),cache:"no-store"});
      if(!r.ok){setError(true);return;}
      setData(await r.json() as GraphIndexStatus);
      setError(false);
    }catch{setError(true);}
    finally{setLoading(false);}
  },[kbId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(processing<1)return;
    const id=setInterval(()=>{void refresh();},6000);
    return ()=>clearInterval(id);
  },[processing,refresh]);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5" aria-labelledby="graph-index-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="graph-index-title" className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-primary"/> Vector and graph indexing
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Each source is chunked and embedded into Qdrant. Neo4j graph extraction is an optional,
            separately verified enrichment of the same source chunks.
          </p>
        </div>
        <button type="button" onClick={()=>void refresh()} disabled={loading}
          aria-label="Refresh graph indexing status"
          className="shrink-0 rounded-md border border-border p-2 text-muted-foreground hover:text-foreground disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading?"animate-spin":""}`}/>
        </button>
      </div>
      {data && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-live="polite">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Vector / Qdrant</p>
            <p className="mt-1 text-sm font-semibold">Ingestion enabled</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">Graph / Neo4j</p>
            <p className="mt-1 text-sm font-semibold">
              {data.graph.verified?"Verified for this collection":
                data.graph.status==="index_stale"?"Needs re-verification":
                data.graph.status==="not_indexed"?"Not yet verified":"Not ready"}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">New uploads</p>
            <p className="mt-1 text-sm font-semibold">
              {data.ingestion.graphAutoIndexing?"Vector + graph extraction":"Vector only"}
            </p>
          </div>
        </div>
      )}
      {error && <p className="mt-3 text-xs text-amber-600">Graph status could not be loaded. The document list remains available.</p>}
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <p><span className="font-medium text-foreground">Existing vector documents:</span> An operator can backfill their graph without deleting or uploading the files again.</p>
        <p><span className="font-medium text-foreground">Re-upload or website scrape:</span> Both produce new document ingestion jobs. New or changed vectors make the corresponding graph verification stale until it is rechecked.</p>
        <p><span className="font-medium text-foreground">Removal:</span> Deleting a document removes its live Qdrant evidence. Neo4j evidence is also cleaned when the graph provider is configured; historical published snapshots are separate.</p>
        <p>{data?.retrieval.customerSwitchingAvailable?
          "Published agent retrieval switching is available.":
          "Graph indexing status does not mean the published agent uses Graph RAG. The customer-facing mode switch is not yet enabled."}</p>
      </div>
    </section>
  );
}
