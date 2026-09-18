-- ============================================================
-- 043_filter_contacts_by_tags_account_scope.sql
--
-- filter_contacts_by_tags() relied purely on RLS to scope results to
-- the caller's account — correct as far as security goes (SECURITY
-- INVOKER, no privilege bypass), but RLS now correctly grants access
-- to every account a user belongs to (migration 042 fixed
-- is_account_member to recognize clinic_users), not just whichever
-- one is currently active. Without an explicit account filter here,
-- someone who manages multiple clinics gets contacts from ALL of
-- them mixed into one filtered list instead of just the one they're
-- currently working in.
--
-- Adds a required p_account_id parameter, narrowing the join to that
-- account explicitly — RLS still applies underneath as defense in
-- depth, this just makes "current clinic only" the actual query
-- instead of an RLS side-effect.
-- ============================================================

DROP FUNCTION IF EXISTS public.filter_contacts_by_tags(UUID[], TEXT, INT, INT);

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_account_id UUID,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 25,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (contact contacts, total_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT DISTINCT c.id, c.created_at
    FROM contacts c
    JOIN contact_tags ct ON ct.contact_id = c.id
    WHERE ct.tag_id = ANY(p_tag_ids)
      AND c.account_id = p_account_id
      AND (
        p_search IS NULL
        OR c.name ILIKE '%' || p_search || '%'
        OR c.phone ILIKE '%' || p_search || '%'
        OR c.email ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT id, count(*) OVER() AS total_count
    FROM matched
    ORDER BY created_at DESC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT c AS contact, page.total_count
  FROM page
  JOIN contacts c ON c.id = page.id
  ORDER BY c.created_at DESC, c.id;
$$;

ALTER FUNCTION public.filter_contacts_by_tags(UUID[], UUID, TEXT, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.filter_contacts_by_tags(UUID[], UUID, TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_contacts_by_tags(UUID[], UUID, TEXT, INT, INT) TO authenticated;
