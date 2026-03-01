export const SETTINGS_STORAGE_KEY = 'extensionSettings'
export const LEGACY_ACTIVE_STORAGE_KEY = 'extensionActive'

export type ExtensionSettings = {
  active: boolean
  home: boolean
  explore: boolean
  live: boolean
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  active: true,
  home: true,
  explore: true,
  live: true,
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readBoolean = (value: unknown, fallback: boolean) => {
  return typeof value === 'boolean' ? value : fallback
}

export const normalizeSettings = (
  value: unknown,
  fallback: ExtensionSettings = DEFAULT_SETTINGS,
): ExtensionSettings => {
  if (!isRecord(value)) {
    return { ...fallback }
  }

  return {
    active: readBoolean(value.active, fallback.active),
    home: readBoolean(value.home, fallback.home),
    explore: readBoolean(value.explore, fallback.explore),
    live: readBoolean(value.live, fallback.live),
  }
}

export const deriveSettingsFromStorage = (
  settingsValue: unknown,
  legacyActiveValue: unknown,
): ExtensionSettings => {
  if (isRecord(settingsValue)) {
    return normalizeSettings(settingsValue)
  }

  const active = legacyActiveValue !== false
  return {
    ...DEFAULT_SETTINGS,
    active,
  }
}
