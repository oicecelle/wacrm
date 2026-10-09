/**
 * "Marcar quem receber este disparo": opção do disparo que coloca uma tag
 * no contato assim que a mensagem dele é enviada com sucesso.
 *
 * Fica dentro de `broadcasts.audience_filter.tagOnSend`:
 *   - ao montar o disparo: { enabled, tagId } (tag existente) ou { enabled, newTagName }
 *   - depois que o servidor cria/acha a tag: { enabled, tagId }
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TagOnSend {
  enabled: boolean
  tagId?: string
  newTagName?: string
}

/** Lê a opção de um audience_filter qualquer; null quando desligada ou sem tag resolvida. */
export function readTagIdOnSend(audienceFilter: unknown): string | null {
  const t = (audienceFilter as { tagOnSend?: TagOnSend } | null | undefined)?.tagOnSend
  if (!t || t.enabled !== true) return null
  return typeof t.tagId === 'string' && t.tagId ? t.tagId : null
}

/** Nome padrão sugerido para a tag (o usuário pode trocar). */
export function suggestedTagName(broadcastName: string, templateName: string): string {
  const base = (broadcastName || templateName || 'Disparo').trim()
  return `Disparo: ${base}`.slice(0, 60)
}

/**
 * Garante que a tag exista na conta e devolve o audience_filter com o tagId
 * resolvido. Nome repetido na mesma conta reaproveita a tag existente.
 */
export async function resolveTagOnSend(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  accountId: string,
  userId: string,
  audienceFilter: unknown,
): Promise<{ audienceFilter: unknown; error?: string }> {
  const t = (audienceFilter as { tagOnSend?: TagOnSend } | null | undefined)?.tagOnSend
  if (!t || t.enabled !== true) {
    if (!t) return { audienceFilter }
    const { tagOnSend: _drop, ...rest } = audienceFilter as Record<string, unknown>
    void _drop
    return { audienceFilter: rest }
  }

  let tagId = typeof t.tagId === 'string' && t.tagId ? t.tagId : null
  if (tagId) {
    const { data } = await db.from('tags').select('id').eq('id', tagId).eq('account_id', accountId).maybeSingle()
    if (!data) return { audienceFilter, error: 'A tag escolhida para marcar os contatos não existe nesta clínica.' }
  } else {
    const name = (t.newTagName ?? '').trim()
    if (!name) return { audienceFilter, error: 'Informe o nome da tag para marcar os contatos.' }
    const { data: existing } = await db.from('tags').select('id').eq('account_id', accountId).ilike('name', name).limit(1).maybeSingle()
    if (existing) {
      tagId = existing.id as string
    } else {
      const { data: created, error } = await db
        .from('tags')
        .insert({ account_id: accountId, user_id: userId, name, color: '#8b5cf6' })
        .select('id')
        .single()
      if (error || !created) return { audienceFilter, error: `Não foi possível criar a tag: ${error?.message ?? 'erro desconhecido'}` }
      tagId = created.id as string
    }
  }

  return {
    audienceFilter: { ...(audienceFilter as Record<string, unknown>), tagOnSend: { enabled: true, tagId } },
  }
}

// Cache curto: o worker envia vários destinatários do mesmo disparo em sequência.
const cache = new Map<string, { tagId: string | null; at: number }>()
const TTL_MS = 60_000

/** Tag a aplicar nos contatos deste disparo (ou null). */
export async function tagIdForBroadcast(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  broadcastId: string,
): Promise<string | null> {
  const hit = cache.get(broadcastId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tagId
  const { data } = await db.from('broadcasts').select('audience_filter').eq('id', broadcastId).maybeSingle()
  const tagId = readTagIdOnSend(data?.audience_filter)
  cache.set(broadcastId, { tagId, at: Date.now() })
  return tagId
}

export function clearTagCacheForTests() {
  cache.clear()
}
