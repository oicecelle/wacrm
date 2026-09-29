import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions";

// Shape actually saved by the Equipe editor's checkboxes — flat keys,
// not the {module: {view, edit}} nesting hasPermission used to expect.
const realWorldPermissions = {
  edit_crm: true, view_crm: true,
  edit_agenda: true, view_agenda: true,
  edit_financeiro: true, view_financeiro: true,
  view_documentos: true, generate_documentos: true,
  view_relatorios: true,
  gerenciar_equipe: true,
  configurar_marketing: true,
  acessar_configuracoes: true,
};

describe("hasPermission", () => {
  it("owner and admin bypass everything, permissions_json or not", () => {
    expect(hasPermission("owner", null, "view_financeiro", "view")).toBe(true);
    expect(hasPermission("admin", {}, "edit_crm", "edit")).toBe(true);
  });

  it("reads a real flat permissions_json correctly for the flat-key calling style", () => {
    expect(hasPermission("agent", realWorldPermissions, "view_agenda", "view")).toBe(true);
    expect(hasPermission("agent", realWorldPermissions, "edit_financeiro", "edit")).toBe(true);
    expect(hasPermission("agent", realWorldPermissions, "gerenciar_equipe", "view")).toBe(true);
  });

  it("reads the same flat permissions_json for the bare-module calling style", () => {
    // src/components/ui/appointment-modal.tsx's own convention before
    // today's fix: hasPermission("financeiro", "edit") — must resolve
    // to the same flat key ("edit_financeiro") as the explicit form.
    expect(hasPermission("agent", realWorldPermissions, "financeiro", "edit")).toBe(true);
  });

  it("denies a module the person was explicitly not given", () => {
    const limited = { view_agenda: true }; // nothing else granted
    expect(hasPermission("agent", limited, "edit_agenda", "edit")).toBe(false);
    expect(hasPermission("agent", limited, "view_financeiro", "view")).toBe(false);
    expect(hasPermission("agent", limited, "financeiro", "view")).toBe(false);
  });

  it("treats an explicit false the same as not granted", () => {
    expect(hasPermission("agent", { view_financeiro: false }, "view_financeiro", "view")).toBe(false);
  });

  it("falls back to role defaults when permissions_json is empty or null — agent", () => {
    expect(hasPermission("agent", null, "view_agenda", "view")).toBe(true);
    expect(hasPermission("agent", {}, "edit_crm", "edit")).toBe(true);
    // financeiro/settings/equipe/relatorios are blocked by default for agents
    expect(hasPermission("agent", null, "view_financeiro", "view")).toBe(false);
    expect(hasPermission("agent", null, "acessar_configuracoes", "view")).toBe(false);
    expect(hasPermission("agent", null, "gerenciar_equipe", "view")).toBe(false);
    expect(hasPermission("agent", null, "view_relatorios", "view")).toBe(false);
  });

  it("falls back to role defaults when permissions_json is empty — viewer (read-only, same 4 modules blocked)", () => {
    expect(hasPermission("viewer", null, "view_agenda", "view")).toBe(true);
    expect(hasPermission("viewer", null, "edit_agenda", "edit")).toBe(false);
    expect(hasPermission("viewer", null, "view_financeiro", "view")).toBe(false);
  });

  it("denies everything for an unrecognized role with no permissions_json", () => {
    // @ts-expect-error deliberately invalid role, mirrors a null/garbled account_role reaching here
    expect(hasPermission("something_else", null, "view_agenda", "view")).toBe(false);
  });

  it("both calling styles for the same permission agree with each other, granted or not", () => {
    for (const perms of [realWorldPermissions, { view_financeiro: true }, {}, null]) {
      for (const action of ["view", "edit"] as const) {
        expect(hasPermission("agent", perms, "financeiro", action)).toBe(
          hasPermission("agent", perms, `${action}_financeiro`, action),
        );
      }
    }
  });
});
