/**
 * Shared types for the spreadsheet-import engine (migração de dados).
 */

export type EntityKey = "contacts" | "procedures" | "products" | "appointments" | "transactions";

export type FieldType =
  | "text"
  | "phone"
  | "email"
  | "cpf"
  | "date"
  | "time"
  | "datetime"
  | "number"
  | "money"
  | "minutes"
  | "enum"
  | "list";

export interface FieldDef {
  /** Stable key used by the importers (never shown to the user). */
  key: string;
  /** Portuguese label shown in the UI and used as the template header. */
  label: string;
  type: FieldType;
  required?: boolean;
  /** Header names this field goes by, in Portuguese AND English —
   *  matched accent-, case- and word-order-insensitively. */
  synonyms: string[];
  /** For `enum` fields: canonical value → the spellings that mean it. */
  enumValues?: Record<string, string[]>;
  /** Example cell for the downloadable template. */
  example?: string;
  /** One-line hint shown next to the field in the mapping screen. */
  help?: string;
}

export interface EntityDef {
  key: EntityKey;
  label: string;
  description: string;
  fields: FieldDef[];
  /** Field to auto-assign when an otherwise-unrecognized column is
   *  full of dates (only for entities where that's unambiguous). */
  sniffDateField?: string;
  sniffTimeField?: string;
}

/** How a column ended up mapped — drives the badge in the UI. */
export type MappingSource = "auto" | "content" | "ai" | "manual" | "suggestion";

export interface ColumnMapping {
  fieldKey: string | null;
  source: MappingSource;
  /** 0-100 confidence of the automatic match. */
  score: number;
}

export interface ParsedSheet {
  headers: string[];
  rows: string[][];
}

export interface ParsedRow {
  /** 1-based spreadsheet row number (header is row 1). */
  rowNumber: number;
  values: Record<string, unknown>;
  errors: string[];
  warnings: string[];
  raw: string[];
}

export interface ImportResult {
  created: number;
  skipped: number;
  failed: number;
  /** Per-row problems found while writing to the database. */
  details: { rowNumber: number; message: string }[];
  /** Plain-language notes about what happened (shown in the summary). */
  notes: string[];
}

export interface ImportContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: import("@supabase/supabase-js").SupabaseClient<any, any, any>;
  accountId: string;
  userId: string;
  canCreateTags: boolean;
  onProgress?: (done: number, total: number) => void;
}
