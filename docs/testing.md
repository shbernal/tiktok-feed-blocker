# Testing

The test suite is optimized for fast, deterministic agent runs. `pnpm test`
runs Vitest once and exits with a clear pass/fail result.

## Commands

- `pnpm test` runs the full test suite once.
- `pnpm test:watch` starts Vitest in watch mode for local development.
- `pnpm test:coverage` runs tests with V8 coverage output in `coverage/`.
- `pnpm typecheck` should still be run for TypeScript validation.
- `pnpm build` should be run when changes affect extension packaging, manifest
  behavior, popup, content script, background script, shared settings, or icons.

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

## Current Coverage Map

- `src/shared/settings.test.ts` covers settings defaults, normalization, legacy
  migration, and active/page-section synchronization.
- `src/shared/tiktok.test.ts` covers TikTok URL detection.
- `src/background/main.test.ts` covers the keyboard command path from command
  event to active-tab messaging.
- `src/popup/App.test.tsx` covers loading stored settings, toggling all pages,
  toggling one section, persistence, and tab notifications.
- `src/content/main.test.ts` covers DOM hiding/restoring, managed media
  mute/restore, overlay toggles, storage changes, and runtime messages.

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
