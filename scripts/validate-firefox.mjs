// Runtime validation for the Firefox build. Firefox exposes WebDriver BiDi on
// --remote-debugging-port, and BiDi's webExtension.install accepts an unpacked
// directory, so the packaged extension can be driven in a real Firefox without
// geckodriver, Playwright, or a signed build.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawn } from 'node:child_process'

const extensionId = 'tiktok-feed-blocker@shbernal.github.io'
// Pinning the internal uuid in the profile makes the popup URL knowable before
// the extension is installed.
const extensionUuid = '2f6a1f2c-6c39-4a2e-9b4f-1d0e5a7c3b21'
const extensionOrigin = `moz-extension://${extensionUuid}`
const extensionPath = path.resolve(process.cwd(), 'dist-firefox')
const binary = process.env.FIREFOX_BINARY ?? '/usr/bin/firefox'
// Namespaced by binary so a Zen run does not overwrite the Firefox proof.
const proofDir = path.resolve(
  process.cwd(),
  'test-results',
  'firefox',
  path.basename(binary),
)
const headless = process.env.FIREFOX_VALIDATE_HEADED !== '1'
const remotePort = Number(process.env.FIREFOX_VALIDATE_PORT ?? 9333)
const viewport = { width: 1280, height: 800 }
const settleMs = 6000

const sections = [
  { key: 'home', label: 'Home', url: 'https://www.tiktok.com/' },
  { key: 'explore', label: 'Explore', url: 'https://www.tiktok.com/explore' },
  { key: 'live', label: 'Live', url: 'https://www.tiktok.com/live' },
]

const checks = []

const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const skip = (name, detail) => {
  checks.push({ name, skipped: true, detail })
  console.log(`SKIP  ${name}${detail ? ` — ${detail}` : ''}`)
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const createProfile = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttfb-firefox-'))
  const prefs = [
    `user_pref("extensions.webextensions.uuids", "{\\"${extensionId}\\":\\"${extensionUuid}\\"}");`,
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.aboutwelcome.enabled", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
    'user_pref("toolkit.telemetry.enabled", false);',
  ]
  fs.writeFileSync(path.join(dir, 'user.js'), `${prefs.join('\n')}\n`)
  return dir
}

const connect = async (url, attempts = 60) => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        const socket = new WebSocket(url)
        socket.addEventListener('open', () => resolve(socket), { once: true })
        socket.addEventListener('error', reject, { once: true })
      })
    } catch {
      await wait(500)
    }
  }

  throw new Error(`Could not reach the Firefox remote agent at ${url}`)
}

const createSession = socket => {
  let nextId = 1
  const pending = new Map()
  const logEntries = []

  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)

    if (message.type === 'event') {
      if (message.method === 'log.entryAdded') {
        logEntries.push(message.params)
      }
      return
    }

    const slot = pending.get(message.id)
    if (!slot) {
      return
    }

    pending.delete(message.id)
    if (message.type === 'error') {
      slot.reject(new Error(`${message.error}: ${message.message}`))
      return
    }

    slot.resolve(message.result)
  })

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId
      nextId += 1
      pending.set(id, { resolve, reject })
      socket.send(JSON.stringify({ id, method, params }))
    })

  return { send, logEntries }
}

const evaluate = async (session, context, expression, awaitPromise = false) => {
  const result = await session.send('script.evaluate', {
    expression,
    target: { context },
    awaitPromise,
  })

  if (result.type === 'exception') {
    throw new Error(result.exceptionDetails?.text ?? 'script.evaluate threw')
  }

  return result.result
}

const readJson = async (session, context, expression, awaitPromise = false) => {
  const result = await evaluate(session, context, expression, awaitPromise)
  return JSON.parse(result.value)
}

