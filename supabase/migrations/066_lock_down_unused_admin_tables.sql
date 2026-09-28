-- ============================================================
-- 066_lock_down_unused_admin_tables.sql
--
-- Continuação de 065. Estas 23 tabelas usavam "Allow authenticated
-- access" (qualquer usuário logado, sem filtro nenhum), não têm
-- coluna clinic_id/account_id, e NENHUMA tela deste app as consulta
-- hoje (confirmado por busca no código-fonte). Os nomes e colunas
-- (admin_perfis.permissoes, admin_perfis.clinicas_acesso, users.role,
-- treinamento_usuarios...) indicam um painel administrativo interno
-- à parte — provavelmente da equipe da Pluz Tech, não das clínicas
-- clientes — que não foi construído neste repositório.
--
-- Como nenhuma tela nossa usa essas tabelas, a correção seguindo o
-- mesmo padrão de is_account_member() não se aplica (não é dado de
-- clínica) — construir a regra de acesso certa (ex: "só quem é
-- funcionário interno") exigiria entender um sistema que não está
-- aqui. Até essa decisão ser tomada, a tabela fica bloqueada pra
-- qualquer usuário comum (só o service_role, usado pelo servidor,
-- continua enxergando) — falha fechada, sem quebrar nada que já
-- funciona.
--
-- Se o painel interno for retomado, revise tabela por tabela e crie
-- a política de acesso certa (por exemplo, checando uma tabela de
-- funcionários internos) em vez de reabrir pra qualquer autenticado.
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  t text;
  unused_no_scope_tables text[] := ARRAY[
    'admin_perfis','admin_roles_config','clinicas_onboarding','conversas_analise',
    'fila_atendimento','lead_gen_staging','material_files','onboarding_sessions',
    'painel_agenda','painel_contratos','painel_financeiro','painel_ocorrencias',
    'painel_pessoas','painel_roles','script_links','script_responses',
    'staging_places','treinamento_aulas','treinamento_modulos','treinamento_progresso',
    'treinamento_quizzes','treinamento_usuarios','users','usuarios_painel'
  ];
BEGIN
  FOREACH t IN ARRAY unused_no_scope_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Allow authenticated access', t);
  END LOOP;
END $$;
