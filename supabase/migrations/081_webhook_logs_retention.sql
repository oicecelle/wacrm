-- ============================================================
-- 081_webhook_logs_retention.sql
--
-- whatsapp_webhook_logs é uma tabela de DIAGNÓSTICO: só o webhook grava
-- nela e nenhuma tela a lê. Estava em 242 MB (106 mil linhas desde
-- julho, 16× o tamanho de todas as mensagens) e crescia sem limite,
-- guardando o payload inteiro — incluindo o token da instância e o
-- texto das mensagens.
--
-- 1. índice por received_at (criado CONCURRENTLY à parte, pra não
--    bloquear as gravações do webhook; aqui só IF NOT EXISTS)
-- 2. purge_old_webhook_logs(): apaga em LOTES pequenos (sem lock longo,
--    com pausa entre lotes), com piso de segurança de 3 dias
-- 3. remove o 'token' dos registros que ficaram (em lotes)
-- 4. agenda a limpeza diária com pg_cron (03:00 em Brasília)
--
-- Retenção padrão: 14 dias. Idempotente.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_whatsapp_webhook_logs_received_at
  ON public.whatsapp_webhook_logs (received_at);

CREATE OR REPLACE FUNCTION public.purge_old_webhook_logs(
  p_retention_days integer DEFAULT 14,
  p_batch_size integer DEFAULT 5000,
  p_max_batches integer DEFAULT 40
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz;
  v_deleted integer := 0;
  v_n integer;
  v_i integer := 0;
BEGIN
  -- Piso de segurança: um argumento errado (0, 1…) não pode esvaziar o
  -- histórico de diagnóstico de uma vez.
  IF p_retention_days IS NULL OR p_retention_days < 3 THEN
    RAISE EXCEPTION 'retention must be at least 3 days (got %)', p_retention_days;
  END IF;

  v_cutoff := now() - make_interval(days => p_retention_days);

  LOOP
    DELETE FROM public.whatsapp_webhook_logs
     WHERE id IN (
       SELECT id FROM public.whatsapp_webhook_logs
        WHERE received_at < v_cutoff
        ORDER BY received_at
        LIMIT p_batch_size
     );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_deleted := v_deleted + v_n;
    v_i := v_i + 1;
    EXIT WHEN v_n < p_batch_size OR v_i >= p_max_batches;
    PERFORM pg_sleep(0.2); -- dá folga às gravações do webhook entre os lotes
  END LOOP;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_webhook_logs(integer, integer, integer) FROM PUBLIC, anon, authenticated;

-- Tokens de instância gravados em texto puro nos registros que ficaram.
-- (O código passa a nunca gravá-los; ver lib/whatsapp/log-redaction.ts.)
DO $$
DECLARE v_n integer; v_i integer := 0;
BEGIN
  LOOP
    UPDATE public.whatsapp_webhook_logs
       SET payload = payload - 'token'
     WHERE id IN (SELECT id FROM public.whatsapp_webhook_logs WHERE payload ? 'token' LIMIT 5000);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_i := v_i + 1;
    EXIT WHEN v_n = 0 OR v_i >= 60;
  END LOOP;
END $$;

-- Limpeza diária, se o pg_cron estiver instalado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-whatsapp-webhook-logs',
      '0 6 * * *',
      $cron$SELECT public.purge_old_webhook_logs(14)$cron$
    );
  END IF;
END $$;
