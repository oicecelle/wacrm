-- Cada clínica tem os seus modelos: o nome é único DENTRO da clínica
-- (antes era único por usuário, o que deixava dois usuários da mesma
-- clínica criarem o mesmo nome).
alter table public.message_templates drop constraint if exists message_templates_user_name_language_key;
drop index if exists public.message_templates_user_name_language_key;
create unique index if not exists message_templates_account_name_language_key
  on public.message_templates (account_id, lower(btrim(name)), language);

-- Histórico "quem já recebeu qual modelo": antes só era gravado para modelos
-- com "impedir reenvio" ligado, então ligar depois não excluía ninguém.
-- Reconstrói o histórico a partir dos disparos já enviados.
insert into public.template_send_log (account_id, contact_id, template_id, last_sent_at)
select b.account_id, r.contact_id, t.id, max(r.sent_at)
from public.broadcast_recipients r
join public.broadcasts b on b.id = r.broadcast_id
join public.message_templates t on t.account_id = b.account_id and t.name = b.template_name
where r.sent_at is not null and r.contact_id is not null
group by b.account_id, r.contact_id, t.id
on conflict (account_id, contact_id, template_id)
do update set last_sent_at = greatest(public.template_send_log.last_sent_at, excluded.last_sent_at);
