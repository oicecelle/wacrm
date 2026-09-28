import { describe, expect, it } from "vitest";
import {
  coerceValue,
  detectDateOrder,
  parseDateTime,
  parseMinutes,
  parseNumber,
  parsePhone,
  parseTime,
} from "./coerce";
import { detectMapping, scoreHeader } from "./detect";
import { buildTemplateCsv, ENTITIES, getField, missingRequirement } from "./entities";
import { buildSheet, decodeCsvBytes, detectDelimiter, parseDelimited } from "./parse-file";
import { buildErrorCsv, buildRows, summarize } from "./validate";

const field = (entity: keyof typeof ENTITIES, key: string) => getField(ENTITIES[entity], key)!;

describe("parseDateTime", () => {
  it("reads Brazilian day-first dates", () => {
    expect(parseDateTime("28/09/2026")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("5/3/2026")?.ymd).toBe("2026-03-05");
    expect(parseDateTime("28-09-2026")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("28.09.2026")?.ymd).toBe("2026-09-28");
  });
  it("reads ISO and ISO with time", () => {
    expect(parseDateTime("2026-09-28")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("2026-09-28T14:30:00.000Z")).toMatchObject({ ymd: "2026-09-28", time: "14:30" });
    expect(parseDateTime("2026-09-28 09:05")).toMatchObject({ time: "09:05" });
  });
  it("reads date with time in BR format, including 14h30 and AM/PM", () => {
    expect(parseDateTime("28/09/2026 14:30")).toMatchObject({ ymd: "2026-09-28", time: "14:30" });
    expect(parseDateTime("28/09/2026 14h30")).toMatchObject({ time: "14:30" });
    expect(parseDateTime("28/09/2026 2:30 PM")).toMatchObject({ time: "14:30" });
    expect(parseDateTime("28/09/2026 12:00 AM")).toMatchObject({ time: "00:00" });
  });
  it("expands two-digit years with a sensible pivot", () => {
    expect(parseDateTime("15/03/85")?.ymd).toBe("1985-03-15");
    expect(parseDateTime("15/03/20")?.ymd).toBe("2020-03-15");
  });
  it("reads Portuguese and English month names", () => {
    expect(parseDateTime("28 de setembro de 2026")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("28/set/2026")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("1 março 2026")?.ymd).toBe("2026-03-01");
    expect(parseDateTime("Sep 28, 2026")?.ymd).toBe("2026-09-28");
  });
  it("reads Excel serial numbers", () => {
    expect(parseDateTime("46293")?.ymd).toBe("2026-09-28");
    expect(parseDateTime("46293.5")).toMatchObject({ ymd: "2026-09-28", time: "12:00" });
  });
  it("rejects impossible dates", () => {
    expect(parseDateTime("31/02/2026")).toBeNull();
    expect(parseDateTime("32/01/2026")).toBeNull();
    expect(parseDateTime("abc")).toBeNull();
    expect(parseDateTime("")).toBeNull();
  });
  it("swaps day/month only when the column order can't work, and flags it", () => {
    const r = parseDateTime("09/28/2026", "dmy");
    expect(r).toMatchObject({ ymd: "2026-09-28", swapped: true });
    expect(parseDateTime("09/28/2026", "mdy")).toMatchObject({ ymd: "2026-09-28", swapped: false });
  });
});

describe("detectDateOrder", () => {
  it("defaults to day-first", () => {
    expect(detectDateOrder(["01/02/2026", "03/04/2026"])).toBe("dmy");
  });
  it("switches to month-first when a value can only be read that way", () => {
    expect(detectDateOrder(["01/02/2026", "03/28/2026", "05/30/2026"])).toBe("mdy");
  });
  it("stays day-first when values prove day-first", () => {
    expect(detectDateOrder(["28/02/2026", "13/04/2026"])).toBe("dmy");
  });
});