// Settings load asynchronously in every surface, so reads have to be retried
// rather than assumed settled after a fixed delay.
const waitForJson = async (
  session,
  context,
  expression,
  predicate,
  { awaitPromise = false, timeoutMs = 15000, intervalMs = 250 } = {},
) => {
  const deadline = Date.now() + timeoutMs
  let latest = await readJson(session, context, expression, awaitPromise)

  while (!predicate(latest) && Date.now() < deadline) {
    await wait(intervalMs)
    latest = await readJson(session, context, expression, awaitPromise)
  }

  return latest
}

// Zen refuses moz-extension:// navigations in a freshly created tab, so fall
// back to a separate window when a tab will not take the URL.
const openContext = async (session, url) => {
  for (const type of ['tab', 'window']) {
    const created = await session.send('browsingContext.create', { type })
    try {
      await session.send('browsingContext.navigate', {
        context: created.context,
        url,
        wait: 'complete',
      })
      return created.context
    } catch (error) {
      if (type === 'window') {
        throw error
      }
    }
  }

  throw new Error(`Could not open ${url}`)
}

const screenshot = async (session, context, name) => {
  const shot = await session.send('browsingContext.captureScreenshot', {
    context,
  })
  fs.mkdirSync(proofDir, { recursive: true })
  const file = path.join(proofDir, `${name}.png`)
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'))
  return file
}

const clickElement = async (session, context, selectorExpression) => {
  const node = await evaluate(session, context, selectorExpression)
  if (!node.sharedId) {
    throw new Error(`No element for ${selectorExpression}`)
  }

  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        actions: [
          {
            type: 'pointerMove',
            x: 0,
            y: 0,
            origin: { type: 'element', element: { sharedId: node.sharedId } },
          },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  })
}

const pressToggleShortcut = async (session, context) => {
  // WebDriver normalized key values for the modifiers.
  const control = String.fromCharCode(0xe009)
  const shift = String.fromCharCode(0xe008)
  await session.send('input.performActions', {
    context,
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: control },
          { type: 'keyDown', value: shift },
          { type: 'keyDown', value: '8' },
          { type: 'keyUp', value: '8' },
          { type: 'keyUp', value: shift },
          { type: 'keyUp', value: control },
        ],
      },
    ],
  })
}

// Serialized in the page, so this has to be a self-contained expression.
const pageStateExpression = `JSON.stringify((() => {
  const overlay = document.getElementById('ttfb-feed-overlay')
  const managed = Array.from(
    document.querySelectorAll('[data-ttfb-home-hidden], [data-ttfb-explore-hidden], [data-ttfb-live-hidden]'),
  )
  const media = Array.from(document.querySelectorAll('video, audio'))
  return {
    href: location.href,
    overlayState: overlay ? overlay.dataset.ttfbState ?? null : null,
    overlayText: overlay ? overlay.innerText.replace(/\\s+/g, ' ').trim() : null,
    hiddenCount: managed.length,
    allHiddenElementsDisplayNone: managed.every(el => el.style.display === 'none'),
    mediaCount: media.length,
    managedMediaCount: media.filter(el => el.hasAttribute('data-ttfb-previous-muted')).length,
    unmutedMediaCount: media.filter(el => !el.muted).length,
  }
})())`

const readStorageExpression = `new Promise(resolve => {
  chrome.storage.local.get(null, items => resolve(JSON.stringify(items)))
})`

const commandsExpression = `new Promise(resolve => {
  chrome.commands.getAll(commands => resolve(JSON.stringify(commands)))
})`

if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
  throw new Error(
    `Missing built extension at ${extensionPath}. Run pnpm build:firefox first.`,
  )
}

