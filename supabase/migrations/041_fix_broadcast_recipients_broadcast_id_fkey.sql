-- ============================================================
-- 041_fix_broadcast_recipients_broadcast_id_fkey.sql
--
-- broadcast_recipients.broadcast_id referenciava `lp_broadcasts` —
-- uma tabela órfã, sem nenhuma referência em nenhum código do app
-- nem em nenhuma migração. A tabela realmente usada em todo o fluxo
-- de disparos (Fases 1-5, e todo o resto do app: listagem, histórico,
-- detalhe) é `broadcasts`. Resultado: qualquer disparo criado pela
-- rota /api/whatsapp/broadcast falhava ao inserir os destinatários,
-- mesmo com um broadcast_id válido e recém-criado.
--
-- broadcast_recipients estava vazia (0 linhas) no momento desta
-- correção — nada a migrar, só apontar a FK pro lugar certo.
--
-- Idempotente.
-- ============================================================

ALTER TABLE broadcast_recipients DROP CONSTRAINT IF EXISTS broadcast_recipients_broadcast_id_fkey;

ALTER TABLE broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_broadcast_id_fkey
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE;
