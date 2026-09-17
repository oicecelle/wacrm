-- ============================================================
-- 042_fix_is_account_member_clinic_users.sql
--
-- is_account_member() — usada em praticamente toda política de RLS
-- do sistema (accounts, contacts, deals, broadcasts, whatsapp_config,
-- message_templates, etc.) — só reconhecia profiles.account_id como
-- prova de acesso a uma conta. Isso significa que o mecanismo de
-- "múltiplas clínicas com o mesmo login" via clinic_users nunca
-- concedeu acesso de verdade a nada além da clínica ativa no momento
-- — mesmo com uma linha em clinic_users vinculando o usuário a outra
-- conta, is_account_member() simplesmente não sabia que essa tabela
-- existia.
--
-- Sintoma que expôs isso: o seletor de clínicas só listava a clínica
-- atualmente ativa, porque a política de SELECT de `accounts` (que
-- usa esta função) barrava a leitura das outras contas às quais o
-- usuário tinha acesso via clinic_users.
--
-- Correção: passa a considerar também uma linha ativa em clinic_users
-- (user_id = auth.uid(), clinic_id = target_account_id, is_active).
-- clinic_users.role usa valores de cargo (admin/professional/staff/
-- owner/...), não a mesma escala de account_role_enum — mapeado aqui
-- como 'admin' para quem tem role admin/owner, e 'agent' para os
-- demais, o suficiente para as checagens de min_role já existentes
-- nas políticas atuais.
--
-- Isso só ADICIONA acesso onde antes não havia nenhum — não restringe
-- nada que já funcionava.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_account_member(target_account_id uuid, min_role account_role_enum DEFAULT 'viewer'::account_role_enum)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  )
  OR EXISTS (
    SELECT 1
    FROM clinic_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.clinic_id = target_account_id
      AND cu.is_active = true
      AND CASE WHEN cu.role IN ('owner', 'admin') THEN 3 ELSE 2 END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$function$;
