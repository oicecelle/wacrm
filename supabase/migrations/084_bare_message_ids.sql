-- Mensagens enviadas pela ferramenta apareciam duas vezes: o envio gravava o
-- id como "numero:ID" e o eco do WhatsApp chegava só com "ID", então a
-- checagem de duplicata não reconhecia a mesma mensagem.

-- 1) Une as duplicatas já gravadas: mantém a linha do envio (prefixada),
--    passa respostas/reações para ela e apaga o eco.
with pairs as (
  select a.id as keep_id, b.id as drop_id
  from messages a
  join messages b
    on a.conversation_id = b.conversation_id
   and a.id <> b.id
   and a.message_id ~ '^[0-9]+:'
   and split_part(a.message_id, ':', 2) = b.message_id
)
update messages m set reply_to_message_id = p.keep_id
from pairs p where m.reply_to_message_id = p.drop_id;

with pairs as (
  select a.id as keep_id, b.id as drop_id
  from messages a
  join messages b
    on a.conversation_id = b.conversation_id
   and a.id <> b.id
   and a.message_id ~ '^[0-9]+:'
   and split_part(a.message_id, ':', 2) = b.message_id
)
delete from messages where id in (select drop_id from pairs);

-- 2) Ids passam a ser guardados sem o prefixo do número.
update messages set message_id = split_part(message_id, ':', 2)
where message_id ~ '^[0-9]+:[A-Za-z0-9_-]+$';

-- 3) Rede de segurança: qualquer caminho de envio grava o id já sem prefixo.
create or replace function normalize_message_id() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.message_id ~ '^[0-9]+:[A-Za-z0-9_-]+$' then
    new.message_id := split_part(new.message_id, ':', 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_normalize_message_id on messages;
create trigger trg_normalize_message_id
  before insert on messages
  for each row execute function normalize_message_id();
