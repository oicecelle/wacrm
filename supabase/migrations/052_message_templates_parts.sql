-- ============================================================
-- 052_message_templates_parts.sql
--
-- Modelos só suportavam um único corpo de texto (body_text). Nova
-- coluna parts guarda uma sequência ordenada de partes — texto,
-- imagem, vídeo, documento ou áudio — cada uma enviada como uma
-- mensagem separada, em ordem, quando o modelo é usado (disparo,
-- automação, ou envio manual). body_text continua existindo pros
-- modelos antigos, que têm uma parte de texto só.
--
-- Idempotente.
-- ============================================================

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS parts JSONB NOT NULL DEFAULT '[]'::jsonb;
