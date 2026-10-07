-- ============================================================
-- 083_conversation_locks.sql
--
-- Trava curta por conversa para o trabalho que roda DEPOIS de salvar uma
-- mensagem recebida (fluxos, automações, IA).
--
-- Por quê: o webhook agora salva a mensagem, responde à Uazapi e só então
-- processa. Isso encurta a resposta, mas deixa a mensagem seguinte do
-- mesmo cliente chegar enquanto a anterior ainda está sendo processada. O
-- motor de fluxos descarta como 'duplicada' uma mensagem que encontra uma
-- execução ainda sendo criada, então duas mensagens seguidas ("oi" + "quero
-- agendar") poderiam perder a segunda. Com a trava, o trabalho de uma
-- conversa roda uma mensagem por vez.
--
-- É uma LOCAÇÃO com validade (TTL), não uma trava de transação: se o
-- processo morrer segurando-a, ela expira sozinha. Quem não conseguir
-- adquirir dentro do tempo prossegue assim mesmo (falha aberta): perder
-- uma automação é pior que processar em paralelo. Só o servidor acessa
-- (RLS ligada, sem políticas). Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversation_locks (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  holder TEXT NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_conversation_lock(
  p_conversation_id uuid,
  p_holder text,
  p_ttl_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_got boolean;
BEGIN
  -- Entra se ninguém tem a trava, se ela expirou, ou se já é nossa.
  INSERT INTO public.conversation_locks AS l (conversation_id, holder, locked_until)
  VALUES (p_conversation_id, p_holder, now() + make_interval(secs => GREATEST(1, LEAST(p_ttl_seconds, 120))))
  ON CONFLICT (conversation_id) DO UPDATE
    SET holder = EXCLUDED.holder, locked_until = EXCLUDED.locked_until
    WHERE l.locked_until < now() OR l.holder = EXCLUDED.holder
  RETURNING true INTO v_got;

  RETURN COALESCE(v_got, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_conversation_lock(
  p_conversation_id uuid,
  p_holder text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Só quem segura a trava pode soltá-la: um processo atrasado não pode
  -- soltar a trava que já passou para outro.
  DELETE FROM public.conversation_locks WHERE conversation_id = p_conversation_id AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION public.acquire_conversation_lock(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_conversation_lock(uuid, text) FROM PUBLIC, anon, authenticated;
