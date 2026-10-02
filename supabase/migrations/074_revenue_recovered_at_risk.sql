-- ============================================================
-- 074_revenue_recovered_at_risk.sql
--
-- Duas funções de atribuição pra "Inteligência da LYA" — critério
-- decidido com o cliente, não inventado:
--
-- recovered_revenue: rigoroso. Só conta uma venda como "recuperada
-- pela LYA" quando TODA a cadeia aconteceu: o cliente ficou
-- p_silence_days sem mandar mensagem → uma automação agiu com
-- sucesso dentro desse silêncio → o cliente respondeu depois disso
-- → o negócio foi ganho. Prova causa-e-efeito de verdade, por isso
-- o número é conservador (menor que "qualquer venda que a
-- automação tocou em algum momento").
--
-- at_risk_revenue: negócios ainda abertos cujo contato está há
-- p_silence_days ou mais sem mandar mensagem (ou nunca mandou) —
-- definição direta do próprio documento de produto.
--
-- Funções, não view/query solta: a lógica de "maior intervalo entre
-- duas mensagens consecutivas do cliente" precisa de window function
-- (LAG), que não dá pra expressar limpo via PostgREST — e calcular
-- isso em JavaScript puxando todas as mensagens da conta pro
-- navegador seria lento e pesado à toa.
--
-- Idempotente.
-- ============================================================

CREATE OR REPLACE FUNCTION recovered_revenue(p_account_id UUID, p_since TIMESTAMPTZ, p_silence_days INTEGER DEFAULT 3)
RETURNS TABLE (deal_count INTEGER, total_value NUMERIC)
LANGUAGE sql
STABLE
AS $$
  WITH customer_msgs AS (
    SELECT m.created_at, c.contact_id
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.account_id = p_account_id AND m.sender_type = 'customer'
  ),
  gaps AS (
    SELECT contact_id, created_at AS reply_at,
      LAG(created_at) OVER (PARTITION BY contact_id ORDER BY created_at) AS prev_msg_at
    FROM customer_msgs
  ),
  silence_then_reply AS (
    SELECT DISTINCT contact_id, prev_msg_at AS silence_start, reply_at
    FROM gaps
    WHERE prev_msg_at IS NOT NULL
      AND reply_at - prev_msg_at >= make_interval(days => p_silence_days)
  ),
  recovered_contacts AS (
    SELECT DISTINCT str.contact_id
    FROM silence_then_reply str
    WHERE EXISTS (
      SELECT 1 FROM automation_logs al
      JOIN automations a ON a.id = al.automation_id
      WHERE a.account_id = p_account_id
        AND al.contact_id = str.contact_id
        AND al.status = 'success'
        AND al.created_at > str.silence_start
        AND al.created_at < str.reply_at
    )
  )
  SELECT count(*)::INTEGER, COALESCE(sum(d.value), 0)
  FROM deals d
  WHERE d.account_id = p_account_id
    AND d.status = 'won'
    AND d.updated_at >= p_since
    AND d.contact_id IN (SELECT contact_id FROM recovered_contacts);
$$;

CREATE OR REPLACE FUNCTION at_risk_revenue(p_account_id UUID, p_silence_days INTEGER DEFAULT 3)
RETURNS TABLE (deal_count INTEGER, total_value NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::INTEGER, COALESCE(sum(d.value), 0)
  FROM deals d
  WHERE d.account_id = p_account_id
    AND d.status = 'open'
    AND NOT EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.contact_id = d.contact_id
        AND m.sender_type = 'customer'
        AND m.created_at > now() - make_interval(days => p_silence_days)
    );
$$;
