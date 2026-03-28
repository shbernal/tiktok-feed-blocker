export const SETTINGS_STORAGE_KEY = 'extensionSettings'
export const LEGACY_ACTIVE_STORAGE_KEY = 'extensionActive'

export type ExtensionSettings = {
  active: boolean
  home: boolean
  explore: boolean
  live: boolean
}

export type PageSection = 'home' | 'explore' | 'live'

export const DEFAULT_SETTINGS: ExtensionSettings = {
  active: true,
  home: true,
  explore: true,
  live: true,
}

const PAGE_SECTIONS: PageSection[] = ['home', 'explore', 'live']

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const readBoolean = (value: unknown, fallback: boolean) => {
  return typeof value === 'boolean' ? value : fallback
}

const hasPageSectionSettings = (value: Record<string, unknown>) => {
  return PAGE_SECTIONS.some(section => typeof value[section] === 'boolean')
}

export const isAnyPageActive = (settings: ExtensionSettings) => {
  return PAGE_SECTIONS.some(section => settings[section])
}

export const isAllPagesActive = (settings: ExtensionSettings) => {
  return PAGE_SECTIONS.every(section => settings[section])
}

export const syncActiveWithPages = (
  settings: ExtensionSettings,
): ExtensionSettings => {
  return {
    ...settings,
    active: isAnyPageActive(settings),
  }
}

export const setAllPages = (
  settings: ExtensionSettings,
  enabled: boolean,
): ExtensionSettings => {
  return syncActiveWithPages({
    ...settings,
    home: enabled,
    explore: enabled,
    live: enabled,
  })
}

export const normalizeSettings = (
  value: unknown,
  fallback: ExtensionSettings = DEFAULT_SETTINGS,
): ExtensionSettings => {
  if (!isRecord(value)) {
    return syncActiveWithPages({ ...fallback })
  }

  const legacyActive = readBoolean(value.active, fallback.active)

  if (!hasPageSectionSettings(value)) {
    return syncActiveWithPages({
      ...fallback,
      active: legacyActive,
      home: legacyActive ? fallback.home : false,
      explore: legacyActive ? fallback.explore : false,
      live: legacyActive ? fallback.live : false,
    })
  }

  return syncActiveWithPages({
    active: legacyActive,
    home: readBoolean(value.home, fallback.home),
    explore: readBoolean(value.explore, fallback.explore),
    live: readBoolean(value.live, fallback.live),
  })
}

export const deriveSettingsFromStorage = (
  settingsValue: unknown,
  legacyActiveValue: unknown,
): ExtensionSettings => {
  if (isRecord(settingsValue)) {
    return normalizeSettings(settingsValue)
  }

  const active = legacyActiveValue !== false
  return setAllPages(DEFAULT_SETTINGS, active)
}
