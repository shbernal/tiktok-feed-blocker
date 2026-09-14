# Testing

The suite is built for fast, deterministic runs. `pnpm test` runs Vitest once
and exits with a clear pass or fail.

## Commands

- `pnpm test` runs the full suite once.
- `pnpm test:watch` starts Vitest in watch mode.
- `pnpm test:coverage` runs the tests with V8 coverage output in `coverage/` and
  fails below the thresholds in `vitest.config.ts`. CI runs this one.
- `pnpm e2e` builds the extension and runs the deterministic Playwright
  extension tests against local TikTok-shaped fixtures.
- `pnpm e2e:headed` runs the fixture Playwright tests headed.
- `pnpm e2e:real:setup` opens a persistent Chromium profile so you can sign in
  to a dummy TikTok account by hand.
- `pnpm e2e:real` builds the extension and runs the opt-in smoke tests against
  real TikTok with that profile.
- `pnpm e2e:real:open` opens TikTok in headed Chromium with the persistent
  profile and leaves the browser open for inspection.
- `pnpm e2e:real:open:extension` builds the extension, opens TikTok with the
  same profile, and loads the unpacked extension for inspection.
- `pnpm typecheck` runs the TypeScript checks. Run it too.
- `pnpm build` is needed when a change affects packaging, the manifest, the
  popup, the content script, the background script, shared settings, or icons.
- `pnpm lint:firefox` builds the Firefox package and runs `web-ext lint` on it.
  Run it when a change touches the manifest or packaging.
- `pnpm validate:firefox` builds the Firefox package and drives it in a real
  Firefox against real TikTok pages. Run it when a change touches the content
  script, popup, background script, shared settings, or the manifest. See
  [Build targets](./build-targets.md).

## Test environment

`vitest.config.ts` configures Vitest.

- The environment is `jsdom`, so tests can use `window`, `document`, DOM events,
  forms, and React rendering without launching Chrome.
- The default URL is `https://www.tiktok.com/`, which gives content-script tests
  a TikTok-like location.
- `src/test/setup.ts` runs before each test file. It installs a fresh Chrome API
  mock, and after each test it cleans up React trees, document markup, timers,
  and spies.

This setup is lighter than the end-to-end extension tests. It covers extension
logic quickly and leaves real browser checks to Playwright and manual
validation.

## Playwright E2E

`playwright.config.ts` runs the extension tests in `e2e/specs/` against local
fixtures. The fixtures answer TikTok URLs with deterministic HTML, so the
content script still sees `https://www.tiktok.com/...` with no dependency on the
real site or a TikTok account.

A fixture is only as good as its resemblance to the real page. Two selectors
passed here for a long time while matching nothing in production, because their
fixtures were written to fit the selectors. One fixture split an id and a class
across two elements that are a single node on real TikTok. The other left out
the real container id. When you add or edit a fixture, copy the real element's
id, class list, and nesting from a live page. Don't write the markup the
selector expects. Real TikTok class names carry a per-build hash, so keep the
hashes in the fixture too. They make a bad selector fail here instead of in
production.

