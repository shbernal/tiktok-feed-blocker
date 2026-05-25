import fs from 'node:fs'
import path from 'node:path'
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'
import {
  LEGACY_ACTIVE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  type ExtensionSettings,
} from '../../src/shared/settings'
import { installTikTokFixtureRoutes } from './tiktokPages'

type ExtensionFixtures = {
  extensionContext: BrowserContext
  extensionId: string
  newTikTokPage: () => Promise<Page>
  openExtensionPage: (pagePath: string) => Promise<Page>
  clearSettings: () => Promise<void>
  seedSettings: (settings: ExtensionSettings) => Promise<void>
  readSettings: () => Promise<ExtensionSettings | undefined>
}

const extensionPath = path.resolve(process.cwd(), 'dist')

const resolveChromiumExecutable = () => {
  const explicitExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  if (explicitExecutable) {
    return explicitExecutable
  }

  return [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].find(candidate => fs.existsSync(candidate))
}

const isExtensionWorker = (worker: Worker) => {
  return worker.url().startsWith('chrome-extension://')
}

const waitForExtensionWorker = async (context: BrowserContext) => {
  const existingWorker = context.serviceWorkers().find(isExtensionWorker)
  if (existingWorker) {
    return existingWorker
  }

  return context.waitForEvent('serviceworker', {
    predicate: isExtensionWorker,
  })
}

const getExtensionId = async (context: BrowserContext) => {
  const worker = await waitForExtensionWorker(context)
  return new URL(worker.url()).hostname
}

const getStorageValue = async <Value>(context: BrowserContext, key: string) => {
  const worker = await waitForExtensionWorker(context)

  return worker.evaluate(
    storageKey =>
      new Promise<Value | undefined>(resolve => {
        chrome.storage.local.get(storageKey, result => {
          resolve(result[storageKey] as Value | undefined)
        })
      }),
    key,
  )
}

const setStorageValue = async <Value>(
  context: BrowserContext,
  key: string,
  value: Value,
) => {
  const worker = await waitForExtensionWorker(context)

  await worker.evaluate(
    ({ storageKey, storageValue }) =>
      new Promise<void>(resolve => {
        chrome.storage.local.set({ [storageKey]: storageValue }, () => {
          resolve()
        })
      }),
    { storageKey: key, storageValue: value },
  )
}

const removeStorageValues = async (context: BrowserContext, keys: string[]) => {
  const worker = await waitForExtensionWorker(context)

  await worker.evaluate(
    storageKeys =>
      new Promise<void>(resolve => {
        chrome.storage.local.remove(storageKeys, () => {
          resolve()
        })
      }),
    keys,
  )
}

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({ headless }, use, testInfo) => {
    const userDataDir = testInfo.outputPath('chromium-profile')
    const executablePath = resolveChromiumExecutable()
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath,
      headless,
      viewport: { width: 1280, height: 800 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
      ],
    })

    await installTikTokFixtureRoutes(context)
    await waitForExtensionWorker(context)

    await use(context)
    await context.close()
  },

  extensionId: async ({ extensionContext }, use) => {
    await use(await getExtensionId(extensionContext))
  },

  newTikTokPage: async ({ extensionContext }, use) => {
    await use(async () => extensionContext.newPage())
  },

  openExtensionPage: async ({ extensionContext, extensionId }, use) => {
    await use(async pagePath => {
      const page = await extensionContext.newPage()
      const normalizedPath = pagePath.startsWith('/')
        ? pagePath
        : `/${pagePath}`

      await page.goto(`chrome-extension://${extensionId}${normalizedPath}`)
      return page
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
