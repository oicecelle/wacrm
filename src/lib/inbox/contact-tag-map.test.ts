import { describe, expect, it } from "vitest";
import { buildContactTagMap, contactMatchesTagFilter, tagKey, type TagChip } from "./contact-tag-map";

const crm = (id: string, name = id): TagChip => ({ kind: "crm", id, name, color: "#111" });
const wa = (id: string, name = id): TagChip => ({ kind: "wa", id, name, color: "#222" });

describe("buildContactTagMap", () => {
  const map = buildContactTagMap({
    crmTags: [crm("t1", "VIP"), crm("t2", "Retorno")],
    crmPairs: [
      { contact_id: "c1", tag_id: "t1" },
      { contact_id: "c1", tag_id: "t2" },
      { contact_id: "c2", tag_id: "t1" },
      { contact_id: "c3", tag_id: "tag-from-another-account" },
    ],
    waLabels: [wa("10", "Responder"), wa("20", "Pago")],
    waPairs: [
      { contact_id: "c1", wa_label_id: "10" },
      { contact_id: "c3", wa_label_id: "20" },
      { contact_id: "c3", wa_label_id: "999" },
    ],
  });

  it("keeps the two kinds apart on the same contact", () => {
    expect(map.get("c1")!.crm.map((t) => t.name)).toEqual(["VIP", "Retorno"]);
    expect(map.get("c1")!.wa.map((t) => t.name)).toEqual(["Responder"]);
  });

  it("a WhatsApp label id and a CRM tag id can be equal without colliding", () => {
    expect(tagKey(crm("10"))).not.toBe(tagKey(wa("10")));
  });

  it("skips pairs whose definition is unknown (other account / deleted / not synced yet)", () => {
    expect(map.get("c3")!.crm).toEqual([]);
    expect(map.get("c3")!.wa.map((t) => t.name)).toEqual(["Pago"]);
  });

  it("contacts with no tags have no entry", () => {
    expect(map.get("c9")).toBeUndefined();
  });
});

describe("contactMatchesTagFilter", () => {
  const info = { crm: [crm("t1")], wa: [wa("10")] };
  it("no filter selected lets everyone through, tagged or not", () => {
    expect(contactMatchesTagFilter(undefined, new Set())).toBe(true);
    expect(contactMatchesTagFilter(info, new Set())).toBe(true);
  });
  it("matches a CRM tag and a WhatsApp label independently", () => {
    expect(contactMatchesTagFilter(info, new Set(["crm:t1"]))).toBe(true);
    expect(contactMatchesTagFilter(info, new Set(["wa:10"]))).toBe(true);
  });
  it("REGRESSION: crm:10 must not match a contact that only has WhatsApp label 10", () => {
    expect(contactMatchesTagFilter({ crm: [], wa: [wa("10")] }, new Set(["crm:10"]))).toBe(false);
  });
  it("any-of semantics, and untagged contacts never match a selection", () => {
    expect(contactMatchesTagFilter(info, new Set(["crm:nope", "wa:10"]))).toBe(true);
    expect(contactMatchesTagFilter(info, new Set(["crm:nope"]))).toBe(false);
    expect(contactMatchesTagFilter(undefined, new Set(["crm:t1"]))).toBe(false);
  });
});
