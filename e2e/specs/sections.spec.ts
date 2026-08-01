import { test, expect } from '../fixtures/extension'
import type { Page } from '@playwright/test'
import type { ExtensionSettings, PageSection } from '../../src/shared/settings'

const settingsWithOnly = (section: PageSection): ExtensionSettings => ({
  active: true,
  home: section === 'home',
  explore: section === 'explore',
  live: section === 'live',
  overlay: true,
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

// Blocking is a stylesheet gated on a root attribute, so `<html>` carries the
// state that per-element `data-ttfb-*-hidden` attributes used to. Asserting it
// alongside computed display separates "the extension turned blocking off"
// from "the extension still thinks it is on but the CSS stopped matching".
const expectSectionBlocked = async (
  page: Page,
  section: PageSection,
  blocked: boolean,
) => {
  const attribute = `data-ttfb-${section}-blocked`
  const html = page.locator('html')

  if (blocked) {
    await expect(html).toHaveAttribute(attribute)
  } else {
    await expect(html).not.toHaveAttribute(attribute)
  }
}

const expectAvailableOverlay = async (page: Page, label: string) => {
  const overlay = page.locator('#ttfb-feed-overlay')
  const blockButton = page.locator('#ttfb-feed-overlay-block-button')

  await expect(overlay).toBeVisible()
  await expect(overlay).toHaveClass(/ttfb-overlay-available/)
  await expect(overlay).toHaveCSS('top', '16px')
  await expect(overlay).toHaveCSS('right', '16px')
  await expect(blockButton).toHaveText(label)

  return blockButton
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
  const homeCommentSidebar = page.locator('#home-comment-sidebar')
  // The seek bar is never targeted directly; it goes away with its container.
  const homeVideoProgress = page.locator('#home-video-progress')
  await expect(homeTarget).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'home', true)
  await expect(homeVideoProgress).toBeHidden()
  await expect(homeCommentSidebar).toHaveCSS('display', 'none')
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Home',
  )
  await expectMediaState(page, '#home-video', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  const blockButton = await expectAvailableOverlay(page, 'Block Home')
  await expect(homeTarget).toHaveCSS('display', 'block')
  await expectSectionBlocked(page, 'home', false)
  await expect(homeVideoProgress).toBeVisible()
  await expect(homeCommentSidebar).toHaveCSS('display', 'block')
  await expectMediaState(page, '#home-video', { muted: false, volume: 0.75 })
  await expect.poll(readSettings).toMatchObject({
    active: false,
    home: false,
    explore: false,
    live: false,
  })

  await blockButton.click()

  await expect(homeTarget).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'home', true)
  await expect(homeVideoProgress).toBeHidden()
  await expect(homeCommentSidebar).toHaveCSS('display', 'none')
  await expect(page.locator('#ttfb-feed-overlay')).toHaveClass(
    /ttfb-overlay-blocked/,
  )
  await expect.poll(readSettings).toMatchObject({
    active: true,
    home: true,
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

  await expect(mainContent).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'explore', true)
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Explore',
  )
  await expectMediaState(page, '#explore-video', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  const blockButton = await expectAvailableOverlay(page, 'Block Explore')
  await expect(mainContent).toHaveCSS('display', 'block')
  await expectSectionBlocked(page, 'explore', false)
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

  await blockButton.click()

  await expect(mainContent).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'explore', true)
  await expect(page.locator('#ttfb-feed-overlay')).toHaveClass(
    /ttfb-overlay-blocked/,
  )
  await expect.poll(readSettings).toMatchObject({
    active: true,
    home: false,
    explore: true,
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

  const liveTarget = page.locator('#tiktok-live-main-container-id')
  await expect(liveTarget).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'live', true)
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Live',
  )
  await expectMediaState(page, '#live-video', { muted: true, volume: 0 })
  await expectMediaState(page, '#live-audio', { muted: true, volume: 0 })

  await toggleOverlaySwitch(page)

  const blockButton = await expectAvailableOverlay(page, 'Block Live')
  await expect(liveTarget).toHaveCSS('display', 'block')
  await expectSectionBlocked(page, 'live', false)
  await expectMediaState(page, '#live-video', { muted: false, volume: 0.75 })
  await expectMediaState(page, '#live-audio', { muted: false, volume: 0.75 })
  await expect.poll(readSettings).toMatchObject({
    active: false,
    home: false,
    explore: false,
    live: false,
  })

  await blockButton.click()

  await expect(liveTarget).toHaveCSS('display', 'none')
  await expectSectionBlocked(page, 'live', true)
  await expect(page.locator('#ttfb-feed-overlay')).toHaveClass(
    /ttfb-overlay-blocked/,
  )
  await expect.poll(readSettings).toMatchObject({
    active: true,
    home: false,
    explore: false,
    live: true,
  })
})
