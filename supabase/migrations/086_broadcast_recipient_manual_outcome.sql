-- Resultado marcado à mão em cada destinatário de disparo.
--
-- Na tela "Desempenho dos disparos" a equipe pode corrigir o resultado de quem
-- recebeu o disparo (por exemplo: a pessoa apareceu presencialmente e agendou).
-- A marcação manual vale mais do que a detecção automática.
--
--   NULL           = usar a detecção automática
--   'sem_resposta' = não respondeu
--   'respondeu'    = respondeu, sem agendamento
--   'agendou'      = agendou (conta no desempenho do modelo)

ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS manual_outcome text,
  ADD COLUMN IF NOT EXISTS manual_outcome_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_outcome_by uuid;

ALTER TABLE public.broadcast_recipients
  DROP CONSTRAINT IF EXISTS broadcast_recipients_manual_outcome_check;
ALTER TABLE public.broadcast_recipients
  ADD CONSTRAINT broadcast_recipients_manual_outcome_check
  CHECK (manual_outcome IS NULL OR manual_outcome IN ('sem_resposta', 'respondeu', 'agendou'));
