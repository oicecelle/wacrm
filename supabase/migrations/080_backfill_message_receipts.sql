-- ============================================================
-- 080_backfill_message_receipts.sql
--
-- Correção de DADOS (única, idempotente): o tratador de recibos
-- descartava os recibos enviados pelo CONTATO (IsFromMe = false), que
-- são 63% de todos os recibos reais e justamente os que viram os
-- traços ✓✓. Eles ficaram gravados em whatsapp_webhook_logs; aqui são
-- reaplicados às mensagens.
--
-- Regras: só avança o status (sending/sent → delivered → read), nunca
-- recua nem toca em 'failed' ou em mensagem do cliente; casa o id puro
-- e o 'número:id'; restrito à conta dona do número (owner do payload ↔
-- whatsapp_config.phone_number_id). Rodar de novo não muda nada.
-- ============================================================

WITH r AS (
  SELECT payload->>'owner' AS owner,
         CASE WHEN lower(payload->>'state') LIKE '%read%' OR lower(payload->>'state') LIKE '%played%' THEN 'read'
              WHEN lower(payload->>'state') LIKE '%deliver%' THEN 'delivered' END AS st,
         regexp_replace(mid, '^.*:', '') AS bare_id
  FROM whatsapp_webhook_logs, LATERAL jsonb_array_elements_text(payload->'event'->'MessageIDs') AS mid
  WHERE payload->>'EventType' = 'messages_update'
    AND payload->'event'->>'IsFromMe' = 'false'
    AND coalesce(payload->'event'->>'IsGroup', 'false') = 'false'
), best AS (
  SELECT owner, bare_id, CASE WHEN bool_or(st = 'read') THEN 'read' ELSE 'delivered' END AS st
  FROM r WHERE st IS NOT NULL GROUP BY 1, 2
), tgt AS (
  SELECT m.id, b.st
  FROM best b
  JOIN whatsapp_config wc ON wc.phone_number_id = b.owner
  JOIN conversations c ON c.account_id = wc.account_id
  JOIN messages m ON m.conversation_id = c.id AND (m.message_id = b.bare_id OR m.message_id LIKE '%:' || b.bare_id)
  WHERE m.sender_type <> 'customer' AND m.status <> 'failed'
    AND ((b.st = 'read' AND m.status IN ('sending', 'sent', 'delivered'))
      OR (b.st = 'delivered' AND m.status IN ('sending', 'sent')))
)
UPDATE messages m SET status = tgt.st FROM tgt WHERE m.id = tgt.id;
