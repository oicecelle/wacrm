import { describe, it, expect } from 'vitest'
import { normalizeTemplateName, templateNameTaken } from './name-unique'

const dbWith = (rows: Array<{ id: string; name: string }>) =>
  ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error: null }) }) }) }) as never

describe('normalizeTemplateName', () => {
  it('ignora maiúscula e espaços', () => {
    expect(normalizeTemplateName('  Confirmação   Consulta ')).toBe('confirmação consulta')
  })
})

describe('templateNameTaken', () => {
  const rows = [{ id: 'a', name: 'Confirmação' }, { id: 'b', name: 'Follow up' }]
  it('detecta nome repetido na clínica', async () => {
    expect(await templateNameTaken(dbWith(rows), 'acc', ' confirmação ')).toBe(true)
  })
  it('permite nome novo', async () => {
    expect(await templateNameTaken(dbWith(rows), 'acc', 'Pós')).toBe(false)
  })
  it('ao editar, o próprio modelo não conta', async () => {
    expect(await templateNameTaken(dbWith(rows), 'acc', 'Confirmação', 'a')).toBe(false)
    expect(await templateNameTaken(dbWith(rows), 'acc', 'Confirmação', 'b')).toBe(true)
  })
  it('nome vazio não conflita', async () => {
    expect(await templateNameTaken(dbWith(rows), 'acc', '   ')).toBe(false)
  })
})
