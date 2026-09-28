# Alerta de segurança — políticas "bypass" em `appointments` e `patients`

**Gravidade: crítica (dados de saúde de todas as clínicas).** Encontrado em 28/09/2026 durante
uma verificação de rotina. **Ainda NÃO corrigido** — depende de uma decisão sua (ver "Antes de
aplicar").

## O que existe hoje no banco

Seis políticas de segurança em nível de linha (RLS), nas duas tabelas mais sensíveis do sistema:

| Tabela | Política | Operação |
|---|---|---|
| `appointments` | `bypass_rls_select_appointments` | SELECT |
| `appointments` | `bypass_rls_update_appointments` | UPDATE |
| `appointments` | `bypass_rls_insert_appointments` | INSERT |
| `patients` | `bypass_rls_select_patients` | SELECT |
| `patients` | `bypass_rls_update_patients` | UPDATE |
| `patients` | `bypass_rls_insert_patients` | INSERT |

Todas valem para os papéis `anon` **e** `authenticated`, e liberam **todas as linhas de todas as
clínicas** para qualquer requisição que envie o cabeçalho HTTP `x-webhook-secret` com um valor
fixo (uma frase curta e legível, gravada dentro da própria definição da política).

## Por que é grave

- A URL do Supabase e a chave `anon` são **públicas** (vão no código do navegador; a chave
  também aparece como valor padrão em `src/lib/supabase/server.ts`).
- Quem souber o valor do cabeçalho consegue, direto pela API, **ler todos os pacientes e
  agendamentos de todas as clínicas**, alterar e criar registros — sem login.
- O valor é uma frase fixa, fácil de vazar (planilhas, prints, fluxos do n8n, conversas).
- Dados de saúde são dado pessoal sensível na LGPD; um vazamento aqui tem consequência legal.

## O que sei e o que não sei

- O código do app e as migrações do repositório **nunca usam** esse cabeçalho: as políticas foram
  criadas direto no banco (provavelmente pelo editor SQL), para uma automação externa
  (o nome sugere um fluxo de sincronização no **n8n**).
- **Não sei se essa automação está ativa hoje.** Por isso não apaguei as políticas por conta
  própria: se houver um fluxo em produção usando isso, ele pararia de funcionar.

## Antes de aplicar

1. Verifique se existe algum fluxo (n8n ou outro) que envia o cabeçalho `x-webhook-secret`.
2. Se existir: troque-o para usar a **chave de serviço** (`service_role`) do Supabase, guardada só
   no servidor do n8n (nunca no navegador). A chave de serviço já ignora o RLS, então não
   precisa dessas políticas.
3. Só então aplique o SQL abaixo.

## SQL do conserto (não aplicado)

```sql
DROP POLICY IF EXISTS bypass_rls_select_appointments ON appointments;
DROP POLICY IF EXISTS bypass_rls_update_appointments ON appointments;
DROP POLICY IF EXISTS bypass_rls_insert_appointments ON appointments;
DROP POLICY IF EXISTS bypass_rls_select_patients ON patients;
DROP POLICY IF EXISTS bypass_rls_update_patients ON patients;
DROP POLICY IF EXISTS bypass_rls_insert_patients ON patients;
```

As políticas de isolamento por clínica (`clinic_isolation_*`) continuam protegendo os dados.

## Depois de aplicar

- Considere o valor antigo do segredo **comprometido** e não o reutilize em lugar nenhum.
- Confira se há outras tabelas com o mesmo padrão:
  `SELECT tablename, policyname FROM pg_policies WHERE qual ILIKE '%x-webhook-secret%' OR with_check ILIKE '%x-webhook-secret%';`
  (na verificação de hoje, só `appointments` e `patients` apareceram).
