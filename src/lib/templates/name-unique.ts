import type { SupabaseClient } from '@supabase/supabase-js'

/** Nome comparável: sem espaços sobrando, sem diferença de maiúscula/minúscula. */
export function normalizeTemplateName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')
}

/**
 * Cada clínica tem seus próprios modelos, e dentro da clínica o nome é único.
 * Devolve true se já existe outro modelo com este nome nesta clínica.
 */
export async function templateNameTaken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  accountId: string,
  name: string,
  exceptId?: string | null,
): Promise<boolean> {
  const wanted = normalizeTemplateName(name)
  if (!wanted) return false
  const { data, error } = await db.from('message_templates').select('id, name').eq('account_id', accountId)
  if (error) throw error
  return (data ?? []).some((t: { id: string; name: string }) => t.id !== exceptId && normalizeTemplateName(t.name) === wanted)
}
