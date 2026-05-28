import fs from 'node:fs'
import path from 'node:path'
import {
  chromium,
  type BrowserContext,
  type Page,
  type Worker,
} from '@playwright/test'

type LaunchExtensionContextOptions = {
  userDataDir: string
  headless: boolean
}

export const extensionPath = path.resolve(process.cwd(), 'dist')

export const resolveChromiumExecutable = () => {
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

export const launchExtensionContext = async ({
  userDataDir,
  headless,
}: LaunchExtensionContextOptions) => {
  const executablePath = resolveChromiumExecutable()

  return chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
  })
}

export const closeExtensionContext = async (context: BrowserContext) => {
  try {
    await context.close()
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Target page, context or browser has been closed')
    ) {
      return
    }

    throw error
  }
}

export const isExtensionWorker = (worker: Worker) => {
  return worker.url().startsWith('chrome-extension://')
}

export const waitForExtensionWorker = async (context: BrowserContext) => {
  const existingWorker = context.serviceWorkers().find(isExtensionWorker)
  if (existingWorker) {
    return existingWorker
  }

  return context.waitForEvent('serviceworker', {
    predicate: isExtensionWorker,
  })
}

export const getExtensionId = async (context: BrowserContext) => {
  const worker = await waitForExtensionWorker(context)
  return new URL(worker.url()).hostname
}

export const getStorageValue = async <Value>(
  context: BrowserContext,
  key: string,
) => {
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

export const setStorageValue = async <Value>(
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

export const removeStorageValues = async (
  context: BrowserContext,
  keys: string[],
) => {
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

export const openExtensionPage = async (
  context: BrowserContext,
  extensionId: string,
  pagePath: string,
) => {
  const page: Page = await context.newPage()
  const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`

  await page.goto(`chrome-extension://${extensionId}${normalizedPath}`)
  return page
}
