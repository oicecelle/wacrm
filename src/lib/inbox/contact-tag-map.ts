/**
 * Contact → tags, for the inbox. Two DIFFERENT kinds of tag live side
 * by side and must never be mixed up:
 *
 *  - "crm": tags created in this system (contact_tags / tags)
 *  - "wa":  labels that exist in the clinic's WhatsApp itself, mirrored
 *           here from Uazapi events (contact_whatsapp_labels)
 *
 * A filter key is `crm:<id>` or `wa:<id>`, so the two id spaces can't
 * collide.
 */
export type TagKind = "crm" | "wa";

export interface TagChip {
  kind: TagKind;
  id: string;
  name: string;
  /** CSS colour (hex). */
  color: string;
}

export interface ContactTagInfo {
  crm: TagChip[];
  wa: TagChip[];
}

export const tagKey = (t: Pick<TagChip, "kind" | "id">) => `${t.kind}:${t.id}`;

export interface TagMapInput {
  crmTags: TagChip[];
  crmPairs: Array<{ contact_id: string; tag_id: string }>;
  waLabels: TagChip[];
  waPairs: Array<{ contact_id: string; wa_label_id: string }>;
}

export function buildContactTagMap(input: TagMapInput): Map<string, ContactTagInfo> {
  const crmById = new Map(input.crmTags.map((t) => [t.id, t]));
  const waById = new Map(input.waLabels.map((t) => [t.id, t]));
  const map = new Map<string, ContactTagInfo>();
  const entry = (contactId: string) => {
    let e = map.get(contactId);
    if (!e) map.set(contactId, (e = { crm: [], wa: [] }));
    return e;
  };

  for (const p of input.crmPairs) {
    const tag = crmById.get(p.tag_id);
    if (tag) entry(p.contact_id).crm.push(tag);
  }
  // A pair pointing at a label we have no (non-deleted) definition for
  // is skipped: showing an unnamed chip would be noise, and the
  // definition arrives with the `labels` event / the sync button.
  for (const p of input.waPairs) {
    const label = waById.get(p.wa_label_id);
    if (label) entry(p.contact_id).wa.push(label);
  }
  return map;
}

/** True when the contact has AT LEAST ONE of the selected tags. No selection = everyone. */
export function contactMatchesTagFilter(
  info: ContactTagInfo | undefined,
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  if (!info) return false;
  return [...info.crm, ...info.wa].some((t) => selected.has(tagKey(t)));
}
