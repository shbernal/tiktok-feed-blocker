import { test, expect } from '../fixtures/extension'
import type { Page } from '@playwright/test'

const clickPopupSwitch = async (page: Page, label: string) => {
  await page
    .locator('.switch-row', { hasText: label })
    .locator('.slider')
    .click()
}

test('popup changes update an open TikTok fixture page', async ({
  clearSettings,
  seedSettings,
  newTikTokPage,
  openExtensionPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings({
    active: false,
    home: false,
    explore: false,
    live: false,
    overlay: true,
  })

  const page = await newTikTokPage()
  await page.goto('https://www.tiktok.com/explore')

  const mainContent = page.locator('#main-content-explore_page')
  await expect(mainContent).toHaveCSS('display', 'block')
  await expect(page.locator('#ttfb-feed-overlay')).toHaveClass(
    /ttfb-overlay-available/,
  )
  await expect(page.locator('#ttfb-feed-overlay-block-button')).toHaveText(
    'Block Explore',
  )

  const popup = await openExtensionPage('/src/popup/index.html')
  await expect(popup.getByLabel('Block Explore')).not.toBeChecked()
  await clickPopupSwitch(popup, 'Block Explore')

  await expect(mainContent).toHaveCSS('display', 'none')
  await expect(page.locator('html')).toHaveAttribute(
    'data-ttfb-explore-blocked',
  )
  await expect(page.locator('#ttfb-feed-overlay')).toBeVisible()
  await expect(page.locator('#ttfb-active-toggle-label')).toHaveText(
    'Block Explore',
  )
  await expect.poll(readSettings).toEqual({
    active: true,
    home: false,
    explore: true,
    live: false,
    overlay: true,
  })
})
