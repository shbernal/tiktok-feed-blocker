# Testing

The test suite is optimized for fast, deterministic agent runs. `pnpm test`
runs Vitest once and exits with a clear pass/fail result.

## Commands

- `pnpm test` runs the full test suite once.
- `pnpm test:watch` starts Vitest in watch mode for local development.
- `pnpm test:coverage` runs tests with V8 coverage output in `coverage/` and
  fails below the thresholds in `vitest.config.ts`. This is what CI runs.
- `pnpm e2e` builds the extension and runs deterministic Playwright extension
  tests against local TikTok-shaped fixtures.
- `pnpm e2e:headed` runs the fixture-based Playwright tests in headed mode.
- `pnpm e2e:real:setup` opens a persistent Chromium profile for manual dummy
  TikTok account authentication.
- `pnpm e2e:real` builds the extension and runs opt-in smoke tests against the
  real TikTok site with the persistent profile.
- `pnpm e2e:real:open` opens TikTok in headed Chromium with the persistent
  profile and leaves the browser open for manual inspection.
- `pnpm e2e:real:open:extension` builds the extension, opens TikTok with the
  same profile, and loads the unpacked extension for manual inspection.
- `pnpm typecheck` should still be run for TypeScript validation.
- `pnpm build` should be run when changes affect extension packaging, manifest
  behavior, popup, content script, background script, shared settings, or icons.
- `pnpm lint:firefox` builds the Firefox package and runs `web-ext lint` on it.
  Run it when a change touches the manifest or packaging.
- `pnpm validate:firefox` builds the Firefox package and drives it in a real
  Firefox against real TikTok pages. Run it when a change touches the content
  script, popup, background script, shared settings, or the manifest. See
  [Build Targets](./build-targets.md).

## Test Environment

Vitest is configured in `vitest.config.ts`.

- The environment is `jsdom`, so tests can use `window`, `document`, DOM events,
  forms, and React rendering without launching Chrome.
- The default URL is `https://www.tiktok.com/`, which gives content-script tests
  a TikTok-like location.
- `src/test/setup.ts` runs before each test file. It installs a fresh Chrome API
  mock and cleans up React trees, document markup, timers, and spies after each
  test.

This setup is intentionally lighter than end-to-end extension tests. It covers
the extension logic quickly while leaving real browser checks for manual
validation or future Playwright smoke tests.

## Playwright E2E

`playwright.config.ts` runs extension E2E tests from `e2e/specs/` against local
fixtures. The fixtures serve TikTok URLs from deterministic HTML, so the content
script still sees `https://www.tiktok.com/...` without depending on the real
site or a TikTok account.

A fixture is only worth what it resembles. Two selectors passed here for a long
time while matching nothing in production, because the fixtures had been written
to fit the selectors rather than the page: one split an id and a class across two
elements that are a single node on real TikTok, and the other omitted the real
container id entirely. When adding or editing a fixture, copy the real element's
shape — id, class list, and nesting — from a live page rather than writing the
markup the selector expects. Class names carry a per-build hash on real TikTok,
so keep the hashes in the fixture too; they are what makes a bad selector fail
here instead of in the wild.

Real-site smoke tests use `playwright.real.config.ts` and `e2e/real/`. These
tests are intentionally separate from the default E2E suite because they depend
on TikTok uptime, account state, regional UI, CAPTCHA/2FA prompts, current DOM
structure, and a local authenticated browser profile.

The full real-site workflow is documented in
[Real TikTok E2E](./real-tiktok-e2e.md), including the standard no-extension
login setup and the local cookie-imported profile fallback used when TikTok
blocks headed Playwright login attempts.

To prepare the authenticated profile:

1. Create a dummy TikTok account for testing.
2. Run `pnpm e2e:real:setup`.
3. Sign in manually in the Chromium window.
4. Complete any CAPTCHA, 2FA, cookie prompts, or region prompts.
5. Visit `https://www.tiktok.com/` once and confirm the account is signed in.
6. Close the Chromium tab or window.

The profile is stored in `.e2e/tiktok-real-profile`, which is ignored by git.
Set `TIKTOK_REAL_PROFILE_DIR=/absolute/or/relative/path` to use another
profile directory. Do not commit the profile and do not put TikTok credentials
in repo files or chat.

Setup opens the profile without the extension loaded. `pnpm e2e:real` reopens
the same profile with the built extension loaded for smoke testing.

Run `pnpm e2e:real` after setup. By default it checks Home, Explore, and Live.
Set `TIKTOK_REAL_SECTIONS=home,explore` to run only a subset when a section is
unavailable for the test account or region. Set
`TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile` to use the local
cookie-imported fallback profile.

