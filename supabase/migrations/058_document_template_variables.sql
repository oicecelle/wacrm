-- ============================================================
-- 058_document_template_variables.sql
--
-- Variáveis configuráveis em modelos de documento, além das 5
-- fixas que já existem (nome, CPF, data_nascimento, telefone,
-- data_atual). Cada variável tem:
--   key       — o {{nome_da_variavel}} usado no texto
--   label     — rótulo amigável mostrado no formulário
--   type      — 'text' (campo livre) ou 'procedure' (dropdown dos
--               serviços já cadastrados na clínica)
--   fill_by   — 'staff' (preenchido pela equipe, antes de enviar)
--               ou 'patient' (preenchido pelo próprio contato, na
--               tela pública de assinatura, antes de assinar)
--
-- documents.variable_values guarda os valores de fato preenchidos
-- pra cada variável, num documento específico já enviado — histórico
-- de auditoria de o que foi preenchido, além do texto final já
-- interpolado em documents.content.
--
-- Idempotente.
-- ============================================================

ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS variables JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS variable_values JSONB NOT NULL DEFAULT '{}'::jsonb;
