import { assignImportedContactTags, resolveImportTagIds } from "@/lib/contacts/resolve-import-tags";
import { isUniqueViolation } from "@/lib/contacts/dedupe";
import { resolveClinicUserId } from "@/lib/stock/stock-operations";
import { normalizeText, tokenize } from "./text";
import type { ImportContext, ImportResult, ParsedRow } from "./types";

/**
 * Writes validated rows to the database. Every importer:
 *  - skips what already exists (safe to re-run the same file)
 *  - writes in chunks, falling back to one-by-one on a chunk error so a
 *    single bad row never sinks its neighbours
 *  - reports created / skipped / failed plus plain-language notes
 *
 * Reads are paginated (Supabase returns at most 1000 rows per query),
 * so duplicate detection stays correct on large accounts.
 */

const CHUNK = 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function emptyResult(): ImportResult {
  return { created: 0, skipped: 0, failed: 0, details: [], notes: [] };
}

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Key for "same phone number": national digits (without country 55). */
export function nationalKey(phone: string): string {
  const d = (phone || "").replace(/\D/g, "");
  return d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
}

async function fetchAllRows(
  ctx: ImportContext,
  table: string,
  columns: string,
  match: Record<string, string>,
  filter?: (q: any) => any,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = ctx.supabase.from(table).select(columns).match(match).order("id");
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

function uniqueSample(values: string[], max = 5): string {
  const u = [...new Set(values)];
  return u.slice(0, max).join(", ") + (u.length > max ? ` e mais ${u.length - max}` : "");
}

/* ═══════════════════════════ contacts + patients ═══════════════════════════ */

interface ContactItem {
  key: string;
  rowNumber: number;
  phone: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  cpf?: string | null;
  birthday?: string | null;
  gender?: string | null;
  address?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string | null;
}

const SEX_CODE: Record<string, string> = { male: "M", female: "F", other: "O" };

interface CreateContactsOutcome {
  /** national phone key → contact id, for created AND already-existing (race) contacts */
  resolved: Map<string, string>;
  createdKeys: Set<string>;
  failed: { rowNumber: number; message: string }[];
  patientConflicts: number;
}

/** Inserts contacts and, following the app's convention, a matching
 *  `patients` row with the SAME id (what the WhatsApp webhook and the
 *  appointment modal already do). */
async function createContacts(
  ctx: ImportContext,
  items: ContactItem[],
  contactType: "client" | "lead",
  progressOffset = 0,
  progressTotal = items.length,
): Promise<CreateContactsOutcome> {
  const out: CreateContactsOutcome = { resolved: new Map(), createdKeys: new Set(), failed: [], patientConflicts: 0 };
  let done = 0;

  for (const group of chunk(items)) {
    const contactRows = group.map((it) => ({
      account_id: ctx.accountId,
      user_id: ctx.userId,
      phone: it.phone,
      name: it.name ?? null,
      email: it.email ?? null,
      company: it.company ?? null,
      cpf: it.cpf ?? null,
      birthday: it.birthday ?? null,
      address: it.address ?? null,
      gender: it.gender ?? null,
      sex: it.gender ? SEX_CODE[it.gender] ?? null : null,
      contact_type: contactType,
      type: contactType === "client" ? "patient" : "lead",
      tags_visual: it.tags ?? [],
    }));

    const createdInGroup: { item: ContactItem; id: string }[] = [];
    const bulk = await ctx.supabase.from("contacts").insert(contactRows).select("id, phone");
    if (!bulk.error && bulk.data) {
      const byKey = new Map<string, string>(bulk.data.map((r: Row) => [nationalKey(r.phone), r.id]));
      for (const it of group) {
        const id = byKey.get(it.key);
        if (id) createdInGroup.push({ item: it, id });
      }
    } else {
      // One bad row (or a race on the unique phone index) — isolate it.
      for (let i = 0; i < group.length; i++) {
        const it = group[i];
        const single = await ctx.supabase.from("contacts").insert(contactRows[i]).select("id, phone").single();
        if (!single.error && single.data) {
          createdInGroup.push({ item: it, id: single.data.id });
        } else if (single.error && isUniqueViolation(single.error)) {
          const { data: found } = await ctx.supabase
            .from("contacts")
            .select("id")
            .eq("account_id", ctx.accountId)
            .eq("phone_normalized", it.phone.replace(/\D/g, ""))
            .maybeSingle();
          if (found) out.resolved.set(it.key, found.id);
          else out.failed.push({ rowNumber: it.rowNumber, message: "Telefone já cadastrado" });
        } else {
          out.failed.push({ rowNumber: it.rowNumber, message: single.error?.message ?? "Erro ao criar contato" });
        }
      }
    }

    for (const { item, id } of createdInGroup) {
      out.resolved.set(item.key, id);
      out.createdKeys.add(item.key);
    }

    // Matching patient rows (same id as the contact).
    const patientRows = createdInGroup.map(({ item, id }) => ({
      id,
      clinic_id: ctx.accountId,
      name: item.name || item.phone,
      phone: item.phone,
      email: item.email ?? null,
      cpf: item.cpf ?? null,
      document: item.cpf ?? null,
      birthday: item.birthday ?? null,
      birthdate: item.birthday ?? null,
      gender: item.gender ?? null,
      notes: item.notes ?? null,
      tags: item.tags ?? [],
      source: item.source || "Importação",
    }));
    if (patientRows.length > 0) {
      const pb = await ctx.supabase.from("patients").insert(patientRows);
      if (pb.error) {
        for (const p of patientRows) {
          const ps = await ctx.supabase.from("patients").insert(p);
          if (ps.error) out.patientConflicts++;
        }
      }
    }

    done += group.length;
    ctx.onProgress?.(progressOffset + done, progressTotal);
  }
  return out;
}

/** Makes sure each contact id has a `patients` row (agenda, documents
 *  and financeiro reference patients). Inserts the missing ones. */
async function ensurePatientRows(ctx: ImportContext, contacts: { id: string; name?: string | null; phone: string }[]) {
  const unique = new Map(contacts.map((c) => [c.id, c]));
  const ids = [...unique.keys()];
  const have = new Set<string>();
  for (const group of chunk(ids, 200)) {
    const { data } = await ctx.supabase.from("patients").select("id").in("id", group);
    (data ?? []).forEach((r: Row) => have.add(r.id));
  }
  const missing = ids.filter((id) => !have.has(id)).map((id) => unique.get(id)!);
  for (const group of chunk(missing)) {
    const rows = group.map((c) => ({ id: c.id, clinic_id: ctx.accountId, name: c.name || c.phone, phone: c.phone }));
    const bulk = await ctx.supabase.from("patients").insert(rows);
    if (bulk.error) for (const r of rows) await ctx.supabase.from("patients").insert(r);
  }
}

export async function importContacts(
  ctx: ImportContext,
  rows: ParsedRow[],
  opts: { contactType: "client" | "lead" },
): Promise<ImportResult> {
  const result = emptyResult();

  const existing = await fetchAllRows(ctx, "contacts", "id, phone", { account_id: ctx.accountId });
  const existingKeys = new Set(existing.map((c) => nationalKey(c.phone)));

  const seen = new Set<string>();
  const items: ContactItem[] = [];
  let repeated = 0;
  let alreadyThere = 0;
  for (const r of rows) {
    const v = r.values;
    const phone = v.phone as string;
    const key = nationalKey(phone);
    if (seen.has(key)) {
      repeated++;
      continue;
    }
    seen.add(key);
    if (existingKeys.has(key)) {
      alreadyThere++;
      continue;
    }
    items.push({
      key,
      rowNumber: r.rowNumber,
      phone,
      name: (v.name as string) ?? null,
      email: (v.email as string) ?? null,
      company: (v.company as string) ?? null,
      cpf: (v.cpf as string) ?? null,
      birthday: (v.birthday as string) ?? null,
      gender: (v.gender as string) ?? null,
      address: (v.address as string) ?? null,
      notes: (v.notes as string) ?? null,
      tags: (v.tags as string[]) ?? [],
      source: (v.source as string) ?? null,
    });
  }
  result.skipped = repeated + alreadyThere;
  if (alreadyThere) result.notes.push(`${alreadyThere} contato(s) já existiam (mesmo telefone) e foram mantidos como estão.`);
  if (repeated) result.notes.push(`${repeated} linha(s) repetida(s) na planilha (mesmo telefone) foram ignoradas.`);

  const outcome = await createContacts(ctx, items, opts.contactType);
  result.created = outcome.createdKeys.size;
  result.failed = outcome.failed.length;
  result.details.push(...outcome.failed);
  if (outcome.patientConflicts) {
    result.notes.push(`${outcome.patientConflicts} contato(s) foram criados, mas já existia um paciente com o mesmo telefone (não vinculado) — vale conferir.`);
  }

  const createdItems = items.filter((it) => outcome.createdKeys.has(it.key));

  // Tags
  const allTagNames = [...new Set(createdItems.flatMap((it) => it.tags ?? []))];
  if (allTagNames.length > 0) {
    try {
      const { tagIdByKey, skippedNames } = await resolveImportTagIds(ctx.supabase, {
        accountId: ctx.accountId,
        userId: ctx.userId,
        tagNames: allTagNames,
        canCreateTags: ctx.canCreateTags,
      });
      const assignments = createdItems
        .filter((it) => (it.tags ?? []).length > 0)
        .map((it) => ({ contactId: outcome.resolved.get(it.key)!, tagNames: it.tags ?? [] }));
      await assignImportedContactTags(ctx.supabase, assignments, tagIdByKey);
      if (skippedNames.length > 0) {
        result.notes.push(`Tags não criadas (só administradores criam tags novas): ${uniqueSample(skippedNames)}.`);
      }
    } catch {
      result.notes.push("Os contatos foram importados, mas houve erro ao aplicar as tags.");
    }
  }

  // Notes ("Observações") become a note on the contact.
  const noteRows = createdItems
    .filter((it) => it.notes)
    .map((it) => ({ contact_id: outcome.resolved.get(it.key)!, account_id: ctx.accountId, user_id: ctx.userId, note_text: it.notes! }));
  let noteFailures = 0;
  for (const group of chunk(noteRows)) {
    const { error } = await ctx.supabase.from("contact_notes").insert(group);
    if (error) noteFailures += group.length;
  }
  if (noteFailures) result.notes.push(`${noteFailures} observação(ões) não puderam ser salvas como nota.`);

  return result;
}

/* ═══════════════════════════ procedures ═══════════════════════════ */

export async function importProcedures(ctx: ImportContext, rows: ParsedRow[]): Promise<ImportResult> {
  const result = emptyResult();
  const existing = await fetchAllRows(ctx, "procedures", "id, name", { clinic_id: ctx.accountId });
  const seen = new Set(existing.map((p) => normalizeText(p.name ?? "")));

  const toInsert: { rowNumber: number; row: Row }[] = [];
  let already = 0;
  let repeated = 0;
  for (const r of rows) {
    const name = r.values.name as string;
    const key = normalizeText(name);
    if (seen.has(key)) {
      // distinguish "was already in the account" from "repeated in file"
      if (existing.some((p) => normalizeText(p.name ?? "") === key)) already++;
      else repeated++;
      continue;
    }
    seen.add(key);
    const price = (r.values.price as number | null) ?? 0;
    const duration = (r.values.duration as number | null) ?? 60;
    toInsert.push({
      rowNumber: r.rowNumber,
      row: {
        clinic_id: ctx.accountId,
        name,
        category: (r.values.category as string) ?? null,
        description: (r.values.description as string) ?? null,
        price,
        valor: price,
        duration_minutes: duration,
        tempo_reserva_minutos: duration,
        is_active: true,
        ativo: true,
      },
    });
  }
  result.skipped = already + repeated;
  if (already) result.notes.push(`${already} procedimento(s) já existiam (mesmo nome) e foram mantidos.`);
  if (repeated) result.notes.push(`${repeated} linha(s) repetida(s) na planilha foram ignoradas.`);

  let done = 0;
  for (const group of chunk(toInsert)) {
    const bulk = await ctx.supabase.from("procedures").insert(group.map((g) => g.row));
    if (!bulk.error) {
      result.created += group.length;
    } else {
      for (const g of group) {
        const one = await ctx.supabase.from("procedures").insert(g.row);
        if (one.error) {
          result.failed++;
          result.details.push({ rowNumber: g.rowNumber, message: one.error.message });
        } else result.created++;
      }
    }
    done += group.length;
    ctx.onProgress?.(done, toInsert.length);
  }
  return result;
}

/* ═══════════════════════════ products / stock ═══════════════════════════ */

export async function importProducts(ctx: ImportContext, rows: ParsedRow[]): Promise<ImportResult> {
  const result = emptyResult();
  const existing = await fetchAllRows(ctx, "stock_products", "id, name, sku", { clinic_id: ctx.accountId });
  const existingSkus = new Set(existing.filter((p) => p.sku).map((p) => String(p.sku).trim().toLowerCase()));
  const existingNames = new Set(existing.map((p) => normalizeText(p.name ?? "")));

  interface Item { rowNumber: number; nameKey: string; row: Row; qty: number; batch: { number: string | null; expiry: string | null } | null; cost: number | null }
  const items: Item[] = [];
  const seenSku = new Set<string>();
  const seenName = new Set<string>();
  let already = 0;
  let repeated = 0;

  for (const r of rows) {
    const v = r.values;
    const name = v.name as string;
    const sku = ((v.sku as string) ?? "").trim();
    const nameKey = normalizeText(name);
    // A SKU identifies the product when present; otherwise the name does.
    const dupExisting = sku ? existingSkus.has(sku.toLowerCase()) : existingNames.has(nameKey);
    const dupInFile = sku ? seenSku.has(sku.toLowerCase()) : seenName.has(nameKey);
    if (dupExisting) { already++; continue; }
    if (dupInFile) { repeated++; continue; }
    if (sku) seenSku.add(sku.toLowerCase());
    else seenName.add(nameKey);

    const qty = (v.quantity as number | null) ?? 0;
    const expiry = (v.expiry_date as string) ?? null;
    const batchNumber = (v.batch_number as string) ?? null;
    items.push({
      rowNumber: r.rowNumber,
      nameKey: `${nameKey}|${sku.toLowerCase()}`,
      qty,
      cost: (v.cost_price as number | null) ?? null,
      batch: qty > 0 && (expiry || batchNumber) ? { number: batchNumber, expiry } : null,
      row: {
        clinic_id: ctx.accountId,
        name,
        sku: sku || null,
        category: (v.category as string) ?? null,
        brand: (v.brand as string) ?? null,
        unit: (v.unit as string) || "un",
        current_quantity: qty,
        min_quantity: (v.min_quantity as number | null) ?? 0,
        cost_price: (v.cost_price as number | null) ?? null,
        sale_price: (v.sale_price as number | null) ?? null,
        is_active: true,
      },
    });
  }
  result.skipped = already + repeated;
  if (already) result.notes.push(`${already} produto(s) já existiam (mesmo SKU ou nome) e foram mantidos, sem alterar o saldo.`);
  if (repeated) result.notes.push(`${repeated} linha(s) repetida(s) na planilha foram ignoradas.`);

  const clinicUserId = await resolveClinicUserId(ctx.supabase, ctx.accountId, ctx.userId);
  let done = 0;
  for (const group of chunk(items)) {
    const inserted: { item: Item; id: string }[] = [];
    const bulk = await ctx.supabase.from("stock_products").insert(group.map((g) => g.row)).select("id, name, sku");
    if (!bulk.error && bulk.data) {
      const byKey = new Map<string, string>(bulk.data.map((p: Row) => [`${normalizeText(p.name)}|${(p.sku ?? "").toLowerCase()}`, p.id]));
      for (const it of group) {
        const id = byKey.get(it.nameKey);
        if (id) inserted.push({ item: it, id });
      }
    } else {
      for (const it of group) {
        const one = await ctx.supabase.from("stock_products").insert(it.row).select("id").single();
        if (one.error || !one.data) {
          result.failed++;
          result.details.push({ rowNumber: it.rowNumber, message: one.error?.message ?? "Erro ao criar produto" });
        } else inserted.push({ item: it, id: one.data.id });
      }
    }
    result.created += inserted.length;

    // Opening balance: a movement (and a lot when validity/lot is given),
    // so the history and the expiry warnings start out consistent.
    const withBatch = inserted.filter((x) => x.item.batch);
    const batchIdByProduct = new Map<string, string>();
    if (withBatch.length > 0) {
      const { data: batches } = await ctx.supabase
        .from("stock_batches")
        .insert(
          withBatch.map((x) => ({
            product_id: x.id,
            clinic_id: ctx.accountId,
            batch_number: x.item.batch!.number,
            expiry_date: x.item.batch!.expiry,
            quantity: x.item.qty,
            cost_price: x.item.cost,
          })),
        )
        .select("id, product_id");
      (batches ?? []).forEach((b: Row) => batchIdByProduct.set(b.product_id, b.id));
    }
    const movements = inserted
      .filter((x) => x.item.qty > 0)
      .map((x) => ({
        clinic_id: ctx.accountId,
        product_id: x.id,
        batch_id: batchIdByProduct.get(x.id) ?? null,
        type: "entrada",
        quantity: x.item.qty,
        reason: "Saldo inicial (importação)",
        created_by: clinicUserId,
      }));
    if (movements.length > 0) {
      const { error } = await ctx.supabase.from("stock_movements").insert(movements);
      if (error) result.notes.push("Alguns saldos iniciais não geraram histórico de movimentação (o saldo em si foi salvo).");
    }

    done += group.length;
    ctx.onProgress?.(done, items.length);
  }
  return result;
}

/* ═══════════════════════════ patient resolution (appointments / finance) ═══════════════════════════ */

interface PatientRef { rowNumber: number; phone: string | null; name: string | null }
type Resolution = { contactId: string; phone: string; name: string | null } | { error: string };

async function resolvePatients(
  ctx: ImportContext,
  refs: PatientRef[],
  opts: { createMissing: boolean },
): Promise<{ byRow: Map<number, Resolution>; createdCount: number }> {
  const contacts = await fetchAllRows(ctx, "contacts", "id, phone, name", { account_id: ctx.accountId });
  const byKey = new Map<string, Row>();
  const byName = new Map<string, Row[]>();
  for (const c of contacts) {
    byKey.set(nationalKey(c.phone), c);
    if (c.name) {
      const n = normalizeText(c.name);
      byName.set(n, [...(byName.get(n) ?? []), c]);
    }
  }

  const byRow = new Map<number, Resolution>();
  const toCreate = new Map<string, ContactItem>();
  const pendingRows: { rowNumber: number; key: string }[] = [];

  for (const ref of refs) {
    if (ref.phone) {
      const key = nationalKey(ref.phone);
      const hit = byKey.get(key);
      if (hit) {
        byRow.set(ref.rowNumber, { contactId: hit.id, phone: hit.phone, name: hit.name });
      } else if (opts.createMissing) {
        if (!toCreate.has(key)) toCreate.set(key, { key, rowNumber: ref.rowNumber, phone: ref.phone, name: ref.name });
        pendingRows.push({ rowNumber: ref.rowNumber, key });
      } else {
        byRow.set(ref.rowNumber, { error: "Paciente não encontrado pelo telefone" });
      }
    } else if (ref.name) {
      const matches = byName.get(normalizeText(ref.name)) ?? [];
      if (matches.length === 1) byRow.set(ref.rowNumber, { contactId: matches[0].id, phone: matches[0].phone, name: matches[0].name });
      else if (matches.length > 1) byRow.set(ref.rowNumber, { error: `Mais de um paciente chamado "${ref.name}" — informe o telefone` });
      else byRow.set(ref.rowNumber, { error: `Paciente "${ref.name}" não encontrado — informe o telefone para criá-lo` });
    } else {
      byRow.set(ref.rowNumber, { error: "Paciente não identificado" });
    }
  }

  let createdCount = 0;
  if (toCreate.size > 0) {
    const out = await createContacts(ctx, [...toCreate.values()], "client", 0, toCreate.size);
    createdCount = out.createdKeys.size;
    const failedRows = new Map(out.failed.map((f) => [f.rowNumber, f.message]));
    for (const p of pendingRows) {
      const id = out.resolved.get(p.key);
      const item = toCreate.get(p.key)!;
      if (id) byRow.set(p.rowNumber, { contactId: id, phone: item.phone, name: item.name ?? null });
      else byRow.set(p.rowNumber, { error: failedRows.get(item.rowNumber) ?? "Não foi possível criar o paciente" });
    }
  }

  // Agenda/documents/financeiro reference `patients`: make sure every
  // resolved contact has that row.
  const resolved = [...byRow.values()].filter((r): r is Extract<Resolution, { contactId: string }> => "contactId" in r);
  await ensurePatientRows(ctx, resolved.map((r) => ({ id: r.contactId, name: r.name, phone: r.phone })));

  return { byRow, createdCount };
}

/* ═══════════════════════════ appointments ═══════════════════════════ */

const TITLE_WORDS = new Set(["dr", "dra", "doutor", "doutora", "prof", "profa"]);

function matchByName<T extends { name: string }>(items: T[], text: string, strip?: Set<string>): T | null {
  const clean = (s: string) => tokenize(s).filter((t) => !strip?.has(t)).join(" ");
  const target = clean(text);
  if (!target) return null;
  const exact = items.find((i) => clean(i.name) === target);
  if (exact) return exact;
  // Otherwise: a unique item whose name contains the text, or vice versa.
  const partial = items.filter((i) => {
    const n = clean(i.name);
    return n && (n.includes(target) || target.includes(n));
  });
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) {
    const longest = [...partial].sort((a, b) => clean(b.name).length - clean(a.name).length);
    return clean(longest[0].name).length > clean(longest[1].name).length ? longest[0] : null;
  }
  return null;
}

