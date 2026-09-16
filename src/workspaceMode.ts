export type WorkspaceMode = "platform" | "organization";

const KEY = "escala-imob:workspace-mode";

export function readWorkspaceMode(): WorkspaceMode | null {
  try {
    const value = globalThis.sessionStorage.getItem(KEY);
    return value === "platform" || value === "organization" ? value : null;
  } catch {
    return null;
  }
}

export function saveWorkspaceMode(mode: WorkspaceMode): void {
  try {
    globalThis.sessionStorage.setItem(KEY, mode);
  } catch {
    // A preferência vale apenas para a sessão atual e não é crítica.
  }
}

export function clearWorkspaceMode(): void {
  try {
    globalThis.sessionStorage.removeItem(KEY);
  } catch {
    // Sem efeito funcional relevante.
  }
}
