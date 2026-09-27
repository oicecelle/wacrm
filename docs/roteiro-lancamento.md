# Roteiro de Lançamento — LeadPluz

Organizado a partir da sua lista de tarefas, com prioridade, complexidade, dependências,
e itens que faltavam. Decisão já incorporada: **Uazapi como único provedor de WhatsApp**
(API oficial da Meta descontinuada do plano) — hoje nenhum cliente ativo está na API
oficial, então não há migração urgente, só um ajuste de rota.

**Como ler:** cada fase só deveria começar quando a anterior estiver "boa o suficiente",
não perfeita. "Lançar" aqui significa começar a aceitar os primeiros clientes reais
(pode ser um grupo pequeno, acompanhado de perto por você) — não o lançamento público
em escala com tráfego pago.

---

## 🚨 Achado urgente (já resolvido pela sua resposta)

A cobrança da Meta de 1º de outubro/2026 (mensagem de serviço dentro da janela de 24h
passa a ser cobrada, com 1.000 grátis/mês) **não te afeta**, porque só vale pra quem usa
a API Oficial (Cloud API), e você confirmou que ninguém está nela hoje. Ação necessária:
só descontinuar formalmente a opção de conectar via API oficial em qualquer lugar do
sistema/marketing que ainda a mencione. Baixa urgência, mas fácil de esquecer.

## ⚠️ Risco que a decisão de ir só-Uazapi introduz (novo, não estava na sua lista)

Uazapi é um provedor **não oficial** — o número corre risco real de banimento por
comportamento automatizado em alto volume, exatamente o perfil de uso que a LIA propõe
(mensagem constante, follow-up, disparo, resgate). Isso precisa virar um item de
trabalho formal, não só uma preocupação: mecanismos de "aquecimento" de número novo,
limites de envio por hora/dia, monitoramento de qualidade do número, e um plano do que
fazer se um cliente for banido (é o item 10 da sua lista, mas merece esse detalhe extra
dentro dele).

---

## O que está faltando na sua lista (adicionado)

| Item | Por quê importa |
|---|---|
| **Monitoramento de erro/uptime (Sentry ou similar)** | Sem isso, você só descobre que algo quebrou quando o cliente reclama — tarde demais numa clínica que depende do sistema pra atender paciente |
| **Mitigação de banimento Uazapi** (detalhado acima) | Ver caixa acima — crítico dado a decisão de ir só-Uazapi |
| **E-mail transacional** (recibo, redefinir senha, aviso de cobrança) | Sistema de pagamento sem isso fica manco — cliente esquece senha e não tem como recuperar |
| **Aviso de transparência de IA** | Cliente/paciente que fala com a LIA deveria saber que é uma IA — é boa prática e pode ser exigência legal dependendo de como a regulamentação brasileira de IA evoluir |
| **Grupo beta formal antes do público geral** | Você já está meio fazendo isso (com a Marcelle), mas vale formalizar: 5-10 clínicas, acompanhadas de perto, antes de abrir pra qualquer um |
| **Backup e recuperação de desastre** | Se o banco de dados corromper ou for apagado por engano, qual é o plano? |
| **Contrato formal com agências parceiras** (diferente do afiliado individual) | Parceria com agência é relação comercial maior — vale ter um contrato de verdade, não só um link de afiliado |

---

## Fase 0 — Essa semana (organizacional, não bloqueia nada)
1. Descontinuar formalmente a opção de API oficial da Meta em qualquer configuração/copy existente

## Fase 1 — Fundação técnica (sem isso, nada mais importa)
**Por que primeiro:** é a base sobre a qual todo o resto é construído. Bug aqui se propaga pra tudo.

| Tarefa | Complexidade | Observação |
|---|---|---|
| QA completo do webapp (telas, botões, modais, backend/frontend) | Alta, mas mecânica | Faça uma varredura sistemática, tela por tela — eu ajudo diretamente nisso |
| Revisão da conexão WhatsApp/Uazapi | Média-Alta | Prioridade alta dado a decisão só-Uazapi; incluir os mecanismos de proteção contra banimento aqui |
| Finalizar Google Agenda + autenticação Google | Média | Já parcialmente construído (vi no código) — provavelmente é ajuste, não recomeço |
| Mínimo legal: política de privacidade + termos de uso | Média (jurídico, não técnico) | Precisa de advogado real pra revisar, principalmente por lidar com dado de saúde (LGPD) |
| Pagamento (Asaas) + trial + cancelamento + notas fiscais | Alta | Bloqueia o lançamento de verdade — sem isso não tem como cobrar ninguém |
| Monitoramento de erro (Sentry) | Baixa-Média | Rápido de implementar, alto retorno |
| E-mail transacional | Baixa-Média | Junto com o pagamento, já que ambos precisam de e-mail (recibo, cobrança) |

