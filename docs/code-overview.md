# Code Overview

This extension has three runtime surfaces that communicate through shared
settings and Chrome APIs.

## Manifest

`manifest.config.ts` defines the Manifest V3 extension metadata. It reads the
extension version from `package.json`, registers the background entry point, the
TikTok content script, the popup entry point, storage permissions, active-tab
permission, TikTok host permissions, command shortcut, and icons.

A few manifest keys differ per build target, including the background entry:
Chrome gets a service worker and Firefox gets an event page. See
[Build Targets](./build-targets.md). Keep target-conditional keys to the minimum
the other browser actually needs.

When manifest behavior changes, run `pnpm build` and inspect the generated
`dist/manifest.json` if the exact packaged output matters.

## Shared Settings

`src/shared/settings.ts` is the storage contract between popup, content script,
and background-triggered updates.

Important exported types and helpers:

- `ExtensionSettings` is the full persisted settings shape.
- `PageSection` is the allowed page-section key union.
- `DEFAULT_SETTINGS` enables all supported sections.
- `normalizeSettings(...)` accepts unknown storage values and returns a valid
  settings object.
- `deriveSettingsFromStorage(...)` preserves migration from
  `LEGACY_ACTIVE_STORAGE_KEY`.
- `syncActiveWithPages(...)` derives `active` from the section toggles.

`overlay` is a settings field but **not** a page section. Everything that
iterates `PAGE_SECTIONS` — `syncActiveWithPages`, `isAnyPageActive`,
`isAllPagesActive`, `setAllPages` — treats its members as blockable sections,
so adding `overlay` there would make "Block all pages" toggle it. On the legacy
storage path it defaults to `true` rather than following the legacy `active`
value: that key only recorded whether blocking was on.

`normalizeSettings` returns an explicit object literal, so any new field has to
be listed there or it is silently dropped on every read.

When adding or removing a page section, update the shared settings contract,
popup controls, content-script behavior, and tests together.

## Command Shortcut

`chrome.commands` is not exposed to content scripts, so the content script
cannot read which keys the browser has actually bound. `src/shared/shortcut.ts`
closes that gap:

- the background script calls `chrome.commands.getAll(...)` on every background
  start and mirrors the resolved shortcut string into the `toggleShortcut`
  storage key;
- the content script reads that key and turns it into a keydown matcher with
  `resolveToggleShortcut(...)` and `matchesShortcut(...)`.

The key is deliberately outside `ExtensionSettings` — it is browser state, not
a user preference, so `normalizeSettings` does not carry a field for it.

An unbound command falls back to the manifest default so the in-page listener
keeps working. A binding the parser does not understand — a media key, which a
page can never observe — matches nothing instead of falling back, because
answering the default keys is the divergence this exists to remove.

## Background Command Flow

`src/background/main.ts` listens for the `toggle-current-page-block` command,
currently suggested as `Ctrl+Shift+8` (`Command+Shift+8` on macOS). When the
command fires, it queries the active tab, checks that the tab URL is on TikTok
using `src/shared/tiktok.ts`, and sends this content-script message:

```ts
{
  action: 'toggleCurrentPageBlock',
}
```

The background script intentionally ignores missing tab IDs, non-TikTok URLs,
and expected `sendMessage` failures from tabs without an injected content
script.

The content script also listens for the same focused-page shortcut directly.
That page-level listener is the more reliable path on environments where
Chrome's extension command dispatch does not fire for number-row shortcuts. It
ignores editable fields and uses a short duplicate guard so a working Chrome
command and the page-level listener do not double-toggle the page. It matches
the binding the browser actually resolved rather than a hardcoded combination;
see [Command Shortcut](#command-shortcut).

## Popup Flow

`src/popup/App.tsx` is the popup UI. It reads settings from
`chrome.storage.local`, normalizes them, persists the normalized result, and
renders compact toggles for all supported page sections plus the overlay
visibility preference.

On user changes, the popup:

1. Derives the next `ExtensionSettings`.
2. Saves the settings to `chrome.storage.local`.
3. Queries the active tab.
4. Sends an `updateSettings` message to the content script when a tab is
   available.

The popup should stay compact because it is designed around a 320px width.

## Content Script Flow

The content script runs on TikTok pages and owns all DOM mutation behavior. It
is split across `src/content/`:

| Module         | Responsibility                                                                                |
| -------------- | --------------------------------------------------------------------------------------------- |
| `selectors.ts` | TikTok selectors, hidden-element attributes, Home/Explore/Live detection, page-section labels |
| `dom.ts`       | idempotent hide and restore of matched elements                                               |
| `media.ts`     | saving and restoring previous muted, volume, and paused state                                 |
| `overlay.ts`   | overlay element ids, the injected stylesheet, render and removal                              |
| `blocking.ts`  | per-section apply and clear, and `applyCurrentSettings`                                       |
| `main.ts`      | lifecycle only: storage load, listeners, keydown, observer, interval, init and cleanup        |

The dependency direction is one-way — `selectors` ← `media` ← `dom` ←
`blocking`, with `overlay` below `blocking`. `main.ts` owns the settings
singleton and injects it, along with the overlay toggle callbacks, into
`overlay.ts` and `blocking.ts`. Neither imports back into `main.ts`; keeping it
that way is what stops the cycle.

`initContentScript` and `cleanupContentScript` stay exported from `main.ts` —
the tests and the HMR dispose hook import them from there.

Behavior across those modules:

- detecting Home, Explore, and Live targets;
- hiding matching page containers with managed data attributes, including the
  Home comments sidebar when it is already open from the feed;
- muting media while preserving previous muted, volume, and paused state;
- restoring hidden elements and media state when blocking is disabled;
- rendering the in-page overlay, with a centered toggle while a section is
  blocked and a compact top-right corner button while the current section is
  unblocked, and skipping it entirely when the `overlay` setting is off;
- reacting to storage changes and runtime messages;
- toggling the current supported page when the bound shortcut is pressed on a
  focused TikTok page outside editable fields;
- using a mutation observer and interval loop to reapply blocking as TikTok
  updates the page.

DOM changes should remain idempotent. Clear/restore paths need to undo every
managed hide or media mutation introduced by apply paths.

Teardown has to cancel deferred work too, not just detach listeners. The
observer defers each re-apply by 100ms; `cleanupContentScript` clears those
pending timers, because one firing after teardown would re-apply blocking to
elements `clearAllBlocking` had just restored.

## Runtime Boundaries

The popup and content script both write settings. The shared settings helpers
are the source of truth for keeping `active` aligned with page-section toggles.
The background script does not mutate settings directly; it sends a command to
the content script, which toggles the currently detected page section.

Every `chrome.*` call in `src/` is callback-based and none may be awaited. That
is a Firefox requirement, not a style preference; see
[Firefox and AMO](./firefox-amo.md).
