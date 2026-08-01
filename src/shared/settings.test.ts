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
        overlay: true,
      }),
    ).toEqual({
      active: true,
      home: false,
      explore: true,
      live: false,
      overlay: true,
    })

    expect(
      syncActiveWithPages({
        active: true,
        home: false,
        explore: false,
        live: false,
        overlay: true,
      }),
    ).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
      overlay: true,
    })
  })

  it('detects any-page and all-pages states', () => {
    const partialSettings: ExtensionSettings = {
      active: true,
      home: true,
      explore: false,
      live: false,
      overlay: true,
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
      overlay: true,
    })

    expect(
      setAllPages(
        {
          active: false,
          home: false,
          explore: false,
          live: false,
          overlay: true,
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
      overlay: true,
    })

    expect(
      normalizeSettings(
        { active: true },
        {
          active: false,
          home: true,
          explore: false,
          live: true,
          overlay: true,
        },
      ),
    ).toEqual({
      active: true,
      home: true,
      explore: false,
      live: true,
      overlay: true,
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
      overlay: true,
    })
  })

  it('keeps the overlay preference out of the page-section helpers', () => {
    const overlayHidden: ExtensionSettings = {
      active: false,
      home: false,
      explore: false,
      live: false,
      overlay: false,
    }

    // No page section is on, so the extension is inactive regardless of the
    // overlay preference.
    expect(isAnyPageActive(overlayHidden)).toBe(false)
    expect(syncActiveWithPages(overlayHidden).active).toBe(false)

    // "Block all pages" must leave the overlay preference alone in both
    // directions.
    expect(setAllPages(overlayHidden, true).overlay).toBe(false)
    expect(
      setAllPages({ ...overlayHidden, overlay: true }, false).overlay,
    ).toBe(true)
    expect(isAllPagesActive({ ...DEFAULT_SETTINGS, overlay: false })).toBe(true)
  })

  it('round-trips a stored overlay preference through normalization', () => {
    expect(
      normalizeSettings({
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: false,
      }).overlay,
    ).toBe(false)

    // Settings written before the field existed default to showing it.
    expect(
      normalizeSettings({
        active: true,
        home: true,
        explore: true,
        live: true,
      }).overlay,
    ).toBe(true)

    // A non-boolean falls back rather than becoming truthy.
    expect(
      normalizeSettings({
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: 'no',
      }).overlay,
    ).toBe(true)
  })

  it('defaults the overlay preference to true on the legacy storage path', () => {
    // The legacy key only ever recorded whether blocking was on; it must not
    // decide whether the overlay is shown.
    expect(deriveSettingsFromStorage(undefined, false).overlay).toBe(true)
    expect(deriveSettingsFromStorage(undefined, true).overlay).toBe(true)
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
      overlay: true,
    })

    expect(deriveSettingsFromStorage(undefined, false)).toEqual({
      active: false,
      home: false,
      explore: false,
      live: false,
      overlay: true,
    })
  })
})
