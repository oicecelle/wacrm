import type { ParsedSheet } from "./types";

/**
 * Reading spreadsheets: CSV (comma OR semicolon — Brazilian Excel
 * exports semicolons — with quoted fields, embedded newlines, BOM,
 * and UTF-8 or Windows-1252 text) and Excel workbooks (.xlsx/.xls/.ods).
 *
 * The pure parts (parseDelimited, detectDelimiter, buildSheet,
 * decodeCsvBytes) are exported for unit tests.
 */

export const MAX_ROWS = 10000;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/* ───────────────────────── CSV ───────────────────────── */

/** Pick the delimiter that splits the first lines most consistently. */
export function detectDelimiter(text: string): string {
  const candidates = [";", ",", "\t", "|"];
  const lines: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (cur.trim()) lines.push(cur);
      cur = "";
      if (lines.length >= 6) break;
    } else {
      cur += ch;
    }
  }
  if (cur.trim() && lines.length < 6) lines.push(cur);
  if (lines.length === 0) return ",";

  let best = ",";
  let bestScore = -1;
  for (const d of candidates) {
    const counts = lines.map((l) => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const first = counts[0];
    if (first === 0) continue;
    // Consistent column count across lines beats a merely high count.
    const consistent = counts.filter((c) => c === first).length;
    const score = consistent * 1000 + first;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** RFC-4180-style parser: quoted fields, "" escapes, newlines in quotes. */
export function parseDelimited(input: string, delimiter?: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/** UTF-8 when valid, otherwise Windows-1252 (what Excel-BR writes). */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/* ───────────────────────── matrix → sheet ───────────────────────── */

/** Turn a raw cell matrix into headers + data rows: skips title rows
 *  above the header, names blank/duplicate headers, drops empty rows. */
export function buildSheet(matrix: string[][]): ParsedSheet {
  const cleaned = matrix.map((r) => r.map((c) => (c ?? "").toString().trim()));
  const nonEmpty = (r: string[]) => r.filter((c) => c !== "").length;

  const window = cleaned.slice(0, 10);
  const maxCells = Math.max(0, ...window.map(nonEmpty));
  const headerIdx = cleaned.findIndex((r) => {
    const n = nonEmpty(r);
    return n >= 1 && n >= Math.max(maxCells > 1 ? 2 : 1, Math.ceil(maxCells * 0.6));
  });
  if (headerIdx === -1) return { headers: [], rows: [] };

  const rawHeaders = cleaned[headerIdx];
  const width = rawHeaders.length;
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((h, i) => {
    const base = h || `Coluna ${i + 1}`;
    const count = (seen.get(base.toLowerCase()) ?? 0) + 1;
    seen.set(base.toLowerCase(), count);
    return count > 1 ? `${base} (${count})` : base;
  });

  const rows: string[][] = [];
  for (const r of cleaned.slice(headerIdx + 1)) {
    if (nonEmpty(r) === 0) continue;
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push("");
    rows.push(padded);
  }
  return { headers, rows };
}

/* ───────────────────────── files ───────────────────────── */

export interface LoadedWorkbook {
  fileName: string;
  sheetNames: string[];
  getSheet: (name: string) => ParsedSheet;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/* eslint-disable @typescript-eslint/no-explicit-any */
function cellToString(XLSX: any, cell: any): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  switch (cell.t) {
    case "n": {
      const v = cell.v as number;
      if (cell.z && XLSX.SSF.is_date(cell.z)) {
        // Read the underlying serial, not the display text — display
        // formats vary (m/d/yy vs dd/mm/yyyy) and would be ambiguous.
        const d = XLSX.SSF.parse_date_code(v);
        if (d) {
          if (v < 1) return `${pad2(d.H)}:${pad2(d.M)}`;
          const date = `${d.y}-${pad2(d.m)}-${pad2(d.d)}`;
          return d.H || d.M ? `${date} ${pad2(d.H)}:${pad2(d.M)}` : date;
        }
      }
      // Comma decimal, so the number parser never mistakes 1.234
      // (a real 1.234) for the Brazilian thousands-grouped 1.234.
      return String(v).replace(".", ",");
    }
    case "b":
      return cell.v ? "sim" : "nao";
    case "e":
      return "";
    default:
      return String(cell.v).trim();
  }
}

function sheetToMatrix(XLSX: any, ws: any): string[][] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const out: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(cellToString(XLSX, ws[XLSX.utils.encode_cell({ r, c })]));
    }
    out.push(row);
  }
  return out;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadSpreadsheet(file: File): Promise<LoadedWorkbook> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Arquivo muito grande (limite de 15 MB). Divida a planilha em partes.");
  }
  const name = file.name;
  const lower = name.toLowerCase();
  const bytes = await file.arrayBuffer();

  if (/\.(xlsx|xlsm|xls|ods)$/.test(lower)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    const sheetNames = wb.SheetNames.filter((n) => {
      const ws = wb.Sheets[n];
      return ws && ws["!ref"];
    });
    if (sheetNames.length === 0) throw new Error("A planilha está vazia.");
    return {
      fileName: name,
      sheetNames,
      getSheet: (sheetName) => buildSheet(sheetToMatrix(XLSX, wb.Sheets[sheetName])),
    };
  }

  // .csv / .txt / anything else: treat as delimited text.
  const text = decodeCsvBytes(bytes);
  const sheet = buildSheet(parseDelimited(text));
  return { fileName: name, sheetNames: [name], getSheet: () => sheet };
}
