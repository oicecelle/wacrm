import { useAuth } from './use-auth';
import { hasPermission as hasPermissionHelper } from '@/lib/auth/permissions';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function usePermissions() {
  const { accountRole: role, user } = useAuth();
  const supabase = createClient();
  const [permissionsJson, setPermissionsJson] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPermissions() {
      if (!user || !user.id) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('clinic_users')
          .select('permissions_json')
          .eq('user_id', user.id)
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
  }, [user, supabase]);

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
