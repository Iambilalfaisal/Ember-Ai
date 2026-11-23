"use client";

import { useCreateDeal, useImportDeals, useLists, type ImportResult } from "@ember/api";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
} from "@ember/ui";
import { useState } from "react";
import { toast } from "sonner";
import { parseDealsCsv } from "@/lib/csv";

const selectClass =
  "h-9 w-full rounded-control border border-smoke bg-paper px-2 text-sm text-coal transition-instant hover:border-iris focus-visible:border-iris";

type Mode = "one" | "csv";

/** Add one opportunity in a few fields, or paste a CSV to add many. */
export function AddDealDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>("one");
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="w-[min(36rem,calc(100vw-32px))]">
        <DialogTitle className="text-lg font-semibold text-coal">Add opportunities</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-smoke">
          New opportunities start in Discovery and land in your My Day.
        </DialogDescription>
        <div className="mt-3 flex gap-2" role="group" aria-label="How to add">
          <Button
            size="sm"
            variant={mode === "one" ? "primary" : "secondary"}
            aria-pressed={mode === "one"}
            onClick={() => setMode("one")}
          >
            One opportunity
          </Button>
          <Button
            size="sm"
            variant={mode === "csv" ? "primary" : "secondary"}
            aria-pressed={mode === "csv"}
            onClick={() => setMode("csv")}
          >
            Import CSV
          </Button>
        </div>
        {mode === "one" ? <QuickAdd onDone={onClose} /> : <CsvImport onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function QuickAdd({ onDone }: { onDone: () => void }) {
  const create = useCreateDeal();
  const { data: lists } = useLists();
  const [f, setF] = useState({
    company: "",
    contactName: "",
    contactEmail: "",
    contactTitle: "",
    value: "",
    source: "",
  });
  const set = (key: keyof typeof f) => (event: { target: { value: string } }) =>
    setF((current) => ({ ...current, [key]: event.target.value }));
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail.trim());
  const valueOk = f.value === "" || /^\d+$/.test(f.value);
  const ready = f.company.trim() && f.contactName.trim() && emailOk && valueOk;

  return (
    <form
      className="mt-4 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        create.mutate(
          {
            company: f.company.trim(),
            contactName: f.contactName.trim(),
            contactEmail: f.contactEmail.trim(),
            contactTitle: f.contactTitle.trim(),
            value: f.value === "" ? 0 : Number(f.value),
            source: f.source || null,
            currency: "USD",
          },
          {
            onSuccess: (deal) => {
              toast.success(`${deal.company} added.`);
              onDone();
            },
            onError: () => toast.error("Couldn't add it. Try again."),
          },
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-detail text-smoke">
          Company
          <Input value={f.company} onChange={set("company")} className="text-coal" />
        </label>
        <label className="space-y-1 text-detail text-smoke">
          Contact name
          <Input value={f.contactName} onChange={set("contactName")} className="text-coal" />
        </label>
        <label className="space-y-1 text-detail text-smoke">
          Contact email
          <Input
            type="email"
            value={f.contactEmail}
            onChange={set("contactEmail")}
            aria-invalid={f.contactEmail !== "" && !emailOk}
            className="text-coal"
          />
        </label>
        <label className="space-y-1 text-detail text-smoke">
          Contact title
          <Input value={f.contactTitle} onChange={set("contactTitle")} className="text-coal" />
        </label>
        <label className="space-y-1 text-detail text-smoke">
          Yearly value (USD)
          <Input
            inputMode="numeric"
            value={f.value}
            onChange={set("value")}
            aria-invalid={!valueOk}
            className="text-coal"
          />
        </label>
        <label className="space-y-1 text-detail text-smoke">
          Source
          <select value={f.source} onChange={set("source")} className={selectClass}>
            <option value="">Not set</option>
            {(lists?.sources ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!ready || create.isPending}>
          Add opportunity
        </Button>
      </div>
    </form>
  );
}

function CsvImport({ onDone }: { onDone: () => void }) {
  const importDeals = useImportDeals();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const parsed = text.trim() ? parseDealsCsv(text) : null;

  const run = () => {
    if (!parsed || parsed.rows.length === 0) return;
    importDeals.mutate(
      { rows: parsed.rows },
      {
        onSuccess: (r) => {
          setResult(r);
          if (r.skipped.length === 0) {
            toast.success(`${r.created} added.`);
            onDone();
          }
        },
        onError: () => toast.error("Couldn't import the file. Try again."),
      },
    );
  };

  return (
    <div className="mt-4 space-y-3">
      <p className="text-detail text-smoke">
        Paste CSV with a header row. Needed columns: company, contact name, contact email. Optional:
        title, value, source, currency.
      </p>
      <label className="block space-y-1 text-detail text-smoke">
        CSV
        <Textarea
          rows={6}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setResult(null);
          }}
          className="font-mono text-coal"
        />
      </label>
      <label className="block text-detail text-smoke">
        Or choose a file
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block text-sm text-coal"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void file.text().then((t) => setText(t));
          }}
        />
      </label>
      {parsed && parsed.problems.length > 0 ? (
        <p
          role="alert"
          className="rounded-control border border-flare bg-paper px-3 py-2 text-detail text-flare"
        >
          {parsed.problems.join(" ")}
        </p>
      ) : null}
      {parsed && parsed.rows.length > 0 && !result ? (
        <p className="text-detail text-coal">{parsed.rows.length} rows ready to import.</p>
      ) : null}
      {result ? (
        <div role="status" className="space-y-1 text-detail text-coal">
          <p>
            {result.created} added, {result.skipped.length} skipped.
          </p>
          <ul className="list-disc pl-5 text-smoke">
            {result.skipped.map((s) => (
              <li key={s.row}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        {result ? (
          <Button variant="primary" onClick={onDone}>
            Done
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!parsed || parsed.rows.length === 0 || importDeals.isPending}
            onClick={run}
          >
            Import
          </Button>
        )}
      </div>
    </div>
  );
}