## Fase 2 — A LIA funcional (o coração do produto)
**Por que depois da Fase 1:** não adianta a LIA ser incrível se o sistema por baixo tem bug ou não tem como cobrar.

| Tarefa | Complexidade | Observação |
|---|---|---|
| Arquitetura completa da LIA (WhatsApp + webapp) + testar casos mapeados | Alta | Já temos boa parte construída nesta sessão — falta testar em situações reais |
| LIA proativa + regras do que ela nunca faz sozinha | Alta | É o maior diferencial que a pesquisa de mercado achou — vale investir tempo de verdade aqui |
| Modelos/fluxos/mensagens padrão de toda situação | Média-Alta | Trabalho de conteúdo mais que técnico — dá pra fazer em paralelo com o resto |
| Protocolos de estética prontos | Média | Também é conteúdo (regras de retorno por procedimento) — pode começar com os 5-6 procedimentos mais comuns, expandir depois |

## Fase 3 — Onboarding e suporte pros primeiros clientes reais
**Por que agora:** já dá pra receber gente de verdade, mas ainda num grupo pequeno e acompanhado.

| Tarefa | Complexidade | Observação |
|---|---|---|
| Onboarding + migração de outros sistemas | Alta | Pra esse grupo beta inicial, pode ser manual/assistido por você — formalizar o fluxo depois de ver o que realmente trava |
| Estrutura de suporte | Média | Começa simples (canal de contato direto, FAQ básico) — cresce conforme aparece demanda real |
| Grupo beta formal (5-10 clínicas) | — | Esse é o próprio "lançamento" desta fase |

## Fase 4 — Ir ao mercado, canal 1 (parcerias)
**Por que esse canal primeiro:** é o que você já decidiu ser prioridade, e o público já vem filtrado (agência já atende quem sofre com essa dor).

| Tarefa | Complexidade | Observação |
|---|---|---|
| Landing page (com vídeo de vendas, seções persuasivas, benchmark com zapia.com e outros) | Média-Alta | Precisa existir antes de qualquer canal de aquisição rodar |
| Processo de vendas pós-decisão (resgate, remarketing, iscas digitais) | Média | Desenha o "o que acontece depois que a pessoa decide comprar" |
| Canal de parceiros/agências: prospecção, copy, materiais, processo de parceria | Alta | Provavelmente o trabalho de maior retorno no curto prazo, dado seu plano de canais |

## Fase 5 — Expandir aquisição
| Tarefa | Complexidade | Observação |
|---|---|---|
| Conteúdo orgânico 90 dias (Instagram/TikTok/YouTube Shorts) + persona visual da LIA | Muito alta | O maior trabalho de execução de toda a lista — merece sua própria sessão de planejamento detalhado |
| Prospecção ativa direta (WhatsApp, teste grátis) | Média | Pode rodar em paralelo com o conteúdo |
| Afiliação (indique e ganhe) — tela de acompanhamento | Média | Só faz sentido quando já existe alguma base de clientes satisfeitos pra indicar |

## Fase 6 — Escalar
| Tarefa | Complexidade | Observação |
|---|---|---|
| Tráfego pago (criativos, funil, lookalike) | Alta | Só depois de validar os canais anteriores — sua própria ordem de canais já coloca isso por último, e concordo |
| Admin/backoffice completo (métricas de assinantes, afiliados, performance) | Alta | Cresce com a necessidade real — não precisa nascer completo |
| Rebrand visual completo (marrom/preto na marca, cuidado com glassmorphism nas telas de trabalho) | Média | Não bloqueia nada — pode rodar em paralelo com qualquer fase anterior, no seu ritmo |

---

## Próximo passo imediato

Dado tudo isso, eu sugeriria começar por **QA completo do webapp** (Fase 1) —
é mecânico, eu posso conduzir com você tela por tela, e destrava a confiança de que
o que já existe está sólido antes de construir mais em cima. Quer começar por aí, ou
prefere primeiro fechar o desenho da LIA proativa (Fase 2), já que é o maior
diferencial e você pode querer pensar nisso com mais calma antes?
