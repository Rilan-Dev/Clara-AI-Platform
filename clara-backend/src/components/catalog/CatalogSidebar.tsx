"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAssistant } from "@/modules/assistant/core";

export function CatalogSidebar() {
  const {
    documents,
    documentsLoading,
    documentsError,
    activeDocument,
    setActiveDocument,
  } = useAssistant();

  const renderDocumentList = () => {
    if (documentsLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-muted/20" />
          ))}
        </div>
      );
    }

    if (documents.length === 0) {
      return (
        <CardDescription className="rounded-2xl border border-border/60 bg-surface/60 px-4 py-3 text-sm">
          No documents ingested yet. Use the ingestion workspace to add your first source.
        </CardDescription>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {documents.map((doc) => {
          const isActive = activeDocument?.id === doc.id;
          const subtitle = doc.originalFilename ?? doc.sourceUrl ?? "Unknown source";

          return (
            <Button
              key={doc.id}
              type="button"
              variant={isActive ? "default" : "ghost"}
              className="h-auto w-full justify-start rounded-2xl border border-border/60 px-4 py-3 text-left hover:border-primary/40"
              onClick={() => setActiveDocument(doc)}
            >
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">
                  {doc.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {subtitle}
                </span>
                <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">
                  Created {new Date(doc.createdAt).toLocaleString()}
                </span>
              </div>
            </Button>
          );
        })}
      </div>
    );
  };

  return (
    <aside className="flex h-full flex-col gap-6">
      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle className="text-base">Knowledge catalog</CardTitle>
          <CardDescription className="text-sm">
            Each document is stored in its own Qdrant collection. Select one to scope Clara’s retrieval to that source.
          </CardDescription>
          {documentsError && (
            <CardDescription className="rounded-xl border border-destructive/40 bg-destructive/15 px-3 py-2 text-xs text-destructive-foreground">
              {documentsError}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>{renderDocumentList()}</CardContent>
      </Card>

      <Card className="border-border/60 bg-card/60 text-sm text-muted-foreground">
        <CardHeader>
          <CardTitle className="text-base text-foreground">Source insights</CardTitle>
        </CardHeader>
        <CardContent>
          {activeDocument ? (
            <div className="space-y-2">
              <div>
                Active document:
                <span className="ml-1 font-medium text-foreground">
                  {activeDocument.title}
                </span>
              </div>
              {activeDocument.sourceUrl && (
                <div>
                  Source URL:{" "}
                  <Link
                    className="text-primary hover:underline"
                    href={activeDocument.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activeDocument.sourceUrl}
                  </Link>
                </div>
              )}
              {activeDocument.originalFilename && (
                <div>File: {activeDocument.originalFilename}</div>
              )}
              <Separator className="my-2" />
              <div>
                Collection: {" "}
                <span className="font-mono text-xs text-muted-foreground/80">
                  {activeDocument.collectionName}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Select a document to view its metadata, provenance, and collection details.
            </p>
          )}
        </CardContent>
      </Card>
    </aside>
  );
}
