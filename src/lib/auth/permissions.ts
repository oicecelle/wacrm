import type { AccountRole } from './roles';

/**
 * Gatekeeper helper to check granular permissions.
 * Owner and Admin always bypass check and get allowed.
 * Fallback to role-based defaults if permissions_json is empty.
 *
 * permissions_json is stored FLAT — {"view_agenda": true,
 * "edit_crm": true, "gerenciar_equipe": false, ...} — matching
 * exactly what the Equipe editor's checkboxes save (see
 * PERMISSION_LABELS in src/app/(dashboard)/equipe/page.tsx), not the
 * nested {module: {view, edit}} shape this function used to expect.
 * Most callers already pass that flat key directly as `module`
 * (hasPermission("view_agenda", "view")); a couple pass a bare module
 * name instead (hasPermission("financeiro", "edit")) — both are
 * normalized to the same flat key here, so neither calling style
 * silently fails.
 */

// The few permission keys that are a single standalone action, not a
// view_/edit_ pair — used as-is instead of "<action>_<module>".
const STANDALONE_KEYS = new Set(['gerenciar_equipe', 'acessar_configuracoes', 'configurar_marketing', 'generate_documentos']);

// Bare module name → the "restricted for agent/viewer without custom
// permissions" category, and → its flat permission key. Every module
// string ever passed as `module` (bare or already-flat) resolves
// through here.
const MODULE_ALIASES: Record<string, string> = {
  financeiro: 'financeiro', view_financeiro: 'financeiro', edit_financeiro: 'financeiro',
  settings: 'settings', acessar_configuracoes: 'settings',
  equipe: 'equipe', gerenciar_equipe: 'equipe',
  relatorios: 'relatorios', view_relatorios: 'relatorios',
  crm: 'crm', view_crm: 'crm', edit_crm: 'crm',
  agenda: 'agenda', view_agenda: 'agenda', edit_agenda: 'agenda',
  documentos: 'documentos', view_documentos: 'documentos', generate_documentos: 'documentos',
  marketing: 'marketing', configurar_marketing: 'marketing',
};

function toFlatKey(module: string, action: 'view' | 'edit'): string {
  if (STANDALONE_KEYS.has(module)) return module;
  if (/^(view|edit)_/.test(module)) return module;
  return `${action}_${module}`;
}

export function hasPermission(
  role: AccountRole,
  permissionsJson: any,
  module: string,
  action: 'view' | 'edit' = 'view'
): boolean {
  if (role === 'owner' || role === 'admin') return true;

  const flatKey = toFlatKey(module, action);
  const category = MODULE_ALIASES[module] ?? MODULE_ALIASES[flatKey] ?? module;

  // Fallback defaults if no granular permissions configured
  if (!permissionsJson || Object.keys(permissionsJson).length === 0) {
    if (role === 'agent') {
      if (['financeiro', 'settings', 'equipe', 'relatorios'].includes(category)) {
        return false;
      }
      return true; // Agents can view and edit other modules
    }
    if (role === 'viewer') {
      if (['financeiro', 'settings', 'equipe', 'relatorios'].includes(category)) {
        return false;
      }
      return action === 'view'; // Viewers read-only
    }
    return false;
  }

  return permissionsJson[flatKey] === true;
}
