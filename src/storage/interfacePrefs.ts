export type InterfaceTheme = 'light' | 'dark' | 'system';
export type WorkspacePanel = 'editor' | 'preview';
export interface InterfacePreferences {
  theme: InterfaceTheme;
  editorRatio: number;
  editorHidden: boolean;
  previewHidden: boolean;
}
export const INTERFACE_PREFERENCES_KEY = 'luck-resume-interface';
export const defaultInterfacePreferences: InterfacePreferences = {
  theme: 'system',
  editorRatio: 0.4,
  editorHidden: false,
  previewHidden: false,
};
export function clampEditorRatio(ratio: number, availableWidth?: number): number {
  const minimum =
    availableWidth && Number.isFinite(availableWidth) && availableWidth > 0
      ? Math.min(0.5, Math.max(0.2, 320 / availableWidth))
      : 0.2;
  return Math.min(1 - minimum, Math.max(minimum, Number.isFinite(ratio) ? ratio : 0.4));
}
export function parseInterfacePreferences(value: unknown): InterfacePreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ...defaultInterfacePreferences };
  const source = value as Record<string, unknown>;
  const editorHidden = source.editorHidden === true;
  return {
    theme: source.theme === 'light' || source.theme === 'dark' ? source.theme : 'system',
    editorRatio: clampEditorRatio(
      typeof source.editorRatio === 'number' ? source.editorRatio : 0.4,
    ),
    editorHidden,
    previewHidden: !editorHidden && source.previewHidden === true,
  };
}
export function toggleWorkspacePanel(
  preferences: InterfacePreferences,
  panel: WorkspacePanel,
): InterfacePreferences {
  if (panel === 'editor')
    return { ...preferences, editorHidden: !preferences.editorHidden, previewHidden: false };
  return { ...preferences, previewHidden: !preferences.previewHidden, editorHidden: false };
}
export function readInterfacePreferences(storage?: Pick<Storage, 'getItem'>): InterfacePreferences {
  try {
    const value = (storage ?? window.localStorage).getItem(INTERFACE_PREFERENCES_KEY);
    return parseInterfacePreferences(value ? JSON.parse(value) : null);
  } catch {
    return { ...defaultInterfacePreferences };
  }
}
export function writeInterfacePreferences(
  preferences: InterfacePreferences,
  storage?: Pick<Storage, 'setItem'>,
): void {
  try {
    (storage ?? window.localStorage).setItem(
      INTERFACE_PREFERENCES_KEY,
      JSON.stringify(parseInterfacePreferences(preferences)),
    );
  } catch {
    // Interface preferences remain available for the current session.
  }
}
