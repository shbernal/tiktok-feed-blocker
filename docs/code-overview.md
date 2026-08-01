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

| Module              | Responsibility                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- |
| `selectors.ts`      | TikTok selectors, Home/Explore/Live detection, page-section labels                     |
| `blockingStyles.ts` | the blocking stylesheet, the root attributes that gate it, and the ready gate          |
| `blocking.css`      | generated from `blockingStyles.ts`; the copy the manifest injects at `document_start`  |
| `media.ts`          | saving and restoring previous muted, volume, and paused state                          |
| `overlay.ts`        | overlay element ids, the injected stylesheet, render and removal                       |
| `blocking.ts`       | per-section apply and clear, and `applyCurrentSettings`                                |
| `main.ts`           | lifecycle only: storage load, listeners, keydown, observer, interval, init and cleanup |

The dependency direction is one-way — `selectors` ← `blockingStyles` ←
`blocking`, with `overlay` below `blocking`. `media.ts` sits outside that chain
and imports nothing from `src/content/`. `main.ts` owns the settings
singleton and injects it, along with the overlay toggle callbacks, into
`overlay.ts` and `blocking.ts`. Neither imports back into `main.ts`; keeping it
that way is what stops the cycle.

`initContentScript` and `cleanupContentScript` stay exported from `main.ts` —
the tests and the HMR dispose hook import them from there.

Behavior across those modules:

- detecting Home, Explore, and Live targets;
- hiding matching page containers, including the Home comments sidebar when it
  is already open from the feed;
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

### How Blocking Is Applied

Hiding is declarative. `blockingStyles.ts` injects one static stylesheet whose
every rule is gated on a root attribute, and blocking a section is a single
`toggleAttribute` on `<html>`:

```css
html[data-ttfb-home-blocked] #column-list-container {
  display: none !important;
}
```

The point is not only that a settings change is O(1) instead of O(DOM). It is
that anything TikTok renders afterwards is hidden by the CSS engine as it
mounts, so there is no window where fresh feed content is visible while waiting
for the next sweep. Restore is equally total: clear the attribute and every
element the rules covered comes back, with no per-element bookkeeping to leak.

Two things stay in JS, and they are why the observer and interval still exist:

- **Muting.** CSS cannot mute. Each section names the containers it mutes in
  `blocking.ts`, and muting is re-applied on every sweep as media mounts. Home
  and Explore mute inside the container they hide; Live mutes document-wide,
  because the player can sit outside the container the live selector matches.
- **The Live URL gate.** `applyCurrentSettings` re-evaluates `isLivePage()` each
  sweep and only sets `data-ttfb-live-blocked` when both the setting and the URL
  agree. A root attribute toggled only on settings change would survive a
  client-side navigation off `/live` and mute whatever TikTok rendered next.

The one failure mode the stylesheet cannot defend against is TikTok setting
`display` inline on a target: an inline style beats an author-origin
`!important` rule. It has not been observed, and it fails silently, so it is the
first thing to check if a section ever stops hiding.

### Where Detection And Blocking Deliberately Disagree

Live gates both on the URL. Explore gates only detection, and the split is the
point.

Opening a video from the Explore grid is a client-side navigation to
`/@user/video/<id>`, and TikTok leaves `#main-content-explore_page` mounted,
visible and full size behind the player modal, with the player itself a sibling
of that container rather than a child. So the container is present on a page
that is not the Explore grid.

`hasExploreTargets` therefore requires `/explore` in the path as well as the
container. Detection is what decides whether the overlay renders and whether the
shortcut and the browser command have a section to toggle, and all three were
wrong on the video page: it offered "Block Explore", and pressing it hid a grid
nobody could see.

`isSectionBlocked` is not gated the same way, and must not be. The grid behind
the player keeps whatever blocking it already had — revealing it there would put
a second, audible feed behind the video being watched. Explore's muting is
scoped to the container it hides, so the player, sitting outside it, is left
alone either way.

Home gets no URL gate at all. The For You feed rewrites the URL to
`/@user/video/<id>` as it scrolls, so gating Home would drop the overlay on the
feed itself.

### The Ready Gate And `document_start`

Blocking has to be in place before TikTok paints, so the manifest declares a
`css` entry alongside the content script and both run at `document_start`. The
stylesheet hides every blockable target while `<html>` lacks `data-ttfb-ready`:

```css
html:not([data-ttfb-ready]) #column-list-container {
  display: none !important;
}
```

`main.ts` sets that attribute in the storage callback, together with the section
attributes, so the page is revealed already in its correct state. Until then
everything blockable stays hidden — including for users who block nothing, who
get a blank bounded by the storage read instead of a flash of feed. For a
blocker that is the safer direction.

Three things about the gate are easy to get wrong:

- **The `css` entry is load-bearing, not a duplicate of the runtime sheet.**
  crxjs wraps the content script in an async `import()`, so `js` at
  `document_start` still executes after that loader resolves. Only the manifest
  stylesheet is guaranteed to be in place before the document parses.
- **The gate is one-way.** An unset attribute hides the page, so `clearAllBlocking`
  sets it rather than clearing it. Removing the runtime sheet does not remove the
  one the manifest injected, so a teardown that cleared the attribute would leave
  the page permanently blank.
