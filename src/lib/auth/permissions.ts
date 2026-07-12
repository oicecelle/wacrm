import type { AccountRole } from './roles';

/**
 * Gatekeeper helper to check granular permissions.
 * Owner and Admin always bypass check and get allowed.
 * Fallback to role-based defaults if permissions_json is empty.
 */
export function hasPermission(
  role: AccountRole,
  permissionsJson: any,
  module: string,
  action: 'view' | 'edit' = 'view'
): boolean {
  if (role === 'owner' || role === 'admin') return true;

  // Fallback defaults if no granular permissions configured
  if (!permissionsJson || Object.keys(permissionsJson).length === 0) {
    if (role === 'agent') {
      if (['financeiro', 'settings', 'equipe', 'relatorios'].includes(module)) {
        return false;
      }
      return true; // Agents can view and edit other modules
    }
    if (role === 'viewer') {
      if (['financeiro', 'settings', 'equipe', 'relatorios'].includes(module)) {
        return false;
      }
      return action === 'view'; // Viewers read-only
    }
    return false;
  }

  const modPerms = permissionsJson[module];
  if (!modPerms) return false;

  return !!modPerms[action];
}
