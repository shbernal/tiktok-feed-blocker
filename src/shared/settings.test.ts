import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  deriveSettingsFromStorage,
  isAllPagesActive,
  isAnyPageActive,
  normalizeSettings,
  setAllPages,
  syncActiveWithPages,
  type ExtensionSettings,
} from './settings'

describe('settings helpers', () => {
  it('keeps the global active flag synced with enabled page sections', () => {
    expect(
      syncActiveWithPages({
        active: false,
        home: false,
        explore: true,
        live: false,
      }),
    ).toEqual({
      active: true,
      home: false,
      explore: true,
      live: false,
    })

    expect(
      syncActiveWithPages({
        active: true,
        home: false,
        explore: false,
        live: false,
      }),
    ).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
    })
  })

  it('detects any-page and all-pages states', () => {
    const partialSettings: ExtensionSettings = {
      active: true,
      home: true,
      explore: false,
      live: false,
    }

    expect(isAnyPageActive(partialSettings)).toBe(true)
    expect(isAllPagesActive(partialSettings)).toBe(false)
    expect(isAllPagesActive(DEFAULT_SETTINGS)).toBe(true)
  })

  it('sets all page sections together', () => {
    expect(setAllPages(DEFAULT_SETTINGS, false)).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
    })

    expect(
      setAllPages(
        {
          active: false,
          home: false,
          explore: false,
          live: false,
        },
        true,
      ),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('normalizes invalid settings back to the fallback shape', () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(normalizeSettings('enabled')).toEqual(DEFAULT_SETTINGS)
  })

  it('migrates legacy active-only settings without page sections', () => {
    expect(normalizeSettings({ active: false })).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
    })

    expect(
      normalizeSettings(
        { active: true },
        {
          active: false,
          home: true,
          explore: false,
          live: true,
        },
      ),
    ).toEqual({
      active: true,
      home: true,
      explore: false,
      live: true,
    })
  })

  it('normalizes page-section settings and ignores stale active values', () => {
    expect(
      normalizeSettings({
        active: false,
        home: false,
        explore: true,
        live: 'yes',
      }),
    ).toEqual({
      active: true,
      home: false,
      explore: true,
      live: true,
    })
  })

  it('derives current storage before falling back to legacy storage', () => {
    expect(
      deriveSettingsFromStorage(
        {
          active: true,
          home: false,
          explore: true,
          live: false,
        },
        false,
      ),
    ).toEqual({
      active: true,
      home: false,
      explore: true,
      live: false,
    })

    expect(deriveSettingsFromStorage(undefined, false)).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
    })
  })
})
