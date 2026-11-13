"use client";

import type { KnowledgeDocument } from "@ember/api";
import { Button, StatusPill } from "@ember/ui";
import { shortDate } from "@/lib/format";
import { DOC_TYPE_LABEL } from "../copy";

export function DocumentsTable({
  documents,
  owners,
  canManage,
  onOpen,
  onReplace,
  onDeactivate,
  onActivate,
}: {
  documents: KnowledgeDocument[];
  owners: Map<string, { name: string }>;
  canManage: boolean;
  onOpen: (doc: KnowledgeDocument) => void;
  onReplace: (doc: KnowledgeDocument) => void;
  onDeactivate: (doc: KnowledgeDocument) => void;
  onActivate: (doc: KnowledgeDocument) => void;
}) {
  return (
    <div className="ember-table-card">
      <table className="ember-table w-full text-left text-sm">
        <caption className="sr-only">Documents</caption>
        <thead>
          <tr className="border-b border-cinder text-detail text-smoke">
            <th scope="col" className="py-2 pr-4 font-medium">
              Document
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Type
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Version
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Status
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Updated
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Owner
            </th>
            {canManage ? (
              <th scope="col" className="w-60 py-2 font-medium">
                <span className="sr-only">Actions</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-cinder">
          {documents.map((doc) => (
            <tr key={doc.id} className="align-middle">
              <td className="h-14 pr-4">
                <button
                  type="button"
                  onClick={() => onOpen(doc)}
                  aria-label={`Open ${doc.title} ${doc.version}`}
                  className="text-left font-medium text-coal underline-offset-2 hover:underline"
                >
                  {doc.title}
                </button>
              </td>
              <td className="pr-4 text-coal">{DOC_TYPE_LABEL[doc.docType]}</td>
              <td className="pr-4 text-coal">{doc.version}</td>
              <td className="pr-4">
                <StatusPill tone={doc.status === "active" ? "done" : "neutral"}>
                  {doc.status === "active" ? "Active" : "Inactive"}
                </StatusPill>
              </td>
              <td className="pr-4 text-coal">{shortDate(doc.updatedAt)}</td>
              <td className="pr-4 text-coal">{owners.get(doc.ownerId)?.name ?? doc.ownerId}</td>
              {canManage ? (
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Replace ${doc.title} ${doc.version}`}
                      onClick={() => onReplace(doc)}
                    >
                      Replace
                    </Button>
                    {doc.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Deactivate ${doc.title} ${doc.version}`}
                        onClick={() => onDeactivate(doc)}
                      >
                        Deactivate
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Activate ${doc.title} ${doc.version}`}
                        onClick={() => onActivate(doc)}
                      >
                        Activate
                      </Button>
                    )}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
