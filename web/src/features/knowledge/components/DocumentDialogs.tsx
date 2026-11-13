"use client";

import {
  useActivateDocument,
  useDeactivateDocument,
  useReplaceDocument,
  useUploadDocument,
  type KnowledgeDocument,
} from "@ember/api";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  SheetContent,
} from "@ember/ui";
import { useState } from "react";
import { toast } from "sonner";
import { DOC_TYPES, DOC_TYPE_LABEL, selectClass } from "../copy";

type Doc = KnowledgeDocument;

export function UploadDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const upload = useUploadDocument();
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<Doc["docType"]>("guide");

  const submit = async () => {
    try {
      const created = await upload.mutateAsync({ title: title.trim(), docType });
      toast.success(
        `${created.title} ${created.version} uploaded. It is searchable once indexing finishes.`,
      );
      setTitle("");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't upload the document. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="text-xl">Upload a document</DialogTitle>
        <DialogDescription className="mt-2 text-sm text-smoke">
          Answers can use it once its text has been indexed.
        </DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) void submit();
          }}
        >
          <label className="block space-y-1 text-detail text-smoke">
            Title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-coal"
            />
          </label>
          <label className="block space-y-1 text-detail text-smoke">
            Type
            <select
              value={docType}
              onChange={(event) => setDocType(event.target.value as Doc["docType"])}
              className={`${selectClass} w-full`}
            >
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {DOC_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <DialogClose asChild>
              <Button type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={!title.trim() || upload.isPending}>
              Upload
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReplaceDialog({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const replace = useReplaceDocument();
  const [title, setTitle] = useState("");

  const submit = async () => {
    if (!doc) return;
    try {
      const next = await replace.mutateAsync({
        id: doc.id,
        ...(title.trim() && { title: title.trim() }),
      });
      toast.success(`${next.title} ${next.version} is now active. ${doc.version} was turned off.`);
      setTitle("");
      onClose();
    } catch {
      toast.error("Couldn't add the new version. Try again.");
    }
  };

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle className="text-xl">
          Replace {doc?.title} {doc?.version}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-smoke">
          The new version becomes active and this one is turned off.
        </DialogDescription>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block space-y-1 text-detail text-smoke">
            New title (optional)
            <Input
              value={title}
              placeholder={doc?.title}
              onChange={(event) => setTitle(event.target.value)}
              className="text-coal"
            />
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <DialogClose asChild>
              <Button type="button">Cancel</Button>
            </DialogClose>
            <Button type="submit" variant="primary" disabled={replace.isPending}>
              Replace
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeactivateDialog({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const deactivate = useDeactivateDocument();

  const submit = async () => {
    if (!doc) return;
    try {
      await deactivate.mutateAsync(doc.id);
      toast.success(`${doc.title} ${doc.version} deactivated. Answers no longer use it.`);
      onClose();
    } catch {
      toast.error("Couldn't deactivate the document. Try again.");
    }
  };

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogTitle className="text-xl">
          Deactivate {doc?.title} {doc?.version}?
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-smoke">
          Answers will stop using it straight away. You can activate it again later.
        </DialogDescription>
        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <Button>Cancel</Button>
          </DialogClose>
          <Button variant="primary" disabled={deactivate.isPending} onClick={() => void submit()}>
            Deactivate
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useActivate() {
  const activate = useActivateDocument();
  return async (doc: Doc) => {
    try {
      await activate.mutateAsync(doc.id);
      toast.success(`${doc.title} ${doc.version} activated. Answers can use it again.`);
    } catch {
      toast.error("Couldn't activate the document. Try again.");
    }
  };
}

export function DocumentSheet({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <DialogTitle className="text-xl">
          {doc?.title} {doc?.version}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-smoke">
          {doc
            ? `${DOC_TYPE_LABEL[doc.docType]}, ${doc.status === "active" ? "active" : "inactive"}`
            : ""}
        </DialogDescription>
        <div className="mt-6 space-y-5">
          {doc?.sections.map((section) => (
            <section key={section.heading}>
              <h3 className="text-detail capitalize text-smoke">{section.heading}</h3>
              <p className="mt-1 text-sm text-coal">{section.passage}</p>
            </section>
          ))}
        </div>
        <div className="mt-8">
          <DialogClose asChild>
            <Button>Close</Button>
          </DialogClose>
        </div>
      </SheetContent>
    </Dialog>
  );
}