Real overlay assertions attach screenshot proof for every overlay state that
must be visible: a full viewport screenshot, a cropped overlay screenshot, and a
JSON file with the overlay text, class name, computed CSS, viewport size, and
bounding box. For overlay work, fixture E2E is not enough by itself; run the
real TikTok smoke test and check the generated `test-results/` artifacts before
calling the iteration complete.

Run `pnpm e2e:real:open` when you only want to inspect TikTok manually without
running tests. The command prints a small logged-in signal based on visible
login buttons and session cookie names, then keeps Chromium open until the
browser window is closed. Use `TIKTOK_REAL_OPEN_URL=https://www.tiktok.com/live`
to open another TikTok page.

## Chrome API Mock

`src/test/chrome.ts` provides the shared Chrome mock. Use `getChromeMock()` in a
test when you need to seed storage, inspect messages, or control tab lookup.

Supported mock surfaces:

- `chrome.storage.local.get`
- `chrome.storage.local.set`
- `chrome.storage.onChanged`
- `chrome.runtime.onMessage`
- `chrome.commands.onCommand`
- `chrome.tabs.query`
- `chrome.tabs.sendMessage`

`chrome.storage.local.seed(...)` preloads storage without firing change events.
`chrome.storage.local.set(...)` updates storage and emits a `storage.onChanged`
event, matching the behavior that popup and content-script code depends on.

Every mocked surface takes a callback, including `chrome.tabs.query`. Override a
lookup with `mockImplementation`, not `mockResolvedValue`:

```ts
chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
  callback([{ id: 9 } as chrome.tabs.Tab])
})
```

## Source Convention Guards

`tests/` holds checks about the source tree itself rather than about runtime
behavior. These run in the same Vitest command and need Node APIs, so the
directory is compiled by `tsconfig.node.json`; `tsconfig.app.json` deliberately
limits `types` to `vite/client` and `chrome` so Node globals stay out of
extension source.

`tests/browser-api-compat.test.ts` fails if any file in `src/` awaits a
`chrome.*` call. Gecko-based browsers expose `chrome.*` as callback-only and put
the promise-returning variants on `browser.*`, so an awaited `chrome.*` call
yields `undefined` there and the extension breaks silently while every Chrome
test still passes. Keep those call sites callback-based.

## Current Coverage Map

- `src/shared/settings.test.ts` covers settings defaults, normalization, legacy
  migration, and active/page-section synchronization.
- `src/shared/tiktok.test.ts` covers TikTok URL detection.
- `src/background/main.test.ts` covers the keyboard command path from command
  event to active-tab messaging.
- `src/popup/App.test.tsx` covers loading stored settings, toggling all pages,
  toggling one section, persistence, and tab notifications.
- `src/content/main.test.ts` covers DOM hiding/restoring, managed media
  mute/restore, blocked and unblocked overlay controls, storage changes, and
  runtime messages.
- `src/content/main.test.ts` also pins the property that motivated CSS-based
  hiding: a burst of inserted elements is already `display: none` before the
  deferred sweep runs.
- `tests/browser-api-compat.test.ts` covers the callback-only `chrome.*` rule
  across `src/`.

## Adding Tests

Prefer the smallest test layer that proves the behavior.

- Shared pure logic belongs in `src/shared/*.test.ts`.
- Background behavior should usually test registered Chrome listeners by
  importing the module and invoking the listener captured by the Chrome mock.
- Popup behavior should use Testing Library queries by role and accessible name.
- Content-script behavior should build small jsdom fixtures and call
  `initContentScript()` directly.

Avoid testing private implementation details when a user-visible state, storage
write, runtime message, or DOM mutation can prove the same behavior.

Assert hiding through `getComputedStyle(...).display`, not through inline
styles or bookkeeping attributes. Blocking is a stylesheet gated on a root
attribute on `<html>`, so nothing is written to the hidden elements themselves.
jsdom resolves the full cascade this relies on — `:is()`, `[class*=...]`,
`!important`, and the root-attribute gate — so unit tests can assert the same
outcome the Playwright suites do. Asserting the root attribute as well is worth
it where it distinguishes "the extension turned blocking off" from "the
extension still thinks it is on but the CSS stopped matching".

Content-script tests must run `clearAllBlocking()` alongside
`cleanupContentScript()` in teardown. The shared `document.body.innerHTML = ''`
in `src/test/setup.ts` does not reach the root attributes or the injected
stylesheet, so without it blocking state leaks into the next test. That pair is
the same one `import.meta.hot.dispose` runs, so the tests tear down the way
production does.
