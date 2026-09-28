import { coerceValue, detectDateOrder, type DateOrder } from "./coerce";
import type { EntityDef, ParsedRow } from "./types";

/**
 * Applies the column → field mapping to every row: converts each
 * mapped cell to its typed value, collects per-row errors (which
 * block that row) and warnings (which don't), then applies the
 * entity's cross-field rules. Pure — no database access.
 */

export function buildRows(entity: EntityDef, columnFields: (string | null)[], rows: string[][]): ParsedRow[] {
  const colOfField = new Map<string, number>();
  columnFields.forEach((fk, i) => {
    if (fk && !colOfField.has(fk)) colOfField.set(fk, i);
  });

  // Day-first vs month-first is decided once per date column, from the
  // values that can only be read one way — not guessed row by row.
  const dateOrder = new Map<string, DateOrder>();
  for (const f of entity.fields) {
    if ((f.type === "date" || f.type === "datetime") && colOfField.has(f.key)) {
      const col = colOfField.get(f.key)!;
      dateOrder.set(f.key, detectDateOrder(rows.map((r) => r[col] ?? "")));
    }
  }

  return rows.map((raw, idx) => {
    const values: Record<string, unknown> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const f of entity.fields) {
      const col = colOfField.get(f.key);
      if (col === undefined) continue;
      const cell = raw[col] ?? "";
      const res = coerceValue(f, cell, { dateOrder: dateOrder.get(f.key) });
      if (res.error) errors.push(`${f.label}: ${res.error}`);
      if (res.warning) warnings.push(`${f.label}: ${res.warning}`);
      values[f.key] = res.value;
      if (f.required && !errors.length && (res.value === null || res.value === undefined || res.value === "")) {
        errors.push(`${f.label}: obrigatório`);
      }
    }

    finalize(entity, values, errors, warnings);
    return { rowNumber: idx + 2, values, errors, warnings, raw };
  });
}

function finalize(entity: EntityDef, v: Record<string, unknown>, errors: string[], warnings: string[]) {
  switch (entity.key) {
    case "appointments": {
      const datetime = v.datetime as string | null | undefined;
      const date = v.date as string | null | undefined;
      const time = v.time as string | null | undefined;
      const start = datetime || (date && time ? `${date}T${time}` : null);
      if (!start) {
        if (!errors.some((e) => e.startsWith("Data") || e.startsWith("Hora"))) {
          errors.push("Falta a data e/ou o horário do agendamento");
        }
      } else {
        v.start = start;
        const end = v.end_time as string | null | undefined;
        if (end) {
          const endLocal = `${start.slice(0, 10)}T${end}`;
          if (endLocal <= start) errors.push("Hora de término é anterior ao início");
          else v.end = endLocal;
        }
      }
      if (!v.patient_phone && !v.patient_name) errors.push("Falta identificar o paciente (telefone ou nome)");
      break;
    }
    case "transactions": {
      let value = v.value as number | null | undefined;
      if (value === null || value === undefined) break;
      if (!v.type) v.type = value < 0 ? "despesa" : "receita";
      value = Math.abs(value);
      v.value = value;
      if (!v.description) {
        v.description = (v.category as string) || "Lançamento importado";
        warnings.push("Sem descrição — usada a categoria");
      }
      if (value === 0) warnings.push("Valor zerado");
      break;
    }
    case "procedures": {
      if (v.price === null || v.price === undefined) warnings.push("Sem valor — entra como R$ 0,00");
      break;
    }
    default:
      break;
  }
}

export interface ValidationSummary {
  total: number;
  valid: number;
  invalid: number;
  withWarnings: number;
}

export function summarize(rows: ParsedRow[]): ValidationSummary {
  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return {
    total: rows.length,
    valid: rows.length - invalid,
    invalid,
    withWarnings: rows.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length,
  };
}

/** CSV (semicolon + BOM, opens correctly in Brazilian Excel) with the
 *  original cells of every rejected row plus the reason, so the user
 *  can fix just those and import again. */
export function buildErrorCsv(headers: string[], rows: ParsedRow[]): string {
  const esc = (x: string) => (/[;"\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);
  const lines = [[...headers, "Motivo do erro"].map(esc).join(";")];
  for (const r of rows) {
    if (r.errors.length === 0) continue;
    lines.push([...r.raw, r.errors.join(" | ")].map(esc).join(";"));
  }
  return "\uFEFF" + lines.join("\r\n");
}
