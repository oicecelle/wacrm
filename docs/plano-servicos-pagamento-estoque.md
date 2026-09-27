# Plano — Serviços completos, Pagamento, Estoque, Fechamento de Venda, Modal Unificado

## Resumo executivo

Achei mais coisa pronta do que eu esperava. **Comissão e estoque já têm banco de
dados construído** — só faltam interface e a conexão entre eles. **Formas de
pagamento/taxas e "fechar compra" não existem ainda, nem no banco.** O modal de
contato e o de agendamento são hoje dois componentes completamente separados, com
layouts diferentes.

---

## Item 2 — Cadastro de Serviços/Procedimentos

| Campo pedido | Situação |
|---|---|
| Profissionais que realizam | ✅ Já existe (`professionals`/`profissionais`) |
| Valor | ✅ Já existe (`valor`/`price`) |
| Tempo de duração | ✅ Já existe (`duration_minutes`/`tempo_reserva_minutos`) |
| Cor | ✅ Já existe (`color`) |
| Comissão por profissional (+ tipo) | ✅ **Já existe, com interface pronta** (`procedure_commissions`, editável na tela de Serviços) |
| Unidade/sala | 🟡 Salas existem como cadastro próprio (nome/número), mas **não vinculadas a um procedimento específico** — falta o campo de atribuição |
| Custos + produtos utilizados | ❌ Não existe — falta uma tabela ligando procedimento a produto(s) de estoque, com quantidade consumida |

**Pra fechar o item 2:** falta (a) adicionar seleção de sala no formulário de
procedimento, e (b) criar o vínculo procedimento → produtos consumidos (quantidade
de cada insumo usado nesse procedimento) — que é também pré-requisito do item 5.

## Item 3 — Formas de pagamento, parcelamento e taxas

**Não existe nada hoje** — nem tabela, nem tela. Precisa:
- Uma tela de configuração (em Configurações → Financeiro) listando formas de
  pagamento (Pix, Dinheiro, Débito, Crédito à vista, Crédito parcelado 2x/3x/.../12x),
  cada uma com sua taxa percentual
- Guardar isso de um jeito que o relatório financeiro consiga, pra cada
  transação, saber quanto foi taxa e descontar da receita líquida

## Item 4 — "Fechar compra"

**Não existe hoje.** Isso é o elo que falta entre Agenda, Financeiro, Serviços e
Estoque — quando o atendimento termina, alguém escolhe a forma de pagamento,
pode adicionar produtos/serviços extras que não estavam no agendamento original,
e o sistema calcula o valor final. É a peça mais estrutural de todo esse pedido,
porque as próximas (comissão de verdade paga, estoque abatido, taxa descontada)
dependem desse momento existir.

## Item 5 — Estoque

| Parte | Situação |
|---|---|
| Cadastro de produto (nome, SKU, categoria, marca, unidade, quantidade mínima, custo, preço) | ✅ Banco pronto (`stock_products`) — zero interface |
| Lotes com validade | ✅ Banco pronto (`stock_batches`) — zero interface |
| Movimentação de estoque, já com campo pra vincular a um agendamento | ✅ Banco pronto (`stock_movements`, tem `appointment_id`) — zero interface, zero automação |
| Abater automaticamente ao "fechar a compra" | ❌ Depende do item 4 existir primeiro, e do vínculo procedimento→produto do item 2 |
| Histórico completo de gastos | 🟡 A base (`stock_movements`) permite construir isso, mas a tela de histórico não existe |

**Achado interessante:** alguém já desenhou esse banco pensando exatamente no que
você está pedindo agora (o campo `appointment_id` em `stock_movements` só faz
sentido nesse cenário) — só nunca foi construída a tela nem a automação por cima.

## Item 6 — Modal unificado (Contato + Agendamento)

Confirmado: são **dois componentes totalmente separados** hoje —
`contact-detail-view.tsx` (tela de Contatos) e `appointment-modal.tsx` (Agenda) —
com estrutura e visual diferentes um do outro. Unificar significa: um único
componente, com as mesmas abas nos dois casos, mudando só a aba que abre
primeiro (Linha do Tempo + Dados do Contato quando vem de Contatos; Detalhes do
Agendamento quando vem da Agenda). É um trabalho de refatoração cuidadoso —
mexe em duas telas usadas o dia inteiro, então precisa ser bem testado.

## Item 7 — Foto do WhatsApp

Já respondido acima: a capacidade técnica existe (Uazapi já tem a função pronta),
só não está ligada em lugar nenhum da interface ainda.

---

## Ordem recomendada de construção

A ordem importa porque tudo depende de tudo:

```
1. Vínculo procedimento → produtos de estoque (item 2, parte que falta)
   + adicionar seleção de sala no formulário de procedimento
        ↓
2. Formas de pagamento e taxas (item 3) — independente, pode vir em paralelo
        ↓
3. Tela de Estoque (item 5) — cadastro de produto, lote, e histórico
   (o banco já existe, é "só" construir a interface)
        ↓
4. "Fechar Compra" (item 4) — o grande elo:
   escolhe forma de pagamento (usa item 3) → ajusta itens →
   calcula total → abate estoque (usa item 1 e 3) → registra
   comissão de verdade paga (usa o que já existe)
        ↓
5. Relatório financeiro atualizado — receita líquida (bruta - taxa - custo
   de produto), agora que os dados de taxa e custo existem
```

O **modal unificado (item 6)** e a **foto do WhatsApp (item 7)** são independentes
dessa cadeia — dá pra fazer em qualquer momento, inclusive em paralelo.

## Minha recomendação de por onde começar

Dado que você já pediu o resumo de faturamento (que expõe visualmente o quanto
esse fluxo de dinheiro importa agora), eu sugeriria: **item 3 (formas de
pagamento/taxas) primeiro** — é o mais isolado, rápido de fazer, e destrava o
relatório financeiro ficar mais preciso rapidinho. Depois **item 2 (vínculo
produto+sala)**, que destrava tudo o resto. Aí sim **estoque, fechar compra, e
relatório atualizado**, nessa ordem. **Modal unificado e foto do WhatsApp**
ficam pra quando quiser encaixar, sem pressa de sequência.