const profile = createProfile()
const firefox = spawn(
  binary,
  [
    '--profile',
    profile,
    '--remote-debugging-port',
    String(remotePort),
    '--no-remote',
    ...(headless ? ['--headless'] : []),
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
)

const stderr = []
firefox.stderr.on('data', chunk => stderr.push(String(chunk)))

let socket

try {
  socket = await connect(`ws://127.0.0.1:${remotePort}/session`)
  const session = createSession(socket)

  await session.send('session.new', { capabilities: {} })
  await session.send('session.subscribe', { events: ['log.entryAdded'] })

  const installed = await session.send('webExtension.install', {
    extensionData: { type: 'path', path: extensionPath },
  })
  check(
    'extension installs in Firefox',
    installed.extension === extensionId,
    installed.extension,
  )

  // Zen refuses to navigate any context to a moz-extension:// URL, so the
  // extension-page checks are skipped there and the in-page surfaces still run.
  let popupContext = null
  try {
    popupContext = await openContext(
      session,
      `${extensionOrigin}/src/popup/index.html`,
    )
  } catch (error) {
    skip('extension pages are reachable', error.message)
  }

  if (popupContext) {
    await session.send('browsingContext.setViewport', {
      context: popupContext,
      viewport,
    })

    const popupControls = await waitForJson(
      session,
      popupContext,
      `JSON.stringify(Array.from(document.querySelectorAll('input[type=checkbox]')).map(input => [input.getAttribute('aria-label'), input.checked]))`,
      controls => controls.length === 4,
    )
    check(
      'popup renders every section control',
      popupControls.length === 4,
      JSON.stringify(popupControls),
    )

    const commands = await readJson(
      session,
      popupContext,
      commandsExpression,
      true,
    )
    const toggleCommand = commands.find(
      entry => entry.name === 'toggle-current-page-block',
    )
    check(
      'browser registers the toggle command shortcut',
      toggleCommand?.shortcut === 'Ctrl+Shift+8',
      JSON.stringify(toggleCommand),
    )
  }

  const tiktokContext = await openContext(session, sections[0].url)
  await session.send('browsingContext.setViewport', {
    context: tiktokContext,
    viewport,
  })

  for (const section of sections) {
    await session.send('browsingContext.navigate', {
      context: tiktokContext,
      url: section.url,
      wait: 'complete',
    })
    await wait(settleMs)

    const state = await waitForJson(
      session,
      tiktokContext,
      pageStateExpression,
      current => current.overlayState === 'blocked' && current.hiddenCount > 0,
    )
    check(
      `${section.label}: blocked overlay renders by default`,
      state.overlayState === 'blocked' &&
        state.overlayText?.includes(`Block ${section.label}`),
      state.overlayText,
    )
    check(
      `${section.label}: page content is hidden`,
      state.hiddenCount > 0 && state.allHiddenElementsDisplayNone,
      `${state.hiddenCount} managed elements`,
    )
    check(
      `${section.label}: media is muted`,
      state.unmutedMediaCount === 0,
      `${state.managedMediaCount}/${state.mediaCount} media tracked`,
    )
    await screenshot(session, tiktokContext, `${section.key}-blocked`)
  }

  // Leave the last section on Home so the popup and shortcut checks act on it.
  await session.send('browsingContext.navigate', {
    context: tiktokContext,
    url: sections[0].url,
    wait: 'complete',
  })
  await wait(settleMs)

  if (popupContext) {
    await session.send('browsingContext.activate', { context: popupContext })
    await clickElement(
      session,
      popupContext,
      `document.querySelector('input[aria-label="Block Home"]').closest('label')`,
    )
    const afterToggle = await waitForJson(
      session,
      popupContext,
      readStorageExpression,
      stored => stored.extensionSettings?.home === false,
      { awaitPromise: true },
    )
    check(
      'popup toggle persists to storage.local',
      afterToggle.extensionSettings?.home === false,
      JSON.stringify(afterToggle),
    )
    check(
      'sections toggle independently',
      afterToggle.extensionSettings?.explore === true &&
        afterToggle.extensionSettings?.live === true &&
        afterToggle.extensionSettings?.active === true,
      JSON.stringify(afterToggle.extensionSettings),
    )

    await session.send('browsingContext.reload', {
      context: popupContext,
      wait: 'complete',
    })
    const reloaded = await waitForJson(
      session,
      popupContext,
      `JSON.stringify(Object.fromEntries(Array.from(document.querySelectorAll('input[type=checkbox]')).map(input => [input.getAttribute('aria-label'), input.checked])))`,
      controls => controls['Block Home'] === false,
    )
    check(
      'popup state survives a reload',
      reloaded['Block Home'] === false &&
        reloaded['Block Explore'] === true &&
        reloaded['Block Live'] === true,
      JSON.stringify(reloaded),
    )
    await screenshot(session, popupContext, 'popup-home-disabled')
  } else {
    // Without the popup, the blocked overlay's own switch is the unblock path.
    await session.send('browsingContext.activate', { context: tiktokContext })
    await clickElement(
      session,
      tiktokContext,
      `document.getElementById('ttfb-active-toggle').closest('label')`,
    )
  }

  const restored = await waitForJson(
    session,
    tiktokContext,
    pageStateExpression,
    state => state.overlayState === 'available' && state.hiddenCount === 0,
  )
  check(
    'disabling Home restores hidden elements',
    restored.hiddenCount === 0,
    `${restored.hiddenCount} managed elements left`,
  )
  check(
    'disabling Home restores media state',
    restored.managedMediaCount === 0,
    `${restored.managedMediaCount} media still tracked`,
  )
  check(
    'unblocked Home shows the corner block button',
    restored.overlayState === 'available' &&
      restored.overlayText === 'Block Home',
    restored.overlayText,
  )
  await screenshot(session, tiktokContext, 'home-unblocked')

  await session.send('browsingContext.activate', { context: tiktokContext })
  await pressToggleShortcut(session, tiktokContext)

  const afterShortcut = await waitForJson(
    session,
    tiktokContext,
    pageStateExpression,
    state => state.overlayState === 'blocked',
  )
  check(
    'Ctrl+Shift+8 re-blocks the current TikTok page',
    afterShortcut.overlayState === 'blocked' && afterShortcut.hiddenCount > 0,
    afterShortcut.overlayText,
  )

  if (popupContext) {
    const afterShortcutStorage = await waitForJson(
      session,
      popupContext,
      readStorageExpression,
      stored => stored.extensionSettings?.home === true,
      { awaitPromise: true },
    )
    check(
      'shortcut result is persisted',
      afterShortcutStorage.extensionSettings?.home === true,
      JSON.stringify(afterShortcutStorage.extensionSettings),
    )
  } else {
    skip('shortcut result is persisted', 'needs an extension page to read')
  }
  await screenshot(session, tiktokContext, 'home-reblocked-by-shortcut')

  const extensionErrors = session.logEntries.filter(
    entry =>
      entry.level === 'error' &&
      JSON.stringify(entry).includes(extensionUuid.slice(0, 8)),
  )
  check(
    'no extension console errors',
    extensionErrors.length === 0,
    extensionErrors.map(entry => entry.text).join(' | ') || '0 errors',
  )

  fs.mkdirSync(proofDir, { recursive: true })
  fs.writeFileSync(
    path.join(proofDir, 'validation.json'),
    `${JSON.stringify({ binary, headless, checks }, null, 2)}\n`,
  )
} catch (error) {
  check('validation run completed', false, error.message)
  console.error(stderr.join('').slice(-2000))
} finally {
  try {
    socket?.close()
  } catch {
    // The socket is already gone when Firefox exited on its own.
  }
  firefox.kill('SIGKILL')
  fs.rmSync(profile, { recursive: true, force: true })
}

const failed = checks.filter(entry => !entry.skipped && !entry.ok)
const skipped = checks.filter(entry => entry.skipped)
const ran = checks.length - skipped.length
console.log(
  `\n${ran - failed.length}/${ran} checks passed against ${binary}` +
    (skipped.length > 0 ? `, ${skipped.length} skipped` : ''),
)
console.log(`Proof written to ${path.relative(process.cwd(), proofDir)}`)

if (failed.length > 0) {
  process.exitCode = 1
}