- **Init cannot wait for `DOMContentLoaded`,** which is the state `document_start`
  runs in. The storage read, the root attributes and the listeners are
  body-independent and run immediately; only the observer, the interval and the
  overlay wait for a body via `whenBodyAvailable`. A 1500ms fallback timer, armed
  before the storage call so it survives a throwing or never-returning `get`,
  opens the gate regardless.

`src/content/blocking.css` is generated from `blockingStyles.ts` and checked
byte-for-byte by `tests/blocking-css.test.ts`, so a selector change cannot leave
the `document_start` sheet blocking the old set. After editing `selectors.ts` or
`HIDDEN_SELECTORS`, regenerate it:

```bash
UPDATE_BLOCKING_CSS=1 pnpm test blocking-css
```

It is listed in `.prettierignore` because that guard compares exact bytes.

That guard is also why `tsconfig.node.json` includes the `DOM` lib: `tests/` is
in that project and imports the stylesheet builder, which sits alongside DOM
helpers in `blockingStyles.ts`. The cleaner fix is to split the pure selector
table out of `selectors.ts`, which mixes it with DOM predicates, so `tests/` can
import data without pulling `DOM` into a Node project. It was left undone as a
larger refactor than the guard needed; do it if `tests/` ever has to import more
of `src/`.

Media changes should remain idempotent. Clear/restore paths need to undo every
media mutation the apply paths introduced, and restore looks media up by its
`data-ttfb-previous-muted` attribute rather than by container, so teardown still
works after TikTok has replaced the container the media was muted through.

Prefer ids over class selectors in `selectors.ts`. TikTok interpolates a
per-build hash between styled-component name segments and rotates its
emotion-style class names per build, so a `[class*=...]` selector may name only
one segment and a bare hashed token is never a durable hook. Real-site coverage
for the selectors each section depends on lives in
[Real TikTok E2E](./real-tiktok-e2e.md).

That preference left Live resting on a single hook. `hasLiveTargets` requires
both `isLivePage()` and `#tiktok-live-main-container-id`, and the class fallback
that used to sit beside the id was deleted because it matched nothing on real
`/live` — a selector matching zero elements today will not start matching on the
day the id disappears, and keeping it made one point of failure look like two.
No stable class token was found to replace it. So if TikTok renames that id,
Live detection fails even on a correct URL.

Dropping the id from detection and letting Live ride on `location.pathname`
alone is the obvious repair, and it is deliberately not done: it would split
detection from blocking, letting the overlay claim "Live blocked" on a page
whose container never resolved and whose media therefore was never muted. The
real-site `loadBearingSelectors` assertion is the safety net instead — it fails
loudly when a selector stops matching, which is the signal this trades on.

Teardown has to cancel deferred work too, not just detach listeners. The
observer defers the re-apply by 100ms; `cleanupContentScript` clears the pending
timer, because one firing after teardown would re-apply blocking to elements
`clearAllBlocking` had just restored. It also clears the ready-gate fallback
timer and any pending `DOMContentLoaded` handler for the same reason.

### What The Two Sweep Drivers Cost

Measured on real TikTok Home, 30s of scrolling per state, extension loaded:

| State          | Observer callbacks | Coalesced sweeps | Sweep query cost |
| -------------- | ------------------ | ---------------- | ---------------- |
| Home blocked   | 0.1/s              | 0.03/s           | p95 0.2ms        |
| Home unblocked | 1.9/s              | 1.2/s            | p95 0.3ms        |

Two things follow, and both argue for leaving the drivers alone:

- **There is no churn problem.** The coalescing flag caps observer-driven sweeps
  at one per 100ms, and the real rate never approaches that ceiling. At ~1.2
  sweeps per second costing ~0.3ms each, the sweeps are far too cheap to be
  worth optimising. A blocked feed is nearly inert, because a hidden container
  does not lazy-load.
- **The 1s interval earns its place.** The unblocked run saw 26 media elements
  go from muted to unmuted in place over 30s — no DOM insertion, so nothing the
  observer can see. That is exactly the event the interval exists to catch, and
  slowing it to 5-10s would mean that many seconds of audible audio from a
  blocked feed.

The blocked run recorded zero in-place unmutes, but that number cannot be read
as "it never happens": the probe sampled at 1Hz alongside the extension's own 1s
interval, so it cannot distinguish "never occurred" from "already re-muted
before the next sample". The unblocked figure is the trustworthy one.

Only one deferred re-apply is ever queued. A scrolling feed fires observer
callbacks continuously and every sweep is a full-document pass, so mutations
arriving while a sweep is already scheduled need no timer of their own — the
pending sweep re-reads the whole document anyway. `applyCurrentSettings`
resolves the current page section once and hands it to `renderFeedOverlay` for
the same reason: detection walks the document, and both needed the answer.

## Runtime Boundaries

The popup and content script both write settings. The shared settings helpers
are the source of truth for keeping `active` aligned with page-section toggles.
The background script does not mutate settings directly; it sends a command to
the content script, which toggles the currently detected page section.

Every `chrome.*` call in `src/` is callback-based and none may be awaited. That
is a Firefox requirement, not a style preference; see
[Firefox and AMO](./firefox-amo.md).
