-- ============================================================
-- 082_history_contact_cap.sql
--
-- Teto de contatos criados pela importação do primeiro pareamento.
-- Sem ele, um WhatsApp com milhares de conversas despejaria todas no CRM
-- de uma vez (e cada contato novo são ~4 gravações: contato, paciente,
-- nome do WhatsApp, conversa).
--
-- Vários lotes de histórico chegam AO MESMO TEMPO, então conferir o
-- contador e depois criar deixaria todos passarem do limite juntos. A
-- reserva é atômica: a linha da conexão é travada (FOR UPDATE), o
-- contador sobe pelo que foi CONCEDIDO e só essa quantidade pode ser
-- criada.
--
-- Idempotente.
-- ============================================================

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS history_import_contacts_created INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.reserve_history_contact_slots(
  p_config_id uuid,
  p_requested integer,
  p_max integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current integer;
  v_granted integer;
BEGIN
  IF p_requested IS NULL OR p_requested <= 0 OR p_max IS NULL OR p_max <= 0 THEN
    RETURN 0;
  END IF;

  SELECT coalesce(history_import_contacts_created, 0)
    INTO v_current
    FROM public.whatsapp_config
   WHERE id = p_config_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_granted := GREATEST(0, LEAST(p_requested, p_max - v_current));
  IF v_granted > 0 THEN
    UPDATE public.whatsapp_config
       SET history_import_contacts_created = v_current + v_granted
     WHERE id = p_config_id;
  END IF;
  RETURN v_granted;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_history_contact_slots(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
