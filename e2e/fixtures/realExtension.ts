import {
  expect,
  test as base,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import {
  LEGACY_ACTIVE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type ExtensionSettings,
} from '../../src/shared/settings'
import {
  closeExtensionContext,
  getExtensionId,
  getStorageValue,
  launchExtensionContext,
  openExtensionPage as openExtensionPageInContext,
  removeStorageValues,
  setStorageValue,
  waitForExtensionWorker,
} from './extensionRuntime'
import { resolveRealTikTokProfilePath } from './realProfile'

type RealExtensionFixtures = {
  extensionContext: BrowserContext
  extensionId: string
  realTikTokProfilePath: string
  newRealTikTokPage: () => Promise<Page>
  openExtensionPage: (pagePath: string) => Promise<Page>
  clearSettings: () => Promise<void>
  seedSettings: (settings: ExtensionSettings) => Promise<void>
  readSettings: () => Promise<ExtensionSettings | undefined>
}

export const test = base.extend<RealExtensionFixtures>({
  extensionContext: async ({ headless }, use) => {
    const context = await launchExtensionContext({
      userDataDir: resolveRealTikTokProfilePath(),
      headless,
    })

    await waitForExtensionWorker(context)

    await use(context)
    await closeExtensionContext(context)
  },

  extensionId: async ({ extensionContext }, use) => {
    await use(await getExtensionId(extensionContext))
  },

  realTikTokProfilePath: async ({}, use) => {
    await use(resolveRealTikTokProfilePath())
  },

  newRealTikTokPage: async ({ extensionContext }, use) => {
    await use(async () => extensionContext.newPage())
  },

  openExtensionPage: async ({ extensionContext, extensionId }, use) => {
    await use(async pagePath => {
      return openExtensionPageInContext(extensionContext, extensionId, pagePath)
    })
  },

  clearSettings: async ({ extensionContext }, use) => {
    await use(async () => {
      await removeStorageValues(extensionContext, [
        SETTINGS_STORAGE_KEY,
        LEGACY_ACTIVE_STORAGE_KEY,
      ])
    })
  },

  seedSettings: async ({ extensionContext }, use) => {
    await use(async settings => {
      await setStorageValue(extensionContext, SETTINGS_STORAGE_KEY, settings)
    })
  },

  readSettings: async ({ extensionContext }, use) => {
    await use(async () =>
      getStorageValue<ExtensionSettings>(
        extensionContext,
        SETTINGS_STORAGE_KEY,
      ),
    )
  },
})

export { expect }
