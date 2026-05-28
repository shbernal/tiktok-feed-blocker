import { chromium, test } from '@playwright/test'
import {
  closeExtensionContext,
  resolveChromiumExecutable,
} from '../fixtures/extensionRuntime'
import { resolveRealTikTokProfilePath } from '../fixtures/realProfile'

test('authenticate persistent TikTok profile @setup', async () => {
  test.setTimeout(0)

  const realTikTokProfilePath = resolveRealTikTokProfilePath()
  const context = await chromium.launchPersistentContext(
    realTikTokProfilePath,
    {
      executablePath: resolveChromiumExecutable(),
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: ['--no-sandbox'],
    },
  )
  const page = await context.newPage()
  const closePromise = Promise.race([
    page.waitForEvent('close').catch(() => undefined),
    context.waitForEvent('close').catch(() => undefined),
  ])

  await page.goto('https://www.tiktok.com/login', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })

  console.log(`
TikTok real E2E profile setup

Profile: ${realTikTokProfilePath}

1. Sign in with the dummy TikTok account in the Chromium window.
2. Complete any CAPTCHA, 2FA, cookie prompts, or region prompts manually.
3. Visit https://www.tiktok.com/ once and confirm the account is signed in.
4. Close the Chromium tab or window to finish setup.

The extension is not loaded during setup. Real smoke tests load the extension
later with the same profile.
`)

  await page.bringToFront()
  await closePromise
  await closeExtensionContext(context)
})