export async function importAppointments(
  ctx: ImportContext,
  rows: ParsedRow[],
  opts: { createMissingPatients: boolean },
): Promise<ImportResult> {
  const result = emptyResult();

  const { byRow, createdCount } = await resolvePatients(
    ctx,
    rows.map((r) => ({ rowNumber: r.rowNumber, phone: (r.values.patient_phone as string) ?? null, name: (r.values.patient_name as string) ?? null })),
    { createMissing: opts.createMissingPatients },
  );
  if (createdCount) result.notes.push(`${createdCount} paciente(s) novo(s) foram criados a partir da planilha de agendamentos.`);

  const procedures = (await fetchAllRows(ctx, "procedures", "id, name, duration_minutes", { clinic_id: ctx.accountId })) as { id: string; name: string; duration_minutes: number | null }[];
  const staff = (await fetchAllRows(ctx, "clinic_users", "id, name", { clinic_id: ctx.accountId })) as { id: string; name: string }[];

  interface Prepared { rowNumber: number; key: string; row: Row }
  const prepared: Prepared[] = [];
  const unmatchedProcedures: string[] = [];
  const unmatchedStaff: string[] = [];
  let defaultedPast = 0;
  let futureCount = 0;
  const now = Date.now();

  for (const r of rows) {
    const res = byRow.get(r.rowNumber);
    if (!res || "error" in res) {
      result.failed++;
      result.details.push({ rowNumber: r.rowNumber, message: res && "error" in res ? res.error : "Paciente não identificado" });
      continue;
    }
    const start = new Date(r.values.start as string);
    if (Number.isNaN(start.getTime())) {
      result.failed++;
      result.details.push({ rowNumber: r.rowNumber, message: "Data/hora inválida" });
      continue;
    }

    const procText = (r.values.procedure as string) ?? null;
    const proc = procText ? matchByName(procedures, procText) : null;
    if (procText && !proc) unmatchedProcedures.push(procText);

    const staffText = (r.values.professional as string) ?? null;
    const person = staffText ? matchByName(staff, staffText, TITLE_WORDS) : null;
    if (staffText && !person) unmatchedStaff.push(staffText);

    let end: Date;
    if (r.values.end) end = new Date(r.values.end as string);
    else {
      const minutes = (r.values.duration as number | null) ?? proc?.duration_minutes ?? 60;
      end = new Date(start.getTime() + minutes * 60_000);
    }

    let status = r.values.status as string | null;
    if (!status) {
      status = end.getTime() < now ? "attended" : "provisional";
      if (status === "attended") defaultedPast++;
    }
    if (start.getTime() >= now && status !== "cancelled" && status !== "no_show") futureCount++;

    prepared.push({
      rowNumber: r.rowNumber,
      key: `${res.contactId}|${start.toISOString()}`,
      row: {
        clinic_id: ctx.accountId,
        patient_id: res.contactId,
        professional_id: person?.id ?? null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status,
        notes: (r.values.notes as string) ?? null,
        type: proc?.name ?? procText ?? "Consulta",
        procedure_id: proc?.id ?? null,
      },
    });
  }

  // Skip what's already on the agenda (same patient, same start).
  let existingKeys = new Set<string>();
  if (prepared.length > 0) {
    const times = prepared.map((p) => p.row.start_time as string).sort();
    const existing = await fetchAllRows(ctx, "appointments", "patient_id, start_time", { clinic_id: ctx.accountId }, (q) =>
      q.gte("start_time", times[0]).lte("start_time", times[times.length - 1]),
    );
    existingKeys = new Set(existing.map((a) => `${a.patient_id}|${new Date(a.start_time).toISOString()}`));
  }
  const seen = new Set<string>();
  const toInsert: Prepared[] = [];
  let already = 0;
  let repeated = 0;
  for (const p of prepared) {
    if (existingKeys.has(p.key)) already++;
    else if (seen.has(p.key)) repeated++;
    else {
      seen.add(p.key);
      toInsert.push(p);
    }
  }
  result.skipped = already + repeated;
  if (already) result.notes.push(`${already} agendamento(s) já existiam na agenda (mesmo paciente e horário) e foram ignorados.`);
  if (repeated) result.notes.push(`${repeated} linha(s) repetida(s) na planilha foram ignoradas.`);

  let done = 0;
  for (const group of chunk(toInsert)) {
    const bulk = await ctx.supabase.from("appointments").insert(group.map((g) => g.row));
    if (!bulk.error) result.created += group.length;
    else {
      for (const g of group) {
        const one = await ctx.supabase.from("appointments").insert(g.row);
        if (one.error) {
          result.failed++;
          result.details.push({ rowNumber: g.rowNumber, message: one.error.message });
        } else result.created++;
      }
    }
    done += group.length;
    ctx.onProgress?.(done, toInsert.length);
  }

  if (unmatchedProcedures.length) {
    result.notes.push(`Procedimentos não encontrados no cadastro (o agendamento entrou só com o nome digitado, sem valor previsto): ${uniqueSample(unmatchedProcedures)}. Importe os procedimentos primeiro para vincular.`);
  }
  if (unmatchedStaff.length) {
    result.notes.push(`Profissionais não encontrados na equipe (agendamento ficou "não atribuído"): ${uniqueSample(unmatchedStaff)}.`);
  }
  if (defaultedPast) result.notes.push(`${defaultedPast} agendamento(s) passados sem status entraram como "Realizado".`);
  if (futureCount) {
    result.notes.push(`${futureCount} agendamento(s) futuros entraram na agenda. Se os lembretes automáticos estiverem ativos, os pacientes podem receber mensagens sobre eles.`);
  }
  return result;
}