describe("parseTime", () => {
  it("reads common clock formats", () => {
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("9:05")).toBe("09:05");
    expect(parseTime("14h30")).toBe("14:30");
    expect(parseTime("14h")).toBe("14:00");
    expect(parseTime("14:30:00")).toBe("14:30");
    expect(parseTime("2:30 PM")).toBe("14:30");
    expect(parseTime("1430")).toBe("14:30");
  });
  it("rejects nonsense", () => {
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
});

describe("parseNumber", () => {
  it("reads Brazilian money", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("R$ 1.234,56")).toBe(1234.56);
    expect(parseNumber("R$1.200")).toBe(1200);
    expect(parseNumber("350,5")).toBe(350.5);
    expect(parseNumber("0,5")).toBe(0.5);
  });
  it("reads international numbers", () => {
    expect(parseNumber("1,234.56")).toBe(1234.56);
    expect(parseNumber("1234.56")).toBe(1234.56);
    expect(parseNumber("12.5")).toBe(12.5);
    expect(parseNumber("1,234,567")).toBe(1234567);
  });
  it("reads negatives in every common style", () => {
    expect(parseNumber("-100,00")).toBe(-100);
    expect(parseNumber("(100,00)")).toBe(-100);
    expect(parseNumber("100,00-")).toBe(-100);
  });
  it("rejects text", () => {
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("12%")).toBeNull();
  });
});

describe("parseMinutes", () => {
  it("reads durations", () => {
    expect(parseMinutes("60")).toBe(60);
    expect(parseMinutes("45 min")).toBe(45);
    expect(parseMinutes("90 minutos")).toBe(90);
    expect(parseMinutes("1h")).toBe(60);
    expect(parseMinutes("1h30")).toBe(90);
    expect(parseMinutes("1h 30min")).toBe(90);
    expect(parseMinutes("1,5h")).toBe(90);
    expect(parseMinutes("01:30")).toBe(90);
  });
  it("rejects nonsense", () => {
    expect(parseMinutes("muito")).toBeNull();
  });
});

describe("parsePhone", () => {
  it("normalizes typed Brazilian phones", () => {
    expect(parsePhone("(21) 99999-8888").value).toBe("5521999998888");
    expect(parsePhone("21 3333-4444").value).toBe("552133334444");
    expect(parsePhone("+55 21 99999-8888").value).toBe("5521999998888");
    expect(parsePhone("021 99999-8888").value).toBe("5521999998888");
  });
  it("rejects short numbers and scientific notation", () => {
    expect(parsePhone("12345").error).toBeTruthy();
    expect(parsePhone("5.5219999E+12").error).toMatch(/notação científica/);
  });
  it("treats empty as null without error", () => {
    expect(parsePhone("")).toEqual({ value: null });
  });
});

describe("coerceValue", () => {
  it("formats CPF and warns on odd sizes", () => {
    const f = field("contacts", "cpf");
    expect(coerceValue(f, "12345678900").value).toBe("123.456.789-00");
    expect(coerceValue(f, "1234567890").value).toBe("012.345.678-90"); // lost leading zero
    expect(coerceValue(f, "123").warning).toBeTruthy();
  });
  it("validates e-mail", () => {
    const f = field("contacts", "email");
    expect(coerceValue(f, "Maria@Email.com").value).toBe("maria@email.com");
    expect(coerceValue(f, "sem-arroba").error).toBeTruthy();
  });
  it("splits tag lists and de-dupes case-insensitively", () => {
    const f = field("contacts", "tags");
    expect(coerceValue(f, "vip; Botox, vip | novo").value).toEqual(["vip", "Botox", "novo"]);
  });
  it("maps enum values by exact match and by containing a known word", () => {
    const status = field("appointments", "status");
    expect(coerceValue(status, "Confirmado").value).toBe("confirmed");
    expect(coerceValue(status, "NÃO COMPARECEU").value).toBe("no_show");
    expect(coerceValue(status, "Confirmado pelo WhatsApp").value).toBe("confirmed");
    expect(coerceValue(status, "Desmarcou").value).toBe("cancelled");
    expect(coerceValue(status, "talvez amanhã").error).toBeTruthy();
    const gender = field("contacts", "gender");
    expect(coerceValue(gender, "F").value).toBe("female");
    expect(coerceValue(gender, "Masculino").value).toBe("male");
    const method = field("transactions", "method");
    expect(coerceValue(method, "Cartão de Crédito").value).toBe("credito");
    expect(coerceValue(method, "PIX").value).toBe("pix");
  });
  it("treats blank cells as null, never as an error", () => {
    expect(coerceValue(field("contacts", "birthday"), "   ")).toEqual({ value: null });
  });
  it("treats placeholder cells ('-', 'N/A', 'não informado') as empty, not invalid", () => {
    const birthday = field("contacts", "birthday");
    for (const v of ["-", "--", "???", "N/A", "n/a", "NULL", "Não informado", "nenhum"]) {
      expect(coerceValue(birthday, v), v).toEqual({ value: null });
    }
    expect(coerceValue(field("contacts", "name"), "Ana").value).toBe("Ana");
  });
});

