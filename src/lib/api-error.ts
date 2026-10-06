/**
 * Turns a failed API response into something a person can act on.
 * A bare "Unauthorized" tells a clinic owner nothing; what helps is
 * "your session wasn't recognised — reload". Server messages that are
 * already meaningful (e.g. Uazapi's own reason) are kept as they are.
 */
export function apiErrorMessage(status: number, body: unknown, fallback: string): string {
  const serverMessage =
    body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? ((body as { error: string }).error)
      : "";

  if (status === 401) {
    return "Sua sessão não foi reconhecida pelo servidor. Recarregue a página e tente de novo; se continuar, saia e entre novamente.";
  }
  if (status === 403) {
    return serverMessage && serverMessage !== "Forbidden"
      ? serverMessage
      : "Você não tem permissão para fazer isso nesta clínica.";
  }
  return serverMessage || fallback;
}
