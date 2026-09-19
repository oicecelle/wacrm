import { useAuth } from './use-auth';
import { hasPermission as hasPermissionHelper } from '@/lib/auth/permissions';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function usePermissions() {
  const { accountRole: role, user, accountId } = useAuth();
  const supabase = createClient();
  const [permissionsJson, setPermissionsJson] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      if (!user || !user.id || !accountId) {
        setLoading(false);
        return;
      }
      try {
        // Scoped by clinic_id, not just user_id — a user who belongs
        // to more than one clinic has one clinic_users row per
        // membership, potentially with different roles/permissions
        // in each. Without this filter, .maybeSingle() against
        // multiple matching rows returns whichever one Postgres
        // happens to pick, which could silently apply a DIFFERENT
        // clinic's permissions (more OR less restrictive) to the one
        // currently being viewed.
        const { data } = await supabase
          .from('clinic_users')
          .select('permissions_json')
          .eq('user_id', user.id)
          .eq('clinic_id', accountId)
          .maybeSingle();
        if (data) {
          setPermissionsJson(data.permissions_json);
        }
      } catch (err) {
        console.error('Error fetching user permissions hook:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchPermissions();
  }, [user, accountId, supabase]);

  const checkPermission = (module: string, action: 'view' | 'edit' = 'view') => {
    if (!role) return false;
    return hasPermissionHelper(role, permissionsJson, module, action);
  };

  return {
    hasPermission: checkPermission,
    loading,
    permissionsJson
  };
}