The same goes for the URL a fixture is served from. `getFixtureHtml` routes on
`pathname`, and `/@user/video/<id>` serves the Explore grid _plus_ a player
modal, because that is what TikTok leaves in the DOM after you open a video from
Explore. Serving the bare grid there would let a page-section detection bug
pass. See
[Where detection and blocking deliberately disagree](./code-overview.md#where-detection-and-blocking-deliberately-disagree).

Real-site smoke tests use `playwright.real.config.ts` and `e2e/real/`. They stay
out of the default E2E suite because they depend on TikTok uptime, account
state, regional UI, CAPTCHA and 2FA prompts, the current DOM, and a local
authenticated browser profile.

[Real TikTok E2E](./real-tiktok-e2e.md) documents the full real-site workflow,
including the standard login setup without the extension and the
cookie-imported profile fallback for when TikTok blocks headed Playwright login.

To prepare the authenticated profile:

1. Create a dummy TikTok account for testing.
2. Run `pnpm e2e:real:setup`.
3. Sign in by hand in the Chromium window.
4. Complete any CAPTCHA, 2FA, cookie, or region prompts.
5. Visit `https://www.tiktok.com/` once and confirm the account is signed in.
6. Close the Chromium tab or window.

The profile lives in `.e2e/tiktok-real-profile`, which git ignores. Set
`TIKTOK_REAL_PROFILE_DIR=/absolute/or/relative/path` to use another profile
directory. Never commit the profile, and never put TikTok credentials in repo
files or chat.

Setup opens the profile without the extension. `pnpm e2e:real` reopens the same
profile with the built extension loaded.

Run `pnpm e2e:real` after setup. By default it checks Home, Explore, and Live.
Set `TIKTOK_REAL_SECTIONS=home,explore` to run a subset when a section is
unavailable for the test account or region. Set
`TIKTOK_REAL_PROFILE_DIR=.e2e/tiktok-injected-profile` to use the
cookie-imported fallback profile.

The real overlay assertions attach screenshot proof for every overlay state that
must be visible: a full viewport screenshot, a cropped overlay screenshot, and a
JSON file with the overlay text, class name, computed CSS, viewport size, and
bounding box. Fixture E2E alone is not enough for overlay work. Run the real
TikTok smoke test and check the `test-results/` artifacts before calling the
iteration done.

Run `pnpm e2e:real:open` to inspect TikTok by hand without running tests. It
prints a small logged-in signal based on visible login buttons and session
cookie names, then keeps Chromium open until you close the window. Use
`TIKTOK_REAL_OPEN_URL=https://www.tiktok.com/live` to open another TikTok page.

## Chrome API mock

`src/test/chrome.ts` provides the shared Chrome mock. Call `getChromeMock()` in a
test to seed storage, inspect messages, or control tab lookup.

Mocked APIs:

- `chrome.storage.local.get`
- `chrome.storage.local.set`
- `chrome.storage.onChanged`
- `chrome.runtime.onMessage`
- `chrome.commands.onCommand`
- `chrome.tabs.query`
- `chrome.tabs.sendMessage`

`chrome.storage.local.seed(...)` preloads storage without firing change events.
`chrome.storage.local.set(...)` updates storage and emits a `storage.onChanged`
event, which the popup and content script rely on.

Every mocked API takes a callback, including `chrome.tabs.query`. Override a
lookup with `mockImplementation`, not `mockResolvedValue`:

```ts
chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
  callback([{ id: 9 } as chrome.tabs.Tab])
})
```

## Source convention guards

`tests/` holds checks on the source tree itself, not on runtime behavior. They
run in the same Vitest command and need Node APIs, so `tsconfig.node.json`
compiles that directory. `tsconfig.app.json` limits `types` to `vite/client` and
`chrome` to keep Node globals out of extension source.

`tests/browser-api-compat.test.ts` fails if any file in `src/` awaits a
`chrome.*` call. Gecko-based browsers expose `chrome.*` as callback-only and put
the promise-returning variants on `browser.*`. An awaited `chrome.*` call yields
`undefined` there, and the extension breaks without an error while every Chrome
test still passes. Keep those call sites callback-based.

`tests/blocking-css.test.ts` fails if `src/content/blocking.css` has drifted
from the stylesheet `blockingStyles.ts` builds. The manifest injects that file at
`document_start`, so the selector list exists twice: in the TypeScript table and
in a static file the build does not derive. Without the guard, adding or
removing a selector would leave the `document_start` sheet blocking the old set.
Regenerate after any selector change:

```bash
UPDATE_BLOCKING_CSS=1 pnpm test blocking-css
```

The file is listed in `ignorePatterns` in `.oxfmtrc.json`, because the guard
compares exact bytes. Importing the builder is also why `tsconfig.node.json`
includes the `DOM` lib.

`tests/manifest-entry-names.test.ts` fails if two script entries in
`manifest.config.ts` share a basename, on either target. crxjs emits each entry
as a chunk named `basename(file)`, then resolves the background entry back to a
filename when it writes `service-worker-loader.js`, so colliding basenames
resolve to the same chunk. When `src/background/main.ts` and
`src/content/main.ts` were both emitted as `main.ts`, the loader imported the
content-script chunk. The background chunk was emitted but nothing referenced
it, and `chrome.commands.onCommand` never registered in a shipped build. The
build, the typecheck, and every unit test stayed green the whole time, which is
why the guard checks entry names instead of build output.

## Current coverage map

- `src/shared/settings.test.ts` covers settings defaults, normalization, legacy
  migration, and active and page-section syncing.
- `src/shared/tiktok.test.ts` covers TikTok URL detection.
- `src/background/worker.test.ts` covers the keyboard command path from command
  event to active-tab message.
- `src/popup/App.test.tsx` covers loading stored settings, toggling all pages,
  toggling one section, persistence, and tab notifications.
- `src/content/main.test.ts` covers DOM hiding and restoring, managed media mute
  and restore, blocked and unblocked overlay controls, storage changes, and
  runtime messages.
- `src/content/main.test.ts` also pins the reason hiding moved to CSS: a burst
  of inserted elements is already `display: none` before the deferred sweep
  runs.
- `src/content/main.test.ts` covers the `document_start` ready gate. Targets
  stay hidden until the storage read lands, the fallback timer opens the gate if
  it never lands, init survives a missing `<body>` and starts the observer once
  one exists, and teardown leaves the page visible instead of blank.
- `tests/browser-api-compat.test.ts` covers the callback-only `chrome.*` rule
  across `src/`.
- `tests/blocking-css.test.ts` covers the generated `document_start` stylesheet
  against the selector table.
- `tests/manifest-entry-names.test.ts` covers the distinct-basename rule for
  manifest script entries on both targets.
- `e2e/specs/background-worker.spec.ts` checks that the loaded build actually
  runs the background entry, by asserting that the mirrored `toggleShortcut` key
  exists.

## Adding tests

Use the smallest test layer that proves the behavior.

- Shared pure logic goes in `src/shared/*.test.ts`.
- Background tests should import the module and invoke the listener the Chrome
  mock captured.
- Popup tests should use Testing Library queries by role and accessible name.
- Content-script tests should build small jsdom fixtures and call
  `initContentScript()` directly.

Don't test private implementation details when a user-visible state, storage
write, runtime message, or DOM change can prove the same behavior.

Assert hiding with `getComputedStyle(...).display`, not inline styles or
bookkeeping attributes. Blocking is a stylesheet gated on a root attribute on
`<html>`, so the extension writes nothing to the hidden elements. jsdom resolves
the full cascade this depends on, including `:is()`, `[class*=...]`,
`!important`, and the root-attribute gate, so unit tests can assert the same
outcome as the Playwright suites. Asserting the root attribute as well helps
where it separates "the extension turned blocking off" from "the extension
thinks blocking is on but the CSS stopped matching".

Content-script tests must call `clearAllBlocking()` alongside
`cleanupContentScript()` in teardown. The shared `document.body.innerHTML = ''`
in `src/test/setup.ts` does not reach the root attributes or the injected
stylesheet, so without it blocking state leaks into the next test.
`import.meta.hot.dispose` runs the same pair, so tests tear down the way
production does.
