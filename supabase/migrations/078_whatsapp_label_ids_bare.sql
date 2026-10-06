-- ============================================================
-- 078_whatsapp_label_ids_bare.sql
--
-- Os ids de etiqueta chegavam em chat.wa_label como
-- '<número da clínica>:<id>' (ex.: '554196864960:15') e eram gravados
-- assim, mas as definições (whatsapp_labels) usam só o número ('15').
-- Nenhuma associação casava com a definição, então nenhum contato
-- aparecia com etiqueta. O código passou a gravar só o número; aqui
-- corrige o que já estava gravado.
--
-- Remove antes qualquer par que viraria duplicata (mesmo contato e
-- mesma etiqueta nos dois formatos). Idempotente.
-- ============================================================

DELETE FROM contact_whatsapp_labels a
 USING contact_whatsapp_labels b
 WHERE a.wa_label_id LIKE '%:%'
   AND a.contact_id = b.contact_id
   AND b.wa_label_id = regexp_replace(a.wa_label_id, '^.*:', '');

UPDATE contact_whatsapp_labels
   SET wa_label_id = regexp_replace(wa_label_id, '^.*:', '')
 WHERE wa_label_id LIKE '%:%';

UPDATE whatsapp_labels
   SET wa_label_id = regexp_replace(wa_label_id, '^.*:', '')
 WHERE wa_label_id LIKE '%:%'
   AND NOT EXISTS (
     SELECT 1 FROM whatsapp_labels w2
      WHERE w2.account_id = whatsapp_labels.account_id
        AND w2.wa_label_id = regexp_replace(whatsapp_labels.wa_label_id, '^.*:', '')
   );
