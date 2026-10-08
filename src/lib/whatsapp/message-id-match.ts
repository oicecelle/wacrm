import { bareMessageId } from './uazapi-events'

/**
 * PostgREST `.or()` filter that finds a stored message whatever form its
 * id was saved in: bare (`3EB0…`, what the echo carries) or prefixed with
 * the owner number (`5521…:3EB0…`, what the send API used to return).
 * Ids are alphanumeric; anything else is stripped so the filter string
 * can't be broken by a hostile id.
 */
export function messageIdMatchFilter(id: string): string {
  const bare = bareMessageId(id).replace(/[^A-Za-z0-9_-]/g, '')
  return `message_id.eq.${bare},message_id.like.%:${bare}`
}
