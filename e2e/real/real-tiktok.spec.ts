import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/realExtension'
import type { ExtensionSettings, PageSection } from '../../src/shared/settings'
import { expectVisibleOverlayProof } from './overlayProof'

type RealTikTokCase = {
  section: PageSection
  url: string
  hiddenAttribute: string
  overlayLabel: string
}

const smokeTimeout = 45_000

const settingsWithOnly = (section: PageSection): ExtensionSettings => ({
  active: true,
  home: section === 'home',
  explore: section === 'explore',
  live: section === 'live',
})

const getRequestedSections = () => {
  return new Set(
    (process.env.TIKTOK_REAL_SECTIONS ?? 'home,explore,live')
      .split(',')
      .map(section => section.trim())
      .filter(Boolean),
  )
}

const smokeCases: RealTikTokCase[] = [
  {
    section: 'home',
    url: 'https://www.tiktok.com/',
    hiddenAttribute: 'data-ttfb-home-hidden',
    overlayLabel: 'Block Home',
  },
  {
    section: 'explore',
    url: 'https://www.tiktok.com/explore',
    hiddenAttribute: 'data-ttfb-explore-hidden',
    overlayLabel: 'Block Explore',
  },
  {
    section: 'live',
    url: 'https://www.tiktok.com/live',
    hiddenAttribute: 'data-ttfb-live-hidden',
    overlayLabel: 'Block Live',
  },
]

const gotoRealTikTokPage = async (page: Page, url: string) => {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
}

test.describe('real TikTok selector smoke', () => {
  test.skip(
    process.env.RUN_REAL_TIKTOK_E2E !== '1',
    'Set RUN_REAL_TIKTOK_E2E=1 to run real TikTok smoke tests.',
  )

  for (const smokeCase of smokeCases) {
    test(`blocks and restores real ${smokeCase.section}`, async ({
      clearSettings,
      seedSettings,
      newRealTikTokPage,
      readSettings,
    }, testInfo) => {
      test.skip(
        !getRequestedSections().has(smokeCase.section),
        `Skipping ${smokeCase.section}; not listed in TIKTOK_REAL_SECTIONS.`,
      )

      await clearSettings()
      await seedSettings(settingsWithOnly(smokeCase.section))

      const page = await newRealTikTokPage()
      await gotoRealTikTokPage(page, smokeCase.url)

      const overlay = page.locator('#ttfb-feed-overlay')
      const hiddenTargets = page.locator(
        `[${smokeCase.hiddenAttribute}="true"]`,
      )

      await expect(overlay).toBeVisible({ timeout: smokeTimeout })
      await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
        smokeCase.overlayLabel,
      )
      await expectVisibleOverlayProof({
        page,
        overlay,
        section: smokeCase.section,
        state: 'blocked',
        testInfo,
        expectedText: smokeCase.overlayLabel,
        expectedClass: /ttfb-overlay-blocked/,
        timeout: smokeTimeout,
      })
      await expect(hiddenTargets.first()).toBeAttached()

      await overlay.locator('.ttfb-slider').click()

      await expect(overlay).toHaveClass(/ttfb-overlay-available/)
      await expect(overlay).toHaveCSS('top', '16px')
      await expect(overlay).toHaveCSS('right', '16px')
      const blockButton = page.locator('#ttfb-feed-overlay-block-button')
      await expect(blockButton).toHaveText(smokeCase.overlayLabel)
      const availableProof = await expectVisibleOverlayProof({
        page,
        overlay,
        section: smokeCase.section,
        state: 'available',
        testInfo,
        expectedText: smokeCase.overlayLabel,
        expectedClass: /ttfb-overlay-available/,
        timeout: smokeTimeout,
      })
      expect(availableProof.css.top).toBe('16px')
      expect(availableProof.css.right).toBe('16px')
      await expect(hiddenTargets).toHaveCount(0)
      await expect.poll(readSettings, { timeout: smokeTimeout }).toMatchObject({
        active: false,
        home: false,
        explore: false,
        live: false,
      })

      await blockButton.click()

      await expect(overlay).toHaveClass(/ttfb-overlay-blocked/)
      await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
        smokeCase.overlayLabel,
      )
      await expectVisibleOverlayProof({
        page,
        overlay,
        section: smokeCase.section,
        state: 'reblocked',
        testInfo,
        expectedText: smokeCase.overlayLabel,
        expectedClass: /ttfb-overlay-blocked/,
        timeout: smokeTimeout,
      })
      await expect(hiddenTargets.first()).toBeAttached()
      await expect
        .poll(readSettings, { timeout: smokeTimeout })
        .toMatchObject(settingsWithOnly(smokeCase.section))
    })
  }
})
