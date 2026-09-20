-- ============================================================
-- 053_flow_nodes_add_set_crm_status.sql
--
-- Achado na revisão sem depender de mensagem real: 'set_crm_status'
-- já existe no código (tipo, NODE_META, menu de adicionar nó) desde
-- antes desta sessão, mas nunca estava na trava (CHECK) do banco —
-- qualquer tentativa de salvar um fluxo com esse tipo de nó falharia
-- direto no banco. Nenhum fluxo existente usa esse tipo ainda
-- (verificado), então não há dado pra migrar, só a trava pra
-- corrigir.
--
-- Idempotente.
-- ============================================================

ALTER TABLE flow_nodes DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;
ALTER TABLE flow_nodes ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type = ANY (ARRAY[
    'start', 'send_buttons', 'send_list', 'send_message', 'send_media',
    'collect_input', 'condition', 'set_tag', 'set_crm_status', 'handoff',
    'http_fetch', 'end'
  ]::text[]));