describe("scoreHeader — PT/EN synonyms", () => {
  const phone = field("contacts", "phone");
  it("matches exactly, ignoring accents and case", () => {
    expect(scoreHeader("TELEFONE", phone)).toBe(100);
    expect(scoreHeader("Celular", phone)).toBe(100);
    expect(scoreHeader("Phone Number", phone)).toBe(100);
  });
  it("matches same words in a different order or with connectors", () => {
    const birthday = field("contacts", "birthday");
    expect(scoreHeader("Data Nascimento", birthday)).toBeGreaterThanOrEqual(95);
    expect(scoreHeader("Nascimento (data)", birthday)).toBeGreaterThanOrEqual(85);
    expect(scoreHeader("Date of Birth", birthday)).toBeGreaterThanOrEqual(95);
  });
  it("matches a synonym plus extra words at lower confidence", () => {
    const s = scoreHeader("Telefone Celular 2", phone);
    expect(s).toBeGreaterThanOrEqual(75);
    expect(s).toBeLessThan(100);
  });
  it("does not match unrelated headers", () => {
    expect(scoreHeader("Observações", phone)).toBe(0);
    expect(scoreHeader("", phone)).toBe(0);
  });
});

describe("detectMapping", () => {
  const map = (entity: keyof typeof ENTITIES, headers: string[], rows: string[][] = []) =>
    detectMapping(ENTITIES[entity], headers, rows).map((m) => m.fieldKey);

  it("maps a Portuguese contacts sheet", () => {
    expect(map("contacts", ["Nome Completo", "Celular", "E-mail", "Data de Nascimento", "CPF", "Sexo", "Observações", "Etiquetas"])).toEqual([
      "name", "phone", "email", "birthday", "cpf", "gender", "notes", "tags",
    ]);
  });
  it("maps an English contacts sheet", () => {
    expect(map("contacts", ["Full Name", "Mobile", "Email Address", "Date of Birth", "Company", "Tags"])).toEqual([
      "name", "phone", "email", "birthday", "company", "tags",
    ]);
  });
  it("maps a procedures sheet", () => {
    expect(map("procedures", ["Procedimento", "Valor (R$)", "Duração (min)", "Categoria"])).toEqual(["name", "price", "duration", "category"]);
  });
  it("maps a stock sheet with Portuguese headers", () => {
    expect(map("products", ["Produto", "Código", "Marca", "Estoque Atual", "Estoque Mínimo", "Preço de Custo", "Preço de Venda", "Validade", "Lote"])).toEqual([
      "name", "sku", "brand", "quantity", "min_quantity", "cost_price", "sale_price", "expiry_date", "batch_number",
    ]);
  });
  it("maps an appointments sheet", () => {
    expect(map("appointments", ["Paciente", "Telefone", "Data", "Hora Início", "Hora Fim", "Procedimento", "Profissional", "Status"])).toEqual([
      "patient_name", "patient_phone", "date", "time", "end_time", "procedure", "professional", "status",
    ]);
  });
  it("maps a financial sheet", () => {
    expect(map("transactions", ["Data", "Descrição", "Valor", "Tipo", "Forma de Pagamento", "Situação", "Cliente"])).toEqual([
      "date", "description", "value", "type", "method", "status", "patient_name",
    ]);
  });
  it("uses each field at most once", () => {
    const m = map("contacts", ["Telefone", "Celular", "Nome"]).filter(Boolean);
    expect(new Set(m).size).toBe(m.length);
  });
  it("places unnamed columns by their content", () => {
    const rows = [
      ["Maria", "x@a.com", "(21) 99999-1111", "12345678900"],
      ["João", "y@b.com", "(21) 98888-2222", "98765432100"],
      ["Ana", "z@c.com", "(11) 97777-3333", "11122233344"],
    ];
    const m = detectMapping(ENTITIES.contacts, ["Nome", "Coluna 2", "Coluna 3", "Coluna 4"], rows);
    expect(m[1]).toMatchObject({ fieldKey: "email", source: "content" });
    expect(m[2]).toMatchObject({ fieldKey: "phone", source: "content" });
    expect(m[3]).toMatchObject({ fieldKey: "cpf", source: "content" });
  });
  it("does not mistake CPFs or dates for phones", () => {
    const rows = [["123.456.789-00", "28/09/2026"], ["987.654.321-00", "29/09/2026"]];
    const m = detectMapping(ENTITIES.contacts, ["A", "B"], rows);
    expect(m[0].fieldKey).toBe("cpf");
    expect(m[1].fieldKey).not.toBe("phone");
  });
  it("only proposes weak matches as suggestions, not automatic mappings", () => {
    const m = detectMapping(ENTITIES.contacts, ["Data"], []);
    expect(m[0].source).toBe("suggestion");
  });
});

