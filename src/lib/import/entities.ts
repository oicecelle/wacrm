import type { EntityDef, EntityKey, FieldDef } from "./types";

/**
 * The dictionary that drives deterministic column detection: for each
 * field of each importable entity, every header name it is commonly
 * exported under — Portuguese AND English, covering what the big
 * Brazilian clinic systems (Clinicorp, Clínica Experts, Trinks,
 * Feegow, Amigo Tech...) and generic spreadsheets tend to call it.
 *
 * Matching is accent-, case- and word-order-insensitive (see
 * detect.ts), so "Data de Nascimento", "data nascimento" and
 * "NASCIMENTO (data)" all hit the same synonym — there's no need to
 * list every spelling variant, only distinct words.
 */

const PHONE_SYNONYMS = [
  // "contato" and "numero" alone are deliberately NOT here: in real
  // exports they're often a person's name or a street number.
  "telefone", "celular", "whatsapp", "whats", "zap", "fone", "tel", "cel", "telefone celular",
  "telefone principal", "telefone 1", "celular 1", "numero de telefone", "numero do whatsapp", "telefone contato",
  "phone", "mobile", "cell", "cellphone", "phone number", "telephone", "mobile phone", "contact number", "whatsapp number",
];

const STATUS_APPOINTMENT: Record<string, string[]> = {
  confirmed: ["confirmado", "confirmada", "confirmou", "confirmed", "confirmado pelo paciente"],
  provisional: [
    "agendado", "agendada", "marcado", "marcada", "pendente", "aguardando", "aguardando confirmacao", "a confirmar",
    "provisorio", "reservado", "scheduled", "booked", "pending", "tentative", "novo",
  ],
  attended: [
    "atendido", "atendida", "realizado", "realizada", "compareceu", "concluido", "concluida", "finalizado", "finalizada",
    "presente", "em atendimento", "attended", "completed", "done", "finished", "checked out",
  ],
  cancelled: ["cancelado", "cancelada", "cancelou", "desmarcado", "desmarcada", "desmarcou", "excluido", "cancelled", "canceled"],
  no_show: ["faltou", "falta", "nao compareceu", "ausente", "no show", "noshow", "no-show", "absent", "missed", "faltante"],
};

const TYPE_TRANSACTION: Record<string, string[]> = {
  receita: [
    "receita", "receitas", "entrada", "entradas", "recebimento", "recebido", "recebida", "credito", "venda", "vendas",
    "income", "revenue", "in", "credit", "sale", "inflow",
  ],
  despesa: [
    "despesa", "despesas", "saida", "saidas", "pagamento", "custo", "custos", "gasto", "gastos", "compra", "debito",
    "expense", "expenses", "cost", "out", "debit", "payable", "outflow",
  ],
  sinal: ["sinal", "sinais", "deposito", "adiantamento", "reserva", "deposit", "down payment"],
};

const STATUS_TRANSACTION: Record<string, string[]> = {
  paid: ["pago", "paga", "recebido", "recebida", "quitado", "quitada", "liquidado", "liquidada", "baixado", "paid", "received", "settled", "cleared", "sim"],
  pending: ["pendente", "a receber", "a pagar", "em aberto", "aberto", "aberta", "aguardando", "previsto", "pending", "open", "scheduled", "nao"],
  overdue: ["vencido", "vencida", "atrasado", "atrasada", "inadimplente", "em atraso", "overdue", "late", "past due"],
};

const METHOD_TRANSACTION: Record<string, string[]> = {
  pix: ["pix", "pix qr", "chave pix"],
  dinheiro: ["dinheiro", "especie", "cash", "em maos", "a vista dinheiro"],
  debito: ["debito", "cartao de debito", "cartao debito", "debit", "debit card"],
  credito: ["credito", "cartao de credito", "cartao credito", "cartao", "credit", "credit card", "parcelado", "visa", "master", "mastercard", "elo", "amex", "hipercard"],
  transferencia: ["transferencia", "ted", "doc", "tef", "transfer", "bank transfer", "deposito bancario"],
  boleto: ["boleto", "boleto bancario", "bank slip"],
  outro: ["outro", "outros", "other"],
};

