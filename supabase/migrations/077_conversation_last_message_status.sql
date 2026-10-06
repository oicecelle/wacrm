-- ============================================================
-- 077_conversation_last_message_status.sql
--
-- A lista de conversas mostrava SEMPRE 2 traços azuis na última
-- mensagem enviada por nós, independente do status real — a conversa
-- só guardava last_message_from_me. Agora guarda também o status da
-- última mensagem, mantido por gatilho: assim cobre de uma vez todos os
-- lugares que gravam mensagem (envio, automações, fluxos, webhook) e o
-- avanço por recibo (enviada → entregue → lida), sem cada um ter que se
-- lembrar de atualizar a conversa.
--
-- O gatilho só age quando a mensagem é a MAIS RECENTE da conversa — um
-- recibo atrasado de uma mensagem antiga não pode sobrescrever o
-- status da última.
--
-- Idempotente.
-- ============================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_message_status TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages(conversation_id, created_at DESC);

CREATE OR REPLACE FUNCTION sync_conversation_last_message_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.created_at >= COALESCE(
       (SELECT max(created_at) FROM messages WHERE conversation_id = NEW.conversation_id),
       NEW.created_at
     ) THEN
    UPDATE conversations
       SET last_message_status = NEW.status
     WHERE id = NEW.conversation_id
       AND last_message_status IS DISTINCT FROM NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_conversation_last_message_status ON messages;
CREATE TRIGGER trg_sync_conversation_last_message_status
  AFTER INSERT OR UPDATE OF status ON messages
  FOR EACH ROW
  EXECUTE FUNCTION sync_conversation_last_message_status();

-- Backfill: status of each conversation's latest message.
UPDATE conversations c
   SET last_message_status = m.status
  FROM (
    SELECT DISTINCT ON (conversation_id) conversation_id, status
      FROM messages
     ORDER BY conversation_id, created_at DESC
  ) m
 WHERE m.conversation_id = c.id
   AND c.last_message_status IS DISTINCT FROM m.status;
