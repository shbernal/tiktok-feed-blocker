import { test, expect } from '../fixtures/extension'
import type { Page } from '@playwright/test'
import type { ExtensionSettings, PageSection } from '../../src/shared/settings'

const settingsWithOnly = (section: PageSection): ExtensionSettings => ({
  active: true,
  home: section === 'home',
  explore: section === 'explore',
  live: section === 'live',
})

const expectMediaState = async (
  page: Page,
  selector: string,
  expected: { muted: boolean; volume: number },
) => {
  const state = await page.locator(selector).evaluate(element => {
    const media = element as HTMLMediaElement
    return {
      muted: media.muted,
      volume: media.volume,
    }
  })

  expect(state).toEqual(expected)
}

const toggleOverlaySwitch = async (page: Page) => {
  await page.locator('#ttfb-feed-overlay .ttfb-slider').click()
}

test('blocks and restores Home targets', async ({
  clearSettings,
  seedSettings,
  newTikTokPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(settingsWithOnly('home'))

  const page = await newTikTokPage()
  await page.goto('https://www.tiktok.com/')

  const homeTarget = page.locator('#column-list-container')
  await expect(homeTarget).toHaveCSS('display', 'none')
  await expect(homeTarget).toHaveAttribute('data-ttfb-home-hidden', 'true')
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Home',
  )
  await expectMediaState(page, '#home-video', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  await expect(page.locator('#ttfb-feed-overlay')).toHaveCount(0)
  await expect(homeTarget).toHaveCSS('display', 'block')
  await expect(homeTarget).not.toHaveAttribute('data-ttfb-home-hidden', 'true')
  await expectMediaState(page, '#home-video', { muted: false, volume: 0.75 })
  await expect.poll(readSettings).toMatchObject({
    active: false,
    home: false,
    explore: false,
    live: false,
  })
})

test('blocks and restores Explore targets', async ({
  clearSettings,
  seedSettings,
  newTikTokPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(settingsWithOnly('explore'))

  const page = await newTikTokPage()
  await page.goto('https://www.tiktok.com/explore')

  const mainContent = page.locator('#main-content-explore_page')
  const exploreLayout = page.locator(
    '[class*="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout"]',
  )

  await expect(mainContent).toHaveCSS('display', 'none')
  await expect(mainContent).toHaveAttribute('data-ttfb-explore-hidden', 'true')
  await expect(exploreLayout).toHaveCSS('display', 'none')
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Explore',
  )
  await expectMediaState(page, '#explore-video', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  await expect(page.locator('#ttfb-feed-overlay')).toHaveCount(0)
  await expect(mainContent).toHaveCSS('display', 'block')
  await expect(mainContent).not.toHaveAttribute(
    'data-ttfb-explore-hidden',
    'true',
  )
  await expect(exploreLayout).toHaveCSS('display', 'block')
  await expectMediaState(page, '#explore-video', {
    muted: false,
    volume: 0.75,
  })
  await expect.poll(readSettings).toMatchObject({
    active: false,
    home: false,
    explore: false,
    live: false,
  })
})

test('blocks and restores Live targets', async ({
  clearSettings,
  seedSettings,
  newTikTokPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings(settingsWithOnly('live'))

  const page = await newTikTokPage()
  await page.goto('https://www.tiktok.com/live')

  const liveTarget = page.locator('div[class*="ejpasz60"]')
  await expect(liveTarget).toHaveCSS('display', 'none')
  await expect(liveTarget).toHaveAttribute('data-ttfb-live-hidden', 'true')
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Live',
  )
  await expectMediaState(page, '#live-video', { muted: true, volume: 0 })
  await expectMediaState(page, '#live-audio', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  await expect(page.locator('#ttfb-feed-overlay')).toHaveCount(0)
  await expect(liveTarget).toHaveCSS('display', 'block')
  await expect(liveTarget).not.toHaveAttribute('data-ttfb-live-hidden', 'true')
  await expectMediaState(page, '#live-video', { muted: false, volume: 0.75 })
  await expectMediaState(page, '#live-audio', { muted: false, volume: 0.75 })
  await expect.poll(readSettings).toMatchObject({
    active: false,
    home: false,
    explore: false,
    live: false,
  })
})
