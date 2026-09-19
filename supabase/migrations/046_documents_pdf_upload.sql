-- ============================================================
-- 046_documents_pdf_upload.sql
--
-- Documentos hoje só suportam texto digitado/gerado dentro do
-- sistema — não dá pra enviar um PDF já pronto (um contrato que a
-- clínica já usa, um documento assinado fisicamente pra anexar,
-- etc). Nova coluna guarda a URL do arquivo quando o documento for
-- desse tipo, em vez de (ou além de) texto.
--
-- Idempotente.
-- ============================================================

ALTER TABLE documents ADD COLUMN IF NOT EXISTS pdf_url TEXT;
