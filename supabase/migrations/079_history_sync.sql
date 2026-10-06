-- ============================================================
-- 079_history_sync.sql
--
-- Histórico de mensagens vindo da Uazapi (botão "carregar mensagens
-- anteriores" e sincronização do primeiro pareamento).
--
-- 1. update_last_message_from_me() gravava last_message_from_me com o
--    remetente de QUALQUER mensagem inserida, sem checar se era a mais
--    recente. Inserir uma mensagem ANTIGA (histórico) inverteria o campo
--    de conversas existentes. Agora só age quando a mensagem inserida é
--    a mais recente da conversa — a mesma regra do gatilho de status
--    (077).
-- 2. whatsapp_config.history_import_state: o histórico do PRIMEIRO
--    pareamento é o único caso em que se cria contato/conversa a partir
--    de chats desconhecidos. NULL = nunca (todas as conexões que já
--    existem hoje); 'pending' = salva e aguardando a leitura do QR;
--    'importing' = lotes chegando; 'done' = encerrado.
-- 3. history_sync_requests: um registro por clique em "carregar
--    anteriores", pra tela dizer o que aconteceu (chegaram N mensagens /
--    início da conversa / o celular não respondeu).
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_last_message_from_me()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.created_at >= COALESCE(
       (SELECT max(created_at) FROM public.messages WHERE conversation_id = NEW.conversation_id),
       NEW.created_at
     ) THEN
    UPDATE public.conversations
       SET last_message_from_me = (NEW.sender_type IN ('agent', 'bot'))
     WHERE id = NEW.conversation_id
       AND last_message_from_me IS DISTINCT FROM (NEW.sender_type IN ('agent', 'bot'));
  END IF;
  RETURN NEW;
END;
$function$;

ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS history_import_state TEXT;
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS history_import_started_at TIMESTAMPTZ;
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_history_import_state_check;
ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_history_import_state_check
  CHECK (history_import_state IS NULL OR history_import_state IN ('pending', 'importing', 'done'));

CREATE TABLE IF NOT EXISTS history_sync_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  chat_jid TEXT NOT NULL,
  anchor_message_id TEXT,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'completed', 'timeout', 'failed')),
  received_messages INTEGER,
  has_more BOOLEAN,
  history_access TEXT,
  error TEXT,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_history_sync_requests_chat
  ON history_sync_requests(account_id, chat_jid, requested_at DESC);

ALTER TABLE history_sync_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "clinic_isolation_history_sync_requests" ON history_sync_requests;
CREATE POLICY "clinic_isolation_history_sync_requests" ON history_sync_requests
  FOR ALL USING (is_account_member(account_id)) WITH CHECK (is_account_member(account_id));