describe("required fields", () => {
  it("asks for a phone before importing contacts", () => {
    expect(missingRequirement(ENTITIES.contacts, new Set(["name"]))).toMatch(/Telefone/);
    expect(missingRequirement(ENTITIES.contacts, new Set(["phone"]))).toBeNull();
  });
  it("needs a start moment and a patient for appointments", () => {
    expect(missingRequirement(ENTITIES.appointments, new Set(["patient_name"]))).toMatch(/horário/);
    expect(missingRequirement(ENTITIES.appointments, new Set(["date", "time"]))).toMatch(/paciente/);
    expect(missingRequirement(ENTITIES.appointments, new Set(["datetime", "patient_phone"]))).toBeNull();
    expect(missingRequirement(ENTITIES.appointments, new Set(["date", "time", "patient_name"]))).toBeNull();
  });
});

describe("parseDelimited", () => {
  it("detects semicolon delimiters (Brazilian Excel)", () => {
    expect(detectDelimiter("nome;telefone\nMaria;21999998888")).toBe(";");
    expect(detectDelimiter("nome,telefone\nMaria,21999998888")).toBe(",");
    expect(detectDelimiter("nome\ttelefone\nMaria\t21999998888")).toBe("\t");
  });
  it("handles quotes, escaped quotes, embedded delimiters and newlines", () => {
    const csv = 'nome;obs\r\n"Silva; Maria";"disse ""oi""\nlinha 2"\r\nAna;ok';
    expect(parseDelimited(csv)).toEqual([
      ["nome", "obs"],
      ["Silva; Maria", 'disse "oi"\nlinha 2'],
      ["Ana", "ok"],
    ]);
  });
  it("strips a BOM and skips blank lines", () => {
    expect(parseDelimited("\uFEFFa,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("decodes Windows-1252 when the bytes aren't valid UTF-8", () => {
    const bytes = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]); // "João" in cp1252
    expect(decodeCsvBytes(bytes.buffer)).toBe("João");
    expect(decodeCsvBytes(new TextEncoder().encode("João").buffer)).toBe("João");
  });
});

describe("buildSheet", () => {
  it("skips title rows above the header and names blank/duplicate headers", () => {
    const sheet = buildSheet([
      ["Relatório de pacientes", "", ""],
      ["", "", ""],
      ["Nome", "Telefone", "Telefone"],
      ["Maria", "1", "2"],
      ["", "", ""],
      ["Ana", "3"],
    ]);
    expect(sheet.headers).toEqual(["Nome", "Telefone", "Telefone (2)"]);
    expect(sheet.rows).toEqual([["Maria", "1", "2"], ["Ana", "3", ""]]);
  });
  it("returns empty for an empty matrix", () => {
    expect(buildSheet([])).toEqual({ headers: [], rows: [] });
  });
});

