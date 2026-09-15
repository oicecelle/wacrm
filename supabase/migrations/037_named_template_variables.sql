-- ============================================================
-- 037_named_template_variables.sql
--
-- Templates de disparo via Uazapi não passam pela revisão da Meta,
-- então não precisam do sistema posicional {{1}}, {{2}} que a Meta
-- exige. Passamos a suportar variáveis NOMEADAS no corpo do modelo
-- (ex: {{nome}}, {{servico}}, {{profissional}}), mais legíveis pra
-- quem está montando a mensagem.
--
-- Templates Meta existentes continuam funcionando exatamente como
-- antes — isso é aditivo, não substitui o fluxo posicional usado na
-- submissão/aprovação da Meta.
--
--   message_templates.variables — nomes das variáveis usadas no corpo
--     (ex: {nome, sobrenome, data}), extraídos automaticamente do
--     body_text no momento de salvar. Usado pela UI de personalizar
--     (Fase 3) para saber quais campos pedir por contato.
--
--   broadcast_recipients.params — a partir de agora guarda um objeto
--     { "nome": "Maria", "servico": "Avaliação" } em vez de um array
--     posicional. JSONB aceita os dois formatos, então não há
--     necessidade de migrar dados existentes (nenhum disparo real
--     rodou com o formato antigo ainda).
--
-- Idempotente.
-- ============================================================

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS variables TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE broadcast_recipients
  ALTER COLUMN params SET DEFAULT '{}'::jsonb;
