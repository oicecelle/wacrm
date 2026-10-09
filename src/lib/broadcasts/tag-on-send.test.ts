import { describe, it, expect } from 'vitest'
import { readTagIdOnSend, suggestedTagName, resolveTagOnSend } from './tag-on-send'

describe('readTagIdOnSend', () => {
  it('só devolve a tag quando ligado e resolvido', () => {
    expect(readTagIdOnSend({ tagOnSend: { enabled: true, tagId: 't1' } })).toBe('t1')
    expect(readTagIdOnSend({ tagOnSend: { enabled: false, tagId: 't1' } })).toBeNull()
    expect(readTagIdOnSend({ tagOnSend: { enabled: true } })).toBeNull()
    expect(readTagIdOnSend(null)).toBeNull()
    expect(readTagIdOnSend({})).toBeNull()
  })
})

describe('suggestedTagName', () => {
  it('usa o nome do disparo, senão o do modelo', () => {
    expect(suggestedTagName('Verão', 'Campanha')).toBe('Disparo: Verão')
    expect(suggestedTagName('', 'Campanha')).toBe('Disparo: Campanha')
  })
})

type Row = Record<string, unknown>
function fakeDb(tags: Row[]) {
  const inserted: Row[] = []
  const db = {
    from: () => {
      let filters: Array<(r: Row) => boolean> = []
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
        ilike: (k: string, v: string) => (filters.push((r) => String(r[k]).toLowerCase() === v.toLowerCase()), q),
        limit: () => q,
        maybeSingle: async () => ({ data: tags.find((r) => filters.every((f) => f(r))) ?? null }),
        insert: (row: Row) => ({
          select: () => ({
            single: async () => {
              const created = { id: `new-${inserted.length + 1}`, ...row }
              inserted.push(created)
              tags.push(created)
              return { data: created, error: null }
            },
          }),
        }),
      }
      void filters
      filters = []
      return q
    },
  }
  return { db: db as never, inserted }
}

describe('resolveTagOnSend', () => {
  it('cria a tag nova uma vez e reaproveita pelo nome', async () => {
    const { db, inserted } = fakeDb([])
    const first = await resolveTagOnSend(db, 'acc', 'u', { type: 'all', tagOnSend: { enabled: true, newTagName: 'Verão' } })
    expect(readTagIdOnSend(first.audienceFilter)).toBe('new-1')
    const second = await resolveTagOnSend(db, 'acc', 'u', { tagOnSend: { enabled: true, newTagName: 'verão' } })
    expect(readTagIdOnSend(second.audienceFilter)).toBe('new-1')
    expect(inserted).toHaveLength(1)
  })
  it('recusa tag de outra clínica', async () => {
    const { db } = fakeDb([{ id: 't9', account_id: 'outra' }])
    const r = await resolveTagOnSend(db, 'acc', 'u', { tagOnSend: { enabled: true, tagId: 't9' } })
    expect(r.error).toBeTruthy()
  })
  it('desligado: remove a opção e não toca no banco', async () => {
    const { db, inserted } = fakeDb([])
    const r = await resolveTagOnSend(db, 'acc', 'u', { type: 'all', tagOnSend: { enabled: false } })
    expect(r.audienceFilter).toEqual({ type: 'all' })
    expect(inserted).toHaveLength(0)
  })
  it('exige nome quando não há tag', async () => {
    const { db } = fakeDb([])
    const r = await resolveTagOnSend(db, 'acc', 'u', { tagOnSend: { enabled: true, newTagName: '  ' } })
    expect(r.error).toBeTruthy()
  })
})
