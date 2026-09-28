-- ============================================================
-- 067_fix_public_role_policies.sql
--
-- Segunda camada achada na mesma varredura de 065/066. No Postgres,
-- políticas da mesma tabela se somam (OR) — corrigir uma política não
-- desativa outra permissiva que continue existindo na mesma tabela.
--
-- Achados:
--
-- 1. clinics tinha "Allow public select clinics" (SELECT, role
--    'public', sempre verdadeiro) — uma política SEPARADA da que
--    corrigi em 065. Ou seja, mesmo depois de corrigir a política de
--    isolamento, os tokens (uazapi_token, whatsapp_token,
--    google_maps_api_key) de todas as clínicas continuavam expostos
--    a qualquer pessoa, nem precisava estar logada. Removida agora.
--
-- 2. "Allow public insert" em clinics, clinic_users e users: nenhuma
--    necessária — confirmado no código (src/app/api/clinics/create)
--    que a criação de clínica usa a service role key, que ignora RLS
--    de qualquer forma. Em users especificamente, essa política
--    também desfazia o bloqueio já aplicado em 066.
--
-- 3. clinica_fluxos_n8n, clinica_manuais_treinamento,
--    clinica_retencao_resgate, etiqueta_status_mapping, lead_objecoes,
--    supervisao_alertas_enviados: políticas nomeadas como se fossem
--    só pra service_role, mas configuradas pra role 'public' — aberto
--    pra qualquer pessoa. Têm clinic_id; corrigidas com isolamento
--    de verdade.
--
-- 4. clinicas_config, debounce_buffer, fila_mensagens: mesmo problema
--    (nome diz "service role", papel real é 'public'), mas sem coluna
--    de clínica utilizável do mesmo jeito — confirmado no código que
--    o app só acessa essas três com a service role key, então a
--    correção é restringir de verdade a service_role, sem quebrar
--    nada.
--
-- Idempotente.
-- ============================================================

-- 1 e 2: clinics, clinic_users, users
DROP POLICY IF EXISTS "Allow public select clinics" ON clinics;
DROP POLICY IF EXISTS "Allow public insert" ON clinics;
DROP POLICY IF EXISTS "Allow public insert" ON clinic_users;
DROP POLICY IF EXISTS "Allow public insert" ON users;

-- 3: clinic_id existe, corrige pra isolamento de verdade
DO $$
DECLARE
  t text;
  old_policy text;
  tables_and_policies text[][] := ARRAY[
    ARRAY['clinica_fluxos_n8n', 'service_role_all_fluxos_n8n'],
    ARRAY['clinica_manuais_treinamento', 'service_role_all_manuais'],
    ARRAY['clinica_retencao_resgate', 'service_role_all_retencao'],
    ARRAY['etiqueta_status_mapping', 'etiqueta_mapping_all'],
    ARRAY['lead_objecoes', 'lead_objecoes_all'],
    ARRAY['supervisao_alertas_enviados', 'supervisao_alertas_all']
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

-- 4: sem coluna de clínica utilizável; só o servidor (service role) usa
DROP POLICY IF EXISTS "Service role full access" ON clinicas_config;
CREATE POLICY "service_role_only_clinicas_config" ON clinicas_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON debounce_buffer;
CREATE POLICY "service_role_only_debounce_buffer" ON debounce_buffer
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON fila_mensagens;
CREATE POLICY "service_role_only_fila_mensagens" ON fila_mensagens
  FOR ALL TO service_role USING (true) WITH CHECK (true);