describe("buildRows", () => {
  it("validates contacts row by row", () => {
    const rows = buildRows(
      ENTITIES.contacts,
      ["name", "phone", "email"],
      [
        ["Maria", "(21) 99999-8888", "maria@email.com"],
        ["Sem Fone", "", "x@y.com"],
        ["Fone Ruim", "123", ""],
        ["Email Ruim", "21999997777", "nao-e-email"],
      ],
    );
    expect(rows.map((r) => r.errors.length > 0)).toEqual([false, true, true, true]);
    expect(rows[0].values).toMatchObject({ name: "Maria", phone: "5521999998888", email: "maria@email.com" });
    expect(rows[1].errors[0]).toMatch(/Telefone.*obrigatório/);
    expect(rows[0].rowNumber).toBe(2);
    expect(summarize(rows)).toMatchObject({ total: 4, valid: 1, invalid: 3 });
  });
  it("builds appointment start/end from separate date and time columns", () => {
    const [r] = buildRows(
      ENTITIES.appointments,
      ["patient_name", "date", "time", "end_time"],
      [["Maria", "28/09/2026", "14h30", "15:30"]],
    );
    expect(r.errors).toEqual([]);
    expect(r.values).toMatchObject({ start: "2026-09-28T14:30", end: "2026-09-28T15:30" });
  });
  it("accepts a combined date-time column and rejects a missing time", () => {
    const [ok, bad] = buildRows(
      ENTITIES.appointments,
      ["patient_phone", "datetime"],
      [["21999998888", "28/09/2026 09:00"], ["21999998888", "28/09/2026"]],
    );
    expect(ok.values.start).toBe("2026-09-28T09:00");
    expect(bad.errors.length).toBeGreaterThan(0);
  });
  it("rejects an end time before the start", () => {
    const [r] = buildRows(ENTITIES.appointments, ["patient_name", "date", "time", "end_time"], [["Maria", "28/09/2026", "15:00", "14:00"]]);
    expect(r.errors.join()).toMatch(/término/);
  });
  it("infers transaction type from the sign and stores the absolute value", () => {
    const rows = buildRows(ENTITIES.transactions, ["date", "value", "description"], [
      ["01/09/2026", "1.200,00", "Botox"],
      ["02/09/2026", "-350,00", "Aluguel"],
    ]);
    expect(rows[0].values).toMatchObject({ type: "receita", value: 1200 });
    expect(rows[1].values).toMatchObject({ type: "despesa", value: 350 });
  });
  it("falls back to the category when a transaction has no description", () => {
    const [r] = buildRows(ENTITIES.transactions, ["date", "value", "category"], [["01/09/2026", "10", "Vendas"]]);
    expect(r.values.description).toBe("Vendas");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("uses month-first for a whole column when one value proves it", () => {
    const rows = buildRows(ENTITIES.transactions, ["date", "value"], [
      ["03/04/2026", "1"],
      ["03/28/2026", "1"],
    ]);
    expect(rows[0].values.date).toBe("2026-03-04");
    expect(rows[1].values.date).toBe("2026-03-28");
  });
  it("requires the procedure name", () => {
    const [r] = buildRows(ENTITIES.procedures, ["name", "price"], [["", "100"]]);
    expect(r.errors.join()).toMatch(/obrigatório/);
  });
});

describe("buildErrorCsv / buildTemplateCsv", () => {
  it("exports only rejected rows, with the reason, semicolon-delimited with BOM", () => {
    const rows = buildRows(ENTITIES.contacts, ["name", "phone"], [["Ok", "21999998888"], ["Ruim", "1"]]);
    const csv = buildErrorCsv(["Nome", "Telefone"], rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("Nome;Telefone;Motivo do erro");
    expect(lines[1]).toMatch(/^Ruim;1;/);
  });
  it("builds a Portuguese template that its own detector maps completely", () => {
    for (const entity of Object.values(ENTITIES)) {
      const csv = buildTemplateCsv(entity);
      const parsed = parseDelimited(csv);
      const mapped = detectMapping(entity, parsed[0], parsed.slice(1)).map((m) => m.fieldKey);
      expect(mapped, entity.key).toEqual(entity.fields.map((f) => f.key));
    }
  });
});
