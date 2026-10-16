-- Registro de antes/depois de alterações em lote (para poder desfazer).
create table if not exists public.bulk_flag_log (
  id bigserial primary key,
  batch text not null,
  applied_at timestamptz not null default now(),
  account_id uuid not null,
  table_name text not null,
  row_id uuid not null,
  column_name text,
  old_value text,
  new_value text,
  rule text
);
create index if not exists bulk_flag_log_batch_idx on public.bulk_flag_log (batch);
alter table public.bulk_flag_log enable row level security;