/* ═══════════════════════════ financial transactions ═══════════════════════════ */

export async function importTransactions(ctx: ImportContext, rows: ParsedRow[]): Promise<ImportResult> {
  const result = emptyResult();

  // Link to a patient when the sheet identifies one; never create
  // patients from financial rows (the sheet may just list free text).
  const refs: PatientRef[] = rows
    .filter((r) => r.values.patient_phone || r.values.patient_name)
    .map((r) => ({ rowNumber: r.rowNumber, phone: (r.values.patient_phone as string) ?? null, name: (r.values.patient_name as string) ?? null }));
  const { byRow } = refs.length > 0 ? await resolvePatients(ctx, refs, { createMissing: false }) : { byRow: new Map<number, Resolution>() };
  let unlinked = 0;

  interface Prepared { rowNumber: number; key: string; row: Row }
  const prepared: Prepared[] = [];
  for (const r of rows) {
    const v = r.values;
    const res = byRow.get(r.rowNumber);
    let patientId: string | null = null;
    if (res) {
      if ("contactId" in res) patientId = res.contactId;
      else unlinked++;
    }
    const date = v.date as string;
    const value = v.value as number;
    const description = v.description as string;
    prepared.push({
      rowNumber: r.rowNumber,
      key: `${date}|${value}|${normalizeText(description)}|${patientId ?? ""}`,
      row: {
        clinic_id: ctx.accountId,
        patient_id: patientId,
        date,
        description,
        category: (v.category as string) || "Importado",
        method: (v.method as string) || "outro",
        type: v.type as string,
        value,
        status: (v.status as string) || "paid",
      },
    });
  }

  // Re-import protection by COUNT, not by set: a clinic often has
  // several identical lines on the same day (three "Pix — R$ 100" with
  // no patient attached) and those are all real revenue. Each line in
  // the file only "uses up" one matching row already in the database;
  // whatever is left over is new. Importing the same file twice
  // therefore adds nothing, while a file with legitimate look-alikes
  // still imports every one of them.
  const existingCounts = new Map<string, number>();
  if (prepared.length > 0) {
    const dates = prepared.map((p) => p.row.date as string).sort();
    const existing = await fetchAllRows(ctx, "financial_transactions", "date, value, description, patient_id", { clinic_id: ctx.accountId }, (q) =>
      q.gte("date", dates[0]).lte("date", dates[dates.length - 1]),
    );
    for (const t of existing) {
      const k = `${String(t.date).slice(0, 10)}|${Number(t.value)}|${normalizeText(t.description ?? "")}|${t.patient_id ?? ""}`;
      existingCounts.set(k, (existingCounts.get(k) ?? 0) + 1);
    }
  }
  const toInsert: Prepared[] = [];
  let already = 0;
  for (const p of prepared) {
    const left = existingCounts.get(p.key) ?? 0;
    if (left > 0) {
      existingCounts.set(p.key, left - 1);
      already++;
    } else {
      toInsert.push(p);
    }
  }
  result.skipped = already;
  if (already) {
    result.notes.push(`${already} lançamento(s) já existiam (mesma data, valor, descrição e paciente) e foram ignorados — reimportar o mesmo arquivo não duplica nada.`);
  }

  let done = 0;
  for (const group of chunk(toInsert)) {
    const bulk = await ctx.supabase.from("financial_transactions").insert(group.map((g) => g.row));
    if (!bulk.error) result.created += group.length;
    else {
      for (const g of group) {
        const one = await ctx.supabase.from("financial_transactions").insert(g.row);
        if (one.error) {
          result.failed++;
          result.details.push({ rowNumber: g.rowNumber, message: one.error.message });
        } else result.created++;
      }
    }
    done += group.length;
    ctx.onProgress?.(done, toInsert.length);
  }

  if (unlinked) result.notes.push(`${unlinked} lançamento(s) citavam um paciente que não foi encontrado — entraram sem vínculo com paciente.`);
  result.notes.push("Taxas de forma de pagamento não são aplicadas a lançamentos importados (o histórico entra pelo valor informado).");
  return result;
}
