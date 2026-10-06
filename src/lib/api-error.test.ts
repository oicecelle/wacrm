import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

describe("apiErrorMessage", () => {
  it("explains a 401 instead of showing a bare 'Unauthorized'", () => {
    const msg = apiErrorMessage(401, { error: "Unauthorized" }, "x");
    expect(msg).not.toBe("Unauthorized");
    expect(msg).toContain("Recarregue");
  });
  it("keeps a meaningful server message, such as the reason Uazapi gave", () => {
    expect(apiErrorMessage(422, { error: "label not found" }, "x")).toBe("label not found");
    expect(apiErrorMessage(400, { error: "Etiquetas do WhatsApp exigem uma conexão Uazapi ativa." }, "x")).toContain("Uazapi");
  });
  it("403: friendly default, but a specific server reason wins", () => {
    expect(apiErrorMessage(403, { error: "Forbidden" }, "x")).toContain("permissão");
    expect(apiErrorMessage(403, { error: "This action requires the 'admin' role or higher" }, "x")).toContain("admin");
  });
  it("falls back when the body has no message", () => {
    expect(apiErrorMessage(500, null, "Falha ao sincronizar")).toBe("Falha ao sincronizar");
    expect(apiErrorMessage(500, {}, "Falha")).toBe("Falha");
    expect(apiErrorMessage(500, { error: 5 }, "Falha")).toBe("Falha");
  });
});
