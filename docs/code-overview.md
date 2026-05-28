# Code Overview

This extension has three runtime surfaces that communicate through shared
settings and Chrome APIs.

## Manifest

`manifest.config.ts` defines the Manifest V3 extension metadata. It reads the
extension version from `package.json`, registers the background service worker,
the TikTok content script, the popup entry point, storage permissions, active-tab
permission, TikTok host permissions, command shortcut, and icons.

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

When adding or removing a page section, update the shared settings contract,
popup controls, content-script behavior, and tests together.

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
command and the page-level listener do not double-toggle the page.

## Popup Flow

`src/popup/App.tsx` is the popup UI. It reads settings from
`chrome.storage.local`, normalizes them, persists the normalized result, and
renders compact toggles for all supported page sections.

On user changes, the popup:

1. Derives the next `ExtensionSettings`.
2. Saves the settings to `chrome.storage.local`.
3. Queries the active tab.
4. Sends an `updateSettings` message to the content script when a tab is
   available.

The popup should stay compact because it is designed around a 320px width.

## Content Script Flow

`src/content/main.ts` runs on TikTok pages. It owns DOM mutation behavior:

- detecting Home, Explore, and Live targets;
- hiding matching page containers with managed data attributes;
- muting media while preserving previous muted, volume, and paused state;
- restoring hidden elements and media state when blocking is disabled;
- rendering the in-page overlay toggle;
- reacting to storage changes and runtime messages;
- toggling the current supported page when `Ctrl+Shift+8` is pressed on a
  focused TikTok page outside editable fields;
- using a mutation observer and interval loop to reapply blocking as TikTok
  updates the page.

DOM changes should remain idempotent. Clear/restore paths need to undo every
managed hide or media mutation introduced by apply paths.

## Runtime Boundaries

The popup and content script both write settings. The shared settings helpers
are the source of truth for keeping `active` aligned with page-section toggles.
The background script does not mutate settings directly; it sends a command to
the content script, which toggles the currently detected page section.