const GENDER: Record<string, string[]> = {
  male: ["masculino", "masc", "m", "homem", "male", "man", "h"],
  female: ["feminino", "fem", "f", "mulher", "female", "woman"],
  other: ["outro", "outros", "o", "nao binario", "other", "non binary", "nb"],
};

export const ENTITIES: Record<EntityKey, EntityDef> = {
  /* ───────────────────────── Pacientes / contatos ───────────────────────── */
  contacts: {
    key: "contacts",
    label: "Pacientes e contatos",
    description: "Sua base de clientes: nome, telefone, e-mail, CPF, nascimento, tags, observações...",
    fields: [
      {
        key: "phone", label: "Telefone", type: "phone", required: true, example: "(21) 99999-8888",
        help: "Obrigatório — é o que identifica a pessoa e evita duplicidade.",
        synonyms: PHONE_SYNONYMS,
      },
      {
        key: "name", label: "Nome", type: "text", example: "Maria Silva",
        synonyms: [
          "nome", "nome completo", "nome do paciente", "nome do cliente", "paciente", "cliente", "nome e sobrenome",
          "name", "full name", "fullname", "patient", "patient name", "customer", "customer name", "client", "client name",
        ],
      },
      {
        key: "email", label: "E-mail", type: "email", example: "maria@email.com",
        synonyms: ["email", "e mail", "correio eletronico", "endereco de email", "mail", "email address", "e-mail"],
      },
      {
        key: "cpf", label: "CPF", type: "cpf", example: "123.456.789-00",
        synonyms: ["cpf", "cpf cnpj", "cnpj", "documento", "numero do documento", "cpf do paciente", "document", "tax id", "national id", "id number"],
      },
      {
        key: "birthday", label: "Data de nascimento", type: "date", example: "15/03/1990",
        synonyms: [
          "nascimento", "data de nascimento", "data nasc", "dt nascimento", "dt nasc", "nasc", "aniversario", "data de aniversario",
          "birthday", "birth", "birthdate", "birth date", "date of birth", "dob",
        ],
      },
      {
        key: "gender", label: "Sexo / gênero", type: "enum", example: "Feminino", enumValues: GENDER,
        synonyms: ["sexo", "genero", "gender", "sex"],
      },
      {
        key: "company", label: "Empresa", type: "text", example: "Clínica X",
        synonyms: ["empresa", "organizacao", "razao social", "company", "organization", "business", "employer"],
      },
      {
        key: "address", label: "Endereço", type: "text", example: "Rua A, 100 - Centro",
        synonyms: ["endereco", "endereco completo", "logradouro", "rua", "address", "street", "street address", "location"],
      },
      {
        key: "source", label: "Origem do contato", type: "text", example: "Instagram",
        help: "Como o paciente chegou (Instagram, indicação...). Alimenta o relatório de origens.",
        synonyms: ["origem", "fonte", "canal", "como conheceu", "como nos conheceu", "captacao", "indicacao", "source", "origin", "channel", "lead source", "referral"],
      },
      {
        key: "tags", label: "Tags", type: "list", example: "vip, botox",
        help: "Separe várias com vírgula ou ponto e vírgula. Tags novas são criadas automaticamente.",
        synonyms: ["tags", "tag", "etiquetas", "etiqueta", "marcadores", "grupos", "grupo", "categorias", "labels", "label", "segmento"],
      },
      {
        key: "notes", label: "Observações", type: "text", example: "Alergia a lidocaína",
        help: "Vira uma nota no perfil do contato.",
        synonyms: ["observacao", "observacoes", "obs", "anotacoes", "anotacao", "notas", "nota", "comentarios", "comentario", "notes", "note", "comments", "remarks"],
      },
    ],
  },

  /* ───────────────────────── Procedimentos / serviços ───────────────────────── */
  procedures: {
    key: "procedures",
    label: "Procedimentos e serviços",
    description: "Seu catálogo: nome, valor, duração, categoria.",
    fields: [
      {
        key: "name", label: "Procedimento", type: "text", required: true, example: "Toxina Botulínica",
        synonyms: [
          "procedimento", "servico", "nome do procedimento", "nome do servico", "tratamento", "nome", "item", "descricao do servico",
          "procedure", "service", "treatment", "name", "service name", "procedure name", "item name",
        ],
      },
      {
        key: "price", label: "Valor (R$)", type: "money", example: "1.200,00",
        synonyms: ["valor", "preco", "preco de venda", "valor do procedimento", "valor do servico", "valor cobrado", "tabela", "price", "value", "amount", "sale price", "rate", "fee"],
      },
      {
        key: "duration", label: "Duração", type: "minutes", example: "60",
        help: "Em minutos, ou no formato 1h30.",
        synonyms: ["duracao", "tempo", "tempo de duracao", "tempo de atendimento", "minutos", "tempo estimado", "duration", "time", "minutes", "length", "duration min"],
      },
      {
        key: "category", label: "Categoria", type: "text", example: "Facial",
        synonyms: ["categoria", "grupo", "tipo", "area", "especialidade", "linha", "category", "group", "type", "specialty", "department"],
      },
      {
        key: "description", label: "Descrição", type: "text", example: "Aplicação em 3 áreas",
        synonyms: ["descricao", "detalhes", "detalhe", "observacao", "obs", "description", "details", "notes"],
      },
    ],
  },

  /* ───────────────────────── Produtos / estoque ───────────────────────── */
  products: {
    key: "products",
    label: "Produtos e estoque",
    description: "Insumos e produtos, com saldo atual, mínimo, custo e validade.",
    fields: [
      {
        key: "name", label: "Produto", type: "text", required: true, example: "Ácido Hialurônico 1ml",
        synonyms: ["produto", "nome do produto", "nome", "insumo", "material", "item", "descricao", "product", "product name", "name", "item name", "supply"],
      },
      {
        key: "sku", label: "Código / SKU", type: "text", example: "AH-001",
        synonyms: ["sku", "codigo", "cod", "codigo do produto", "codigo de barras", "ean", "referencia", "ref", "code", "barcode", "product code", "reference"],
      },
      {
        key: "category", label: "Categoria", type: "text", example: "Preenchedores",
        synonyms: ["categoria", "grupo", "tipo", "familia", "category", "group", "type", "family"],
      },
      {
        key: "brand", label: "Marca", type: "text", example: "Allergan",
        synonyms: ["marca", "fabricante", "laboratorio", "fornecedor", "brand", "manufacturer", "vendor", "supplier"],
      },
      {
        key: "unit", label: "Unidade", type: "text", example: "un",
        synonyms: ["unidade", "un", "und", "unid", "unidade de medida", "medida", "um", "unit", "uom", "unit of measure"],
      },
      {
        key: "quantity", label: "Quantidade atual", type: "number", example: "10",
        help: "Vira o saldo inicial do estoque.",
        synonyms: [
          "quantidade", "qtd", "qtde", "qde", "estoque", "estoque atual", "saldo", "saldo atual", "quantidade atual", "quantidade em estoque",
          "quantity", "qty", "stock", "on hand", "in stock", "current stock", "balance",
        ],
      },
      {
        key: "min_quantity", label: "Estoque mínimo", type: "number", example: "2",
        synonyms: ["estoque minimo", "minimo", "qtd minima", "quantidade minima", "ponto de reposicao", "estoque de seguranca", "min", "minimum", "min stock", "min quantity", "reorder level", "reorder point"],
      },
      {
        key: "cost_price", label: "Preço de custo (R$)", type: "money", example: "350,00",
        synonyms: ["custo", "preco de custo", "valor de custo", "custo unitario", "valor pago", "cost", "cost price", "unit cost", "purchase price"],
      },
      {
        key: "sale_price", label: "Preço de venda (R$)", type: "money", example: "590,00",
        synonyms: ["venda", "preco de venda", "valor de venda", "preco", "valor", "sale price", "selling price", "price", "retail price"],
      },
      {
        key: "expiry_date", label: "Validade", type: "date", example: "31/12/2027",
        help: "Se informar, o saldo vira um lote com essa validade (aparece nos avisos de vencimento).",
        synonyms: ["validade", "vencimento", "data de validade", "data de vencimento", "vence em", "expiracao", "expiry", "expiry date", "expiration", "expiration date", "expires", "exp date", "best before"],
      },
      {
        key: "batch_number", label: "Lote", type: "text", example: "L2401",
        synonyms: ["lote", "numero do lote", "n lote", "batch", "batch number", "lot", "lot number"],
      },
    ],
  },

  /* ───────────────────────── Agendamentos ───────────────────────── */
  appointments: {
    key: "appointments",
    label: "Agendamentos",
    description: "Agenda e histórico de atendimentos: paciente, data, horário, procedimento, profissional, status.",
    sniffDateField: "date",
    sniffTimeField: "time",
    fields: [
      {
        key: "patient_phone", label: "Telefone do paciente", type: "phone", example: "(21) 99999-8888",
        help: "Melhor forma de ligar o agendamento ao paciente certo. Sem telefone, o casamento é pelo nome.",
        synonyms: PHONE_SYNONYMS,
      },
      {
        key: "patient_name", label: "Nome do paciente", type: "text", example: "Maria Silva",
        synonyms: [
          "paciente", "cliente", "nome", "nome do paciente", "nome do cliente", "nome completo",
          "patient", "patient name", "client", "client name", "customer", "customer name", "name",
        ],
      },
      {
        key: "datetime", label: "Data e hora (junto)", type: "datetime", example: "28/09/2026 14:30",
        help: "Use se data e hora vêm na mesma coluna.",
        synonyms: ["data e hora", "data hora", "datahora", "data e horario", "inicio", "data de inicio", "start", "start date", "start time", "datetime", "date time", "begins"],
      },
      {
        key: "date", label: "Data", type: "date", example: "28/09/2026",
        synonyms: ["data", "dia", "data do agendamento", "data da consulta", "data do atendimento", "data agendada", "date", "day", "appointment date"],
      },
      {
        key: "time", label: "Hora de início", type: "time", example: "14:30",
        synonyms: ["hora", "horario", "hora inicio", "hora de inicio", "hora inicial", "hr", "time", "start time", "hora do agendamento", "hora da consulta"],
      },
      {
        key: "end_time", label: "Hora de término", type: "time", example: "15:30",
        synonyms: ["hora fim", "hora final", "hora de fim", "hora termino", "hora de termino", "fim", "termino", "ate", "end", "end time", "finish"],
      },
      {
        key: "duration", label: "Duração", type: "minutes", example: "60",
        help: "Usada quando não há hora de término. Sem ela, usa a duração do procedimento.",
        synonyms: ["duracao", "tempo", "minutos", "tempo de atendimento", "duration", "minutes", "length"],
      },
      {
        key: "procedure", label: "Procedimento", type: "text", example: "Toxina Botulínica",
        synonyms: ["procedimento", "servico", "tratamento", "atendimento", "tipo de atendimento", "procedimentos", "procedure", "service", "treatment", "appointment type"],
      },
      {
        key: "professional", label: "Profissional", type: "text", example: "Dra. Ana",
        synonyms: [
          "profissional", "doutor", "doutora", "dr", "dra", "medico", "medica", "esteticista", "atendente", "responsavel", "executor", "profissional responsavel",
          "professional", "doctor", "staff", "provider", "practitioner", "employee", "assigned to",
        ],
      },
      {
        key: "status", label: "Status", type: "enum", example: "Confirmado", enumValues: STATUS_APPOINTMENT,
        help: "Sem status: o que já passou entra como Realizado e o futuro como Pendente.",
        synonyms: ["status", "situacao", "estado", "status do agendamento", "confirmacao", "situacao do agendamento", "state", "appointment status"],
      },
      {
        key: "notes", label: "Observações", type: "text", example: "Primeira sessão",
        synonyms: ["observacao", "observacoes", "obs", "anotacoes", "notas", "comentarios", "notes", "comments", "remarks"],
      },
    ],
  },

  /* ───────────────────────── Financeiro ───────────────────────── */
  transactions: {
    key: "transactions",
    label: "Financeiro (lançamentos)",
    description: "Histórico de receitas e despesas: data, descrição, valor, forma de pagamento, status.",
    sniffDateField: "date",
    fields: [
      {
        key: "date", label: "Data", type: "date", required: true, example: "28/09/2026",
        synonyms: [
          "data", "data do pagamento", "data de pagamento", "data do lancamento", "data lancamento", "vencimento", "data de vencimento", "data da venda", "competencia",
          "date", "payment date", "due date", "transaction date", "posted",
        ],
      },
      {
        key: "value", label: "Valor (R$)", type: "money", required: true, example: "1.200,00",
        help: "Valores negativos são tratados como despesa quando não há coluna de tipo.",
        synonyms: ["valor", "total", "montante", "quantia", "valor pago", "valor total", "valor liquido", "valor bruto", "amount", "value", "total amount", "sum"],
      },
      {
        key: "description", label: "Descrição", type: "text", example: "Botox - Maria",
        synonyms: ["descricao", "historico", "lancamento", "detalhes", "referente a", "observacao", "description", "memo", "details", "notes", "reference"],
      },
      {
        key: "type", label: "Tipo (receita/despesa)", type: "enum", example: "Receita", enumValues: TYPE_TRANSACTION,
        synonyms: ["tipo", "natureza", "movimento", "tipo de lancamento", "tipo de movimento", "entrada saida", "receita despesa", "type", "kind", "direction", "transaction type"],
      },
      {
        key: "category", label: "Categoria", type: "text", example: "Procedimentos",
        synonyms: ["categoria", "plano de contas", "categoria financeira", "centro de custo", "conta", "grupo", "category", "account", "cost center"],
      },
      {
        key: "method", label: "Forma de pagamento", type: "enum", example: "Pix", enumValues: METHOD_TRANSACTION,
        synonyms: ["forma de pagamento", "forma pagamento", "meio de pagamento", "pagamento", "metodo", "forma", "payment method", "method", "payment type", "payment"],
      },
      {
        key: "status", label: "Status", type: "enum", example: "Pago", enumValues: STATUS_TRANSACTION,
        help: "Sem status, os lançamentos entram como Pagos.",
        synonyms: ["status", "situacao", "estado", "pago", "quitado", "state", "payment status", "paid"],
      },
      {
        key: "patient_phone", label: "Telefone do paciente", type: "phone", example: "(21) 99999-8888",
        synonyms: PHONE_SYNONYMS,
      },
      {
        key: "patient_name", label: "Nome do paciente", type: "text", example: "Maria Silva",
        synonyms: ["paciente", "cliente", "nome do paciente", "nome do cliente", "nome", "patient", "patient name", "client", "customer", "customer name", "name"],
      },
    ],
  },
};

