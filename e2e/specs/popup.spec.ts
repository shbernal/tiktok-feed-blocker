import { test, expect } from '../fixtures/extension'
import type { Page } from '@playwright/test'

const clickPopupSwitch = async (page: Page, label: string) => {
  await page
    .locator('.switch-row', { hasText: label })
    .locator('.slider')
    .click()
}

test('popup reflects and persists section toggles', async ({
  clearSettings,
  seedSettings,
  openExtensionPage,
  readSettings,
}) => {
  await clearSettings()
  await seedSettings({
    active: true,
    home: true,
    explore: false,
    live: true,
    overlay: true,
  })

  const popup = await openExtensionPage('/src/popup/index.html')

  await expect(popup.getByLabel('Block all pages')).not.toBeChecked()
  await expect(popup.getByLabel('Block Home')).toBeChecked()
  await expect(popup.getByLabel('Block Explore')).not.toBeChecked()
  await expect(popup.getByLabel('Block Live')).toBeChecked()

  await clickPopupSwitch(popup, 'Block Explore')

  await expect(popup.getByLabel('Block all pages')).toBeChecked()
  await expect.poll(readSettings).toEqual({
    active: true,
    home: true,
    explore: true,
    live: true,
    overlay: true,
  })

  await clickPopupSwitch(popup, 'Block all pages')

  await expect(popup.getByLabel('Block Home')).not.toBeChecked()
  await expect(popup.getByLabel('Block Explore')).not.toBeChecked()
  await expect(popup.getByLabel('Block Live')).not.toBeChecked()
  await expect.poll(readSettings).toEqual({
    active: false,
    home: false,
    explore: false,
    live: false,
    overlay: true,
  })

  await clickPopupSwitch(popup, 'Block all pages')

  await expect(popup.getByLabel('Block Home')).toBeChecked()
  await expect(popup.getByLabel('Block Explore')).toBeChecked()
  await expect(popup.getByLabel('Block Live')).toBeChecked()
  await expect.poll(readSettings).toEqual({
    active: true,
    home: true,
    explore: true,
    live: true,
    overlay: true,
  })
})
