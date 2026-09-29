-- ============================================================
-- 069_professional_scoped_access.sql
--
-- Item 4 do pedido de permissões: um clinic_users com cargo
-- 'professional' (definido na tela de Equipe) só deve ver os
-- próprios agendamentos e as próprias comissões — não os de toda a
-- clínica. Donos, admins e qualquer outro cargo (recepção,
-- marketing...) continuam vendo tudo, exatamente como hoje.
--
-- Confirmado antes de aplicar: nenhuma conta real tem
-- clinic_users.role = 'professional' hoje (os valores existentes são
-- admin/owner/staff/super_admin, de antes desse cargo granular
-- existir) — essa restrição não muda nada pra ninguém agora, só
-- passa a valer quando alguém for atribuído como profissional dali
-- pra frente.
--
-- is_full_access_staff() e my_clinic_user_id() são SECURITY DEFINER
-- (leem clinic_users por dentro, ignorando RLS), mesmo padrão de
-- is_account_member() — não causa loop nem trava o próprio
-- clinic_users.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION my_clinic_user_id(p_clinic_id uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT id FROM clinic_users WHERE user_id = auth.uid() AND clinic_id = p_clinic_id LIMIT 1;
$$;

-- true = enxerga a clínica inteira (dono/admin de sistema, ou
-- qualquer cargo que não seja 'professional'). false = só o que é
-- seu. Sem vínculo em clinic_users (ex: request de outro contexto),
-- fica do lado restrito por padrão — nunca do lado permissivo.
CREATE OR REPLACE FUNCTION is_full_access_staff(p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clinic_users cu
    WHERE cu.user_id = auth.uid() AND cu.clinic_id = p_clinic_id AND cu.role <> 'professional'
  )
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid() AND p.account_id = p_clinic_id AND p.account_role IN ('owner', 'admin')
  );
$$;

DROP POLICY IF EXISTS "clinic_isolation_appointments" ON appointments;
CREATE POLICY "clinic_isolation_appointments" ON appointments
  FOR ALL
  USING (
    is_account_member(clinic_id)
    AND (is_full_access_staff(clinic_id) OR professional_id = my_clinic_user_id(clinic_id))
  )
  WITH CHECK (
    is_account_member(clinic_id)
    AND (is_full_access_staff(clinic_id) OR professional_id = my_clinic_user_id(clinic_id))
  );

DROP POLICY IF EXISTS "commission_records_account_access" ON commission_records;
CREATE POLICY "commission_records_account_access" ON commission_records
  FOR ALL
  USING (
    is_account_member(clinic_id)
    AND (is_full_access_staff(clinic_id) OR professional_id = my_clinic_user_id(clinic_id))
  )
  WITH CHECK (
    is_account_member(clinic_id)
    AND (is_full_access_staff(clinic_id) OR professional_id = my_clinic_user_id(clinic_id))
  );
