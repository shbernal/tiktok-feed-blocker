import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'

const defaultProfilePath = '.e2e/tiktok-real-profile'
const defaultOpenUrl = 'https://www.tiktok.com/'
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
