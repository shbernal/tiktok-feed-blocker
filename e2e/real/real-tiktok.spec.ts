import type { Page } from '@playwright/test'
import { test, expect } from '../fixtures/realExtension'
import type { ExtensionSettings, PageSection } from '../../src/shared/settings'
import { SELECTORS } from '../../src/content/selectors'
import { expectVisibleOverlayProof } from './overlayProof'

type RealTikTokCase = {
  section: PageSection
  url: string
  overlayLabel: string
}

const smokeTimeout = 45_000

const settingsWithOnly = (section: PageSection): ExtensionSettings => ({
  active: true,
  home: section === 'home',
  explore: section === 'explore',
  live: section === 'live',
  overlay: true,
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
    overlayLabel: 'Block Home',
  },
  {
    section: 'explore',
    url: 'https://www.tiktok.com/explore',
    overlayLabel: 'Block Explore',
  },
  {
    section: 'live',
    url: 'https://www.tiktok.com/live',
    overlayLabel: 'Block Live',
  },
]

// The selectors each page's blocking actually rests on, confirmed to match on
// real TikTok. A rename should fail here loudly rather than quietly degrade
// blocking into a no-op that every fixture test still passes.
//
// Two selectors are deliberately absent. `progressIndicator` matches nothing on
// real Home and is kept only as a conservative fallback, so requiring a match
// would fail on every run. `homeCommentSidebar` exists only while the sidebar
// is open, which this run never does.
const loadBearingSelectors: Record<PageSection, string[]> = {
  home: [SELECTORS.columnListContainer, SELECTORS.feedNavigationContainer],
  explore: [SELECTORS.mainContent],
  live: [SELECTORS.livePageMainContainer],
}

// Blocking is a stylesheet gated on a root attribute, so proving it took hold
// means checking `<html>` and the computed display of the selectors the section
// hides. The old per-element `data-ttfb-*-hidden` attributes are gone; computed
// display is the better proof anyway, because it is what the user sees.
const expectSectionBlocked = async (
  page: Page,
  section: PageSection,
  blocked: boolean,
) => {
  const attribute = `data-ttfb-${section}-blocked`
  const html = page.locator('html')

  if (blocked) {
    await expect(html).toHaveAttribute(attribute, { timeout: smokeTimeout })
  } else {
    await expect(html).not.toHaveAttribute(attribute, { timeout: smokeTimeout })
  }

  for (const selector of loadBearingSelectors[section]) {
    const target = page.locator(selector).first()
    const display = expect(target, `${section}: \`${selector}\``)

    if (blocked) {
      await display.toHaveCSS('display', 'none', { timeout: smokeTimeout })
    } else {
      await display.not.toHaveCSS('display', 'none', { timeout: smokeTimeout })
    }
  }
}

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
      await expectSectionBlocked(page, smokeCase.section, true)

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
      await expectSectionBlocked(page, smokeCase.section, false)
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
      await expectSectionBlocked(page, smokeCase.section, true)
      await expect
        .poll(readSettings, { timeout: smokeTimeout })
        .toMatchObject(settingsWithOnly(smokeCase.section))
    })
  }
})

test.describe('real TikTok selector coverage', () => {
  test.skip(
    process.env.RUN_REAL_TIKTOK_E2E !== '1',
    'Set RUN_REAL_TIKTOK_E2E=1 to run real TikTok smoke tests.',
  )

  for (const smokeCase of smokeCases) {
    test(`real ${smokeCase.section} selectors still match`, async ({
      newRealTikTokPage,
    }) => {
      test.skip(
        !getRequestedSections().has(smokeCase.section),
        `Skipping ${smokeCase.section}; not listed in TIKTOK_REAL_SECTIONS.`,
      )

      const page = await newRealTikTokPage()
      await gotoRealTikTokPage(page, smokeCase.url)

      for (const selector of loadBearingSelectors[smokeCase.section]) {
        await expect(
          page.locator(selector),
          `${smokeCase.section}: \`${selector}\` matched nothing on real TikTok`,
        ).not.toHaveCount(0, { timeout: smokeTimeout })
      }
    })
  }
})
