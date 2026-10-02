-- ============================================================
-- 073_automation_send_interval.sql
--
-- Intervalo configurável entre envios de automações (item 1 do
-- pedido) — protege o número de WhatsApp de rajada quando a mesma
-- automação dispara pra muita gente ao mesmo tempo (ex: 50 pessoas
-- perguntam a mesma coisa no mesmo minuto).
--
-- min_interval_seconds: nulo/0 = sem limite (comportamento atual,
-- sem mudança pra quem não configurar). Quando configurado, nenhum
-- envio de mensagem/modelo/mídia dessa automação sai mais rápido
-- que esse intervalo em relação ao envio anterior DA MESMA
-- automação — não é por contato, é geral da automação (é
-- justamente o cenário de "várias pessoas ao mesmo tempo" que isso
-- protege).
--
-- last_outbound_sent_at: marca de quando foi o último envio de
-- verdade. Avançada de forma atômica (ver a função abaixo) — duas
-- execuções simultâneas nunca "furam a fila" uma da outra.
--
-- Idempotente.
-- ============================================================

ALTER TABLE automations ADD COLUMN IF NOT EXISTS min_interval_seconds INTEGER;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_outbound_sent_at TIMESTAMPTZ;

-- Avança last_outbound_sent_at atomicamente e devolve o instante em
-- que ESTE envio está liberado a sair. Padrão clássico de "token
-- bucket por timestamp": cada chamada reserva sua própria vaga,
-- empurrando a marca pra frente pelo intervalo configurado — mesmo
-- com dezenas de chamadas concorrentes, cada uma sai com um horário
-- de liberação diferente, nunca dois envios no mesmo instante.
CREATE OR REPLACE FUNCTION reserve_automation_send_slot(p_automation_id UUID, p_interval_seconds INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot TIMESTAMPTZ;
BEGIN
  -- COALESCE primeiro, SEM somar o intervalo ainda: se nunca houve
  -- envio (last_outbound_sent_at nulo), a vaga reservada é agora
  -- mesmo — o primeiro envio de uma automação nunca espera.
  UPDATE automations
  SET last_outbound_sent_at = GREATEST(
    COALESCE(last_outbound_sent_at + make_interval(secs => p_interval_seconds), now()),
    now()
  )
  WHERE id = p_automation_id
  RETURNING last_outbound_sent_at INTO v_slot;
  RETURN v_slot;
END;
$$;

-- Mesma coisa, pro outro motor de mensagens (Fluxos — conversas
-- ramificadas com botão/lista, trigger_type próprio). "Modelos ou
-- fluxos" no pedido original cobre os dois.
ALTER TABLE flows ADD COLUMN IF NOT EXISTS min_interval_seconds INTEGER;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS last_outbound_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION reserve_flow_send_slot(p_flow_id UUID, p_interval_seconds INTEGER)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
AS $$
DECLARE
  v_slot TIMESTAMPTZ;
BEGIN
  UPDATE flows
  SET last_outbound_sent_at = GREATEST(
    COALESCE(last_outbound_sent_at + make_interval(secs => p_interval_seconds), now()),
    now()
  )
  WHERE id = p_flow_id
  RETURNING last_outbound_sent_at INTO v_slot;
  RETURN v_slot;
END;
$$;
