"use client";

import { useDocuments, useMe, type KnowledgeDocument } from "@ember/api";
import { Button, EmptyState, ErrorState, Segmented, Skeleton } from "@ember/ui";
import { useState } from "react";
import { useUserMap } from "@/lib/useUserMap";
import {
  DeactivateDialog,
  DocumentSheet,
  ReplaceDialog,
  UploadDialog,
  useActivate,
} from "../components/DocumentDialogs";
import { DocumentsTable } from "../components/DocumentsTable";
import { KnowledgeNav } from "../components/KnowledgeNav";
import { ScorecardPanel } from "../components/ScorecardPanel";

type Filter = "all" | "active" | "inactive";

export function KnowledgeScreen() {
  const { data: me } = useMe();
  const { data, isPending, isError, refetch } = useDocuments();
  const { byId } = useUserMap();
  const activate = useActivate();
  const [filter, setFilter] = useState<Filter>("all");
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState<KnowledgeDocument | null>(null);
  const [replacing, setReplacing] = useState<KnowledgeDocument | null>(null);
  const [deactivating, setDeactivating] = useState<KnowledgeDocument | null>(null);

  const canManage = me?.role === "admin";
  const documents = (data ?? []).filter((doc) => filter === "all" || doc.status === filter);

  return (
    <div className="space-y-6">
      <KnowledgeNav />
      {me && me.role !== "rep" ? <ScorecardPanel /> : null}
      <section aria-labelledby="documents-heading" className="space-y-3" data-tour="knowledge-docs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="documents-heading" className="text-lg font-medium text-coal">
            Documents
          </h2>
          <div className="flex items-center gap-3">
            <Segmented
              label="Show documents"
              value={filter}
              onValueChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            {canManage ? (
              <Button variant="primary" onClick={() => setUploading(true)}>
                Upload document
              </Button>
            ) : null}
          </div>
        </div>
        {isPending ? (
          <div className="space-y-2" aria-busy="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Couldn't load the documents"
            description="Check your connection and try again."
            onRetry={() => void refetch()}
          />
        ) : documents.length === 0 ? (
          <EmptyState
            title={filter === "inactive" ? "No inactive documents" : "No documents yet"}
            description={
              canManage
                ? "Upload a document and answers can start using it."
                : "An admin adds the documents answers come from."
            }
          />
        ) : (
          <DocumentsTable
            documents={documents}
            owners={byId}
            canManage={canManage}
            onOpen={setViewing}
            onReplace={setReplacing}
            onDeactivate={setDeactivating}
            onActivate={(doc) => void activate(doc)}
          />
        )}
      </section>
      <UploadDialog open={uploading} onOpenChange={setUploading} />
      <ReplaceDialog doc={replacing} onClose={() => setReplacing(null)} />
      <DeactivateDialog doc={deactivating} onClose={() => setDeactivating(null)} />
      <DocumentSheet doc={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}