export const ENTITY_LIST: EntityDef[] = [
  ENTITIES.contacts,
  ENTITIES.procedures,
  ENTITIES.products,
  ENTITIES.appointments,
  ENTITIES.transactions,
];

export function getField(entity: EntityDef, key: string): FieldDef | undefined {
  return entity.fields.find((f) => f.key === key);
}

/** What still needs to be mapped before the import can run, or null. */
export function missingRequirement(entity: EntityDef, mappedKeys: Set<string>): string | null {
  for (const f of entity.fields) {
    if (f.required && !mappedKeys.has(f.key)) return `Falta mapear a coluna "${f.label}".`;
  }
  if (entity.key === "appointments") {
    const hasStart = mappedKeys.has("datetime") || (mappedKeys.has("date") && mappedKeys.has("time"));
    if (!hasStart) return 'Falta a data e o horário: mapeie "Data" + "Hora de início", ou "Data e hora (junto)".';
    if (!mappedKeys.has("patient_phone") && !mappedKeys.has("patient_name")) {
      return 'Falta identificar o paciente: mapeie "Telefone do paciente" ou "Nome do paciente".';
    }
  }
  return null;
}

/** Downloadable template: Portuguese headers + one example row. */
export function buildTemplateCsv(entity: EntityDef): string {
  const headers = entity.fields.map((f) => f.label);
  const example = entity.fields.map((f) => f.example ?? "");
  const esc = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  // Semicolon-delimited + BOM: what Brazilian Excel opens correctly by default.
  return "\uFEFF" + [headers, example].map((r) => r.map(esc).join(";")).join("\r\n");
}
