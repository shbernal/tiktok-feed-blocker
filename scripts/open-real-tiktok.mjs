import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { printHelpAndExit } from './help.mjs'

const defaultProfilePath = '.e2e/tiktok-real-profile'
const defaultOpenUrl = 'https://www.tiktok.com/'
const extensionPath = path.resolve(process.cwd(), 'dist')

printHelpAndExit(`
Usage: pnpm e2e:real:open [--help]

Opens a headed Chromium on a persistent profile so a real TikTok login can be
established by hand and reused by the real-TikTok e2e runs. Prints a login
signal as JSON, then stays open until the browser window is closed.

Scripts
  pnpm e2e:real:open            open the profile with no extension loaded
  pnpm e2e:real:open:extension  build first, then load dist/ into the profile
  pnpm e2e:real:setup           the Playwright-driven login capture

Environment
  TIKTOK_REAL_PROFILE_DIR         profile directory, relative to the repo root
                                  (default: ${defaultProfilePath})
  TIKTOK_REAL_OPEN_URL            URL to open (default: ${defaultOpenUrl})
  TIKTOK_REAL_OPEN_EXTENSION      set to 1 to load the built extension from
                                  dist/; this is what the :extension script
                                  sets, and it requires a build first
  PLAYWRIGHT_CHROMIUM_EXECUTABLE  Chromium binary to launch; when unset the
                                  first of /usr/bin/chromium,
                                  /usr/bin/chromium-browser,
                                  /usr/bin/google-chrome,
                                  /usr/bin/google-chrome-stable that exists

Note: pnpm e2e:real:open:extension runs a full tsc and Vite build before this
script, so pass --help to pnpm e2e:real:open to read this without building.

See docs/real-tiktok-e2e.md.
`)

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

const profilePath = path.resolve(
  process.cwd(),
  process.env.TIKTOK_REAL_PROFILE_DIR ?? defaultProfilePath,
)
const openUrl = process.env.TIKTOK_REAL_OPEN_URL ?? defaultOpenUrl
const shouldLoadExtension = process.env.TIKTOK_REAL_OPEN_EXTENSION === '1'
const args = ['--no-sandbox']

if (shouldLoadExtension) {
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error(
      `Missing built extension at ${extensionPath}. Run pnpm build first.`,
    )
  }

  args.push(
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  )
}

const context = await chromium.launchPersistentContext(profilePath, {
  executablePath: resolveChromiumExecutable(),
  headless: false,
  viewport: { width: 1280, height: 800 },
  args,
})

const page = await context.newPage()
await page.goto(openUrl, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
})
await page.waitForTimeout(5000)

const loginButtons = await page.getByRole('button', { name: /log in/i }).count()
const cookieNames = (await context.cookies('https://www.tiktok.com'))
  .map(cookie => cookie.name)
  .filter(name => /session|sid|uid|passport/i.test(name))
  .sort()

console.log(
  JSON.stringify(
    {
      url: page.url(),
      profile: profilePath,
      extensionLoaded: shouldLoadExtension,
      loggedInSignal: loginButtons === 0 && cookieNames.length > 0,
      loginButtons,
      sessionCookieNames: cookieNames,
    },
    null,
    2,
  ),
)
console.log('Chromium is open. Close the browser window to end this command.')

await new Promise(resolve => {
  context.on('close', resolve)
})
