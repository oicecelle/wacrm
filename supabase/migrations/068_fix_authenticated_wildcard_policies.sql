-- ============================================================
-- 068_fix_authenticated_wildcard_policies.sql
--
-- Terceira camada da mesma varredura (065/066/067): políticas com
-- nomes diferentes ("autenticados_X", "auth_X") mas o mesmo problema
-- — `USING (true)` pra qualquer usuário autenticado, sem checar
-- clínica nenhuma.
--
-- Tabelas com clinic_id próprio: isolamento direto.
-- Tabelas-filhas sem clinic_id (auto_script_partes, disparo_leads,
-- leads_etiquetas, leads_interesses): isolamento via EXISTS na
-- tabela-mãe, que já tem clinic_id.
-- message_buffer: fila interna de mensagens por telefone, sem
-- nenhuma coluna de clínica e sem uso no código do app — restrita a
-- service_role, mesmo padrão de debounce_buffer/fila_mensagens (067).
--
-- Deliberadamente NÃO alteradas (parecem dado global/compartilhado
-- de propósito, não um bug): plans, knowledge_base_articles(_history),
-- system_incidents/incident_updates/status_components,
-- bio_forms_public_read, portal_settings_public_read,
-- processed_messages (INSERT só, controle de duplicidade).
--
-- Idempotente.
-- ============================================================

DO $$
DECLARE
  t text;
  old_policy text;
  tables_and_policies text[][] := ARRAY[
    ARRAY['auto_scripts', 'auth_auto_scripts'],
    ARRAY['automacao_logs', 'auth_automacao_logs'],
    ARRAY['crm_estagios', 'autenticados_crm_estagios'],
    ARRAY['crm_etiquetas', 'autenticados_crm_etiquetas'],
    ARRAY['crm_interesses', 'autenticados_crm_interesses'],
    ARRAY['crm_status', 'autenticados_crm_status'],
    ARRAY['disparos', 'autenticados_disparos'],
    ARRAY['fila_mensagens', 'autenticados_fila_mensagens'],
    ARRAY['ia_prompts', 'autenticados_ia_prompts'],
    ARRAY['interacoes', 'autenticados_interacoes'],
    ARRAY['leads', 'autenticados_leads'],
    ARRAY['lp_message_templates', 'autenticados_message_templates'],
    ARRAY['relatorios_crm', 'autenticados_relatorios']
  ];
  pair text[];
BEGIN
  FOREACH pair SLICE 1 IN ARRAY tables_and_policies LOOP
    t := pair[1];
    old_policy := pair[2];
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', old_policy, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (is_account_member(clinic_id)) WITH CHECK (is_account_member(clinic_id))',
      'clinic_isolation_' || t, t
    );
  END LOOP;
END $$;

-- horario_comercial and ia_prompts each had TWO redundant policies
-- with this same flaw (auth_X and autenticados_X) — drop the second name too.
DROP POLICY IF EXISTS "autenticados_horario" ON horario_comercial;
DROP POLICY IF EXISTS "auth_horario" ON horario_comercial;
CREATE POLICY "clinic_isolation_horario_comercial" ON horario_comercial
  FOR ALL USING (is_account_member(clinic_id)) WITH CHECK (is_account_member(clinic_id));

DROP POLICY IF EXISTS "auth_ia_prompts" ON ia_prompts;
-- (autenticados_ia_prompts already dropped by the loop above)

-- Child tables with no clinic_id of their own: scoped through the
-- parent row, which does have one.
DROP POLICY IF EXISTS "auth_auto_script_partes" ON auto_script_partes;
CREATE POLICY "clinic_isolation_auto_script_partes" ON auto_script_partes
  FOR ALL
  USING (EXISTS (SELECT 1 FROM auto_scripts s WHERE s.id = auto_script_partes.script_id AND is_account_member(s.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM auto_scripts s WHERE s.id = auto_script_partes.script_id AND is_account_member(s.clinic_id)));

DROP POLICY IF EXISTS "autenticados_disparo_leads" ON disparo_leads;
CREATE POLICY "clinic_isolation_disparo_leads" ON disparo_leads
  FOR ALL
  USING (EXISTS (SELECT 1 FROM disparos d WHERE d.id = disparo_leads.disparo_id AND is_account_member(d.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM disparos d WHERE d.id = disparo_leads.disparo_id AND is_account_member(d.clinic_id)));

DROP POLICY IF EXISTS "autenticados_leads_etiquetas" ON leads_etiquetas;
CREATE POLICY "clinic_isolation_leads_etiquetas" ON leads_etiquetas
  FOR ALL
  USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_etiquetas.lead_id AND is_account_member(l.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_etiquetas.lead_id AND is_account_member(l.clinic_id)));

DROP POLICY IF EXISTS "autenticados_leads_interesses" ON leads_interesses;
CREATE POLICY "clinic_isolation_leads_interesses" ON leads_interesses
  FOR ALL
  USING (EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interesses.lead_id AND is_account_member(l.clinic_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM leads l WHERE l.id = leads_interesses.lead_id AND is_account_member(l.clinic_id)));

-- message_buffer: no clinic reference at all, unused by the app — same
-- treatment as debounce_buffer/fila_mensagens in 067.
DROP POLICY IF EXISTS "autenticados_buffer" ON message_buffer;
CREATE POLICY "service_role_only_message_buffer" ON message_buffer
  FOR ALL TO service_role USING (true) WITH CHECK (true);
