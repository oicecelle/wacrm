# Lista de Tarefas - Fase 1 (Concluída)

- `[x]` **Redesenhar o Dashboard Executivo** (`wacrm/src/app/(dashboard)/dashboard/page.tsx`)
  - `[x]` Implementar bloco de Saúde da Clínica (novos leads, atendimentos, faturamento previsto/realizado e comparações)
  - `[x]` Implementar bloco de Perdas e Eficiência (leads sem resposta, cancelamentos/faltas, receita perdida)
  - `[x]` Criar lista acionável "O que preciso fazer hoje" (leads quentes sem contato recente, ordenados pelo score)
  - `[x]` Criar painel de AI Insights (estilo Notion com recomendações táticas)
- `[x]` **Refinar o Card de Métricas** (`wacrm/src/components/dashboard/metric-card.tsx`)
  - `[x]` Aplicar estética premium (bordas rounded-2xl, cores HSL suaves e micro-interações)
  - `[x]` Adicionar variações de colunas/cores para alertas/sucesso nos ícones
- `[x]` **Adicionar Filtros no Kanban do CRM** (`wacrm/src/app/(dashboard)/pipelines/page.tsx`)
  - `[x]` Desenhar a barra de filtros (busca textual por nome/telefone/CPF + dropdowns de temperatura, origem, interesse e responsável)
  - `[x]` Implementar a lógica de filtragem em tempo real sobre a lista de negócios (`deals`) no cliente
- `[x]` **Enriquecer o Visual dos Cards do CRM** (`wacrm/src/components/pipelines/deal-card.tsx`)
  - `[x]` Renderizar temperatura com ícones e cores HSL fortes (fogo, termômetro, cristal)
  - `[x]` Exibir a barra/badge de engajamento do Lead Score (0 a 100)
  - `[x]` Adicionar indicador visual de origem e tempo sem resposta
  - `[x]` Exibir mini tags inteligentes (vip, novo, sem resposta) e prévia discreta da próxima ação/objeções

---

# Lista de Tarefas - Fase 2 (Concluída)

- `[x]` **Implementar Linha do Tempo Inteligente (Smart Timeline)** (`wacrm/src/components/contacts/contact-detail-view.tsx`)
  - `[x]` Criar consulta para buscar eventos em tempo real da tabela `contact_timeline`
  - `[x]` Desenhar interface da timeline vertical estilizada com Tailwind
  - `[x]` Associar ícones e cores HSL específicas para cada tipo de evento (mensagens, agendamentos, pagamentos, assinaturas)
- `[x]` **IA no Prontuário & LIA Insights** (`wacrm/src/components/contacts/contact-detail-view.tsx`)
  - `[x]` Criar botão "Analisar Conversa" que recupera o histórico do WhatsApp e executa `generateAISummary`
  - `[x]` Adicionar botão "Salvar nas Anotações" para persistir o resumo gerado pela IA como nota de contato
- `[x]` **Atalhos e Ações Rápidas no Cabeçalho** (`wacrm/src/components/contacts/contact-detail-view.tsx`)
  - `[x]` Implementar atalho de redirecionamento para o WhatsApp
  - `[x]` Criar atalho para criação rápida de agendamento disparando o evento `create-appointment`

---

# Lista de Tarefas - Fase 3 (Concluída)

- `[x]` **Histórico Financeiro do Paciente** (`wacrm/src/components/contacts/contact-detail-view.tsx`)
  - `[x]` Criar consulta para buscar transações da tabela `financial_transactions`
  - `[x]` Exibir cartões de resumo (Total Pago, Total Pendente, Atrasado)
  - `[x]` Criar formulário de registro de nova receita/despesa com categorias e métodos
- `[x]` **Evolução Corporal & Fotos Comparativas** (`wacrm/src/components/contacts/evolucao-tab.tsx`)
  - `[x]` Refatorar a aba de Evolução Corporal para ter sub-abas (Medidas e Fotos)
  - `[x]` Implementar upload de fotos de evolução (direto de arquivo ou câmera de smartphone)
  - `[x]` Desenhar galeria de fotos de progresso e visualizador comparativo "Antes e Depois" lado a lado
- `[x]` **Atalho de Agendamento Global** (`wacrm/src/app/(dashboard)/agenda/page.tsx`)
  - `[x]` Escutar o evento `create-appointment` no componente da agenda
  - `[x]` Popular os dados do paciente e abrir o modal de agendamento pré-preenchido

---

# Lista de Tarefas - Fase 4 (Concluída)

- `[x]` **Dashboard de Desempenho de Campanhas** (`wacrm/src/app/(dashboard)/broadcasts/page.tsx`)
  - `[x]` Calcular indicadores agregados de envios históricos (mensagens enviadas, taxas médias de entrega, leitura e resposta)
  - `[x]` Renderizar painel executivo com cards e mini barras de progresso no topo da listagem de campanhas
- `[x]` **Segmentação Avançada de Público** (`wacrm/src/components/broadcasts/step2-select-audience.tsx` & `wacrm/src/hooks/use-broadcast-sending.ts`)
  - `[x]` Adicionar a opção de segmentação por múltiplos filtros combinados no wizard do disparo
  - `[x]` Implementar filtros por tipo de contato, gênero, temperatura, interesse, origem e score
  - `[x]` Conectar a contagem dinâmica de estimativa de contatos com Supabase no frontend
  - `[x]` Implementar a resolução avançada de destinatários filtrados na server action de envio de broadcast
- `[x]` **Editor de Templates Unificado** (`wacrm/src/app/(dashboard)/comunicacao/modelos/page.tsx`)
  - `[x]` Adicionar sistema de abas na tela de modelos de comunicação
  - `[x]` Centralizar os modelos automáticos (gatilhos do sistema) e os modelos de disparos diretos (Meta TemplateManager)

---

# Lista de Tarefas - Fase 5 (Concluída)

- `[x]` **Módulo Financeiro Expandido** (`wacrm/src/app/(dashboard)/financeiro/page.tsx`)
  - `[x]` Adicionar barra de filtros dinâmica (busca, período, método, situação)
  - `[x]` Vincular KPIs e DRE para atualizarem dinamicamente de acordo com os filtros
  - `[x]` Implementar apuração de comissões reais via `clinic_users` e `procedure_professionals`
  - `[x]` Integrar a ação "Consumir Sessão" de pacotes com o registro de log na `patient_timeline`

---

# Lista de Tarefas - Fase 6 (Concluída)

- `[x]` **Central de Documentos & Assinatura Digital** (`wacrm/src/app/(dashboard)/documentos/page.tsx`)
  - `[x]` Criar aba "Biblioteca de Modelos" para gerenciar templates de termos/contratos
  - `[x]` Implementar formulário/drawer para criar e editar templates com Nome, Tipo, Conteúdo e Padrão
  - `[x]` Integrar requisições Supabase (Select, Insert, Update, Delete) no CRUD de templates
  - `[x]` Filtrar e mesclar modelos globais (`clinic_id IS NULL`) com modelos customizados (`clinic_id = accountId`)
