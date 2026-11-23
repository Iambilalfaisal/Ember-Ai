import type { CreateDealBody } from "@ember/api";

/** Splits one CSV line, honouring double quotes and doubled quotes inside them. */
function splitLine(line: string): string[] {
  const out: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cell.trim());
      cell = "";
    } else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

const ALIASES: Record<string, keyof CreateDealBody> = {
  company: "company",
  account: "company",
  name: "contactName",
  contact: "contactName",
  "contact name": "contactName",
  email: "contactEmail",
  "contact email": "contactEmail",
  title: "contactTitle",
  "job title": "contactTitle",
  value: "value",
  amount: "value",
  source: "source",
  currency: "currency",
};

export type ParsedCsv = { rows: CreateDealBody[]; problems: string[] };

/** Turns pasted or uploaded CSV text into deal rows. The first line must be a header. */
export function parseDealsCsv(text: string): ParsedCsv {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0];
  if (!header) return { rows: [], problems: ["The file is empty."] };
  const columns = splitLine(header).map((h) => ALIASES[h.toLowerCase()]);
  const problems: string[] = [];
  for (const need of ["company", "contactName", "contactEmail"] as const) {
    if (!columns.includes(need))
      problems.push(
        `Add a column for ${need === "company" ? "company" : need === "contactName" ? "contact name" : "contact email"}.`,
      );
  }
  if (problems.length > 0) return { rows: [], problems };
  const rows = lines.slice(1).map((line) => {
    const cells = splitLine(line);
    const get = (key: keyof CreateDealBody) => {
      const index = columns.indexOf(key);
      return index === -1 ? "" : (cells[index] ?? "");
    };
    const value = Number(get("value").replace(/[^0-9.]/g, ""));
    return {
      company: get("company"),
      contactName: get("contactName"),
      contactEmail: get("contactEmail"),
      contactTitle: get("contactTitle"),
      value: Number.isFinite(value) ? value : 0,
      source: get("source") || null,
      currency: get("currency") || "USD",
    } satisfies CreateDealBody;
  });
  return { rows, problems: rows.length === 0 ? ["There are no rows under the header."] : [] };
}
