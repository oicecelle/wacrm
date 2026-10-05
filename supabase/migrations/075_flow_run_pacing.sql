-- ============================================================
-- 075_flow_run_pacing.sql
--
-- Intervalo entre envios nos Fluxos (a migração 073 já criou
-- flows.min_interval_seconds e reserve_flow_send_slot).
--
-- flow_runs.resume_at: quando uma execução bate num nó de envio e a
-- vaga dela cai longe demais pra esperar dentro da requisição, ela é
-- ESTACIONADA nesse nó (current_node_key) com resume_at = a vaga.
-- O cron de fluxos retoma as que venceram. Nulo = execução normal.
--
-- Evento 'paced' no log da execução, pra aparecer na auditoria por
-- que uma mensagem saiu mais tarde do que o normal.
--
-- Idempotente.
-- ============================================================

ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS resume_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_flow_runs_resume_at ON flow_runs(resume_at) WHERE resume_at IS NOT NULL;

ALTER TABLE flow_run_events DROP CONSTRAINT IF EXISTS flow_run_events_event_type_check;
ALTER TABLE flow_run_events ADD CONSTRAINT flow_run_events_event_type_check CHECK (
  event_type = ANY (ARRAY['started','node_entered','message_sent','reply_received','fallback_fired','handoff','timeout','error','completed','paced'])
);
