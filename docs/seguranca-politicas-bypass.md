# Alerta de segurança — isolamento por clínica no banco de dados

**Gravidade: crítica (dados de saúde e credenciais de todas as clínicas).**
Encontrado e **corrigido em 28/09/2026**, em duas rodadas de verificação.

## Rodada 1 — políticas "bypass" com cabeçalho fixo

`appointments` e `patients` tinham políticas que liberavam todas as linhas de todas as
clínicas pra qualquer requisição com um cabeçalho HTTP de valor fixo, sem login. Nenhum
código deste repositório usava esse cabeçalho. Removidas as 6 políticas — confirmado
por busca em todo o banco que o mesmo padrão não existia em nenhuma outra tabela.

## Rodada 2 — "qualquer usuário autenticado" em vez de "só da própria clínica"

Uma verificação mais ampla achou um problema maior, em **camadas**, espalhado por
dezenas de tabelas:

**Camada 1 — política "Allow authenticated access".** 45 tabelas usavam essa política
única, cuja regra era só `auth.role() = 'authenticated'` — sem checar a qual clínica a
linha pertencia. Qualquer pessoa logada em **qualquer** clínica (inclusive um cadastro
de teste novo) lia e alterava os dados de **todas** as outras.
- 22 tabelas tinham coluna de clínica e nenhum uso disso: corrigidas com isolamento de
  verdade (`is_account_member(clinic_id)`), igual ao padrão já usado em `sales`,
  `payment_method_configs` etc.
- **Achado mais grave dessa camada:** a tabela `clinics` guarda em texto puro os
  tokens de integração de cada clínica (`uazapi_token`, `whatsapp_token`,
  `google_maps_api_key`). Qualquer clínica conseguia ler o token de conexão do
  WhatsApp de qualquer outra.
- 24 tabelas não tinham coluna de clínica e não são usadas por nenhuma tela deste
  app — nomes e colunas (`admin_perfis.permissoes`, `users.role`,
  `treinamento_usuarios`...) indicam um painel administrativo interno à parte,
  não construído neste repositório. Bloqueadas por enquanto (só o servidor, via
  `service_role`, continua acessando) — falha fechada, sem quebrar nada em uso.

**Camada 2 — políticas com nomes diferentes, mesmo problema.** Corrigir a camada 1
não bastava: no Postgres, políticas da mesma tabela **se somam** (é um "OU", não uma
substituição). Achei mais duas políticas **separadas**, com nomes diferentes,
cobrindo as mesmas tabelas com a mesma falha:
- `clinics` tinha uma política extra, `"Allow public select clinics"`, liberando
  leitura pra **qualquer pessoa — nem precisava estar logada**. Ou seja, mesmo depois
  de corrigir a política da camada 1, os tokens de WhatsApp continuavam expostos por
  essa segunda política, sem eu ter notado de primeira.
- `"Allow public insert"` em `clinics`, `clinic_users` e `users` — desnecessárias:
  confirmei no código (`src/app/api/clinics/create/route.ts`) que a criação de
  clínica usa a chave de serviço, que já ignora essas políticas.
- 6 tabelas com políticas nomeadas como se fossem só pra `service_role`
  (`"Service role full access"`, `service_role_all_*`), mas configuradas pro papel
  errado (`public` em vez de `service_role`) — abertas pra qualquer pessoa. 3 com
  coluna de clínica: corrigidas com isolamento de verdade. 3 sem coluna de clínica e
  sem uso no código (`clinicas_config`, `debounce_buffer`, `fila_mensagens`):
  restringidas de fato ao `service_role`, que é como o código já as usa.

**Camada 3 — mais 20 políticas, nomes `autenticados_*`/`auth_*`, mesmo problema.**
Mesmo padrão da camada 1 (qualquer autenticado, sem isolamento), só que com nomes
diferentes, então a primeira varredura não pegou. 13 tabelas com coluna de clínica
própria: corrigidas direto. 4 tabelas-filhas sem coluna de clínica própria
(`auto_script_partes`, `disparo_leads`, `leads_etiquetas`, `leads_interesses`):
corrigidas checando a clínica da tabela-mãe. `message_buffer` (fila interna por
telefone, sem uso no código): restrita ao `service_role`.

## Deliberadamente não alteradas

Ficaram de fora por parecerem dado global/compartilhado de propósito, não uma falha:
`plans` (planos de assinatura), `knowledge_base_articles`/`_history` (central de
ajuda), `system_incidents`/`system_incident_updates`/`system_status_components`
(página de status), `bio_forms_public_read`/`portal_settings_public_read` (páginas
públicas voltadas ao paciente final, sem exigir login por design), `processed_messages`
(só permite inserir, usado pra controle de duplicidade, sem exposição de leitura).

## Confirmação final

Uma varredura final em todo o schema (`SELECT ... WHERE qual = 'true' OR ...`) não
achou mais nenhuma política sem isolamento fora da lista acima. Migrações aplicadas:
`065_fix_authenticated_access_policies.sql`, `066_lock_down_unused_admin_tables.sql`,
`067_fix_public_role_policies.sql`, `068_fix_authenticated_wildcard_policies.sql`.

## Se o painel administrativo interno for retomado

As 24 tabelas bloqueadas na camada 1 (rodada 2) precisam de uma política de acesso
própria (por exemplo, checando uma tabela de funcionários internos da Pluz Tech) —
não reabrir pra "qualquer autenticado", que foi exatamente a falha corrigida aqui.
