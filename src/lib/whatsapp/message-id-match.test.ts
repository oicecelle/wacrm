import { describe, it, expect } from 'vitest'
import { messageIdMatchFilter } from './message-id-match'

describe('messageIdMatchFilter', () => {
  it('matches the bare id and the owner-prefixed form', () => {
    expect(messageIdMatchFilter('3EB0A1')).toBe('message_id.eq.3EB0A1,message_id.like.%:3EB0A1')
  })
  it('strips the owner prefix from the given id', () => {
    expect(messageIdMatchFilter('5521995319599:3EB0A1')).toBe('message_id.eq.3EB0A1,message_id.like.%:3EB0A1')
  })
  it('drops characters that could break the filter', () => {
    expect(messageIdMatchFilter('AB,message_id.neq.x)')).toBe('message_id.eq.ABmessage_idneqx,message_id.like.%:ABmessage_idneqx')
  })
})
