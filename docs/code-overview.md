# Code overview

The extension has three runtime parts: the popup, the background script, and the
content script. They share settings through `chrome.storage.local` and talk
through Chrome APIs.

## Manifest

`manifest.config.ts` defines the Manifest V3 metadata. It reads the version from
`package.json` and registers the background entry, the TikTok content script,
the popup, the storage and active-tab permissions, the TikTok host permission,
the command shortcut, and the icons.

A few manifest keys differ per build target, including the background entry:
Chrome gets a service worker and Firefox gets an event page. See
[Build targets](./build-targets.md). Keep target-conditional keys to what the
other browser actually needs.

When manifest behavior changes, run `pnpm build` and inspect
`dist/manifest.json` if the exact packaged output matters.

## Shared settings

`src/shared/settings.ts` is the storage contract between the popup, the content
script, and updates the background command triggers.

Main exports:

- `ExtensionSettings` is the full persisted settings shape.
- `PageSection` is the union of page-section keys.
- `DEFAULT_SETTINGS` enables every supported section.
- `normalizeSettings(...)` takes any storage value and returns a valid settings
  object.
- `deriveSettingsFromStorage(...)` keeps the migration from
  `LEGACY_ACTIVE_STORAGE_KEY`.
- `syncActiveWithPages(...)` derives `active` from the section toggles.

`overlay` is a settings field but **not** a page section. `syncActiveWithPages`,
`isAnyPageActive`, `isAllPagesActive`, and `setAllPages` all iterate
`PAGE_SECTIONS` and treat each member as blockable. Adding `overlay` there would
make "Block all pages" toggle it. On the legacy storage path `overlay` defaults
to `true` instead of copying the legacy `active` value, because that key only
recorded whether blocking was on.

`normalizeSettings` returns an explicit object literal. A new field has to be
listed there, or every read drops it without an error.

When adding or removing a page section, update the shared settings contract, the
popup controls, the content-script behavior, and the tests together.

## Command shortcut

Content scripts have no access to `chrome.commands`, so the content script
cannot read which keys the browser actually bound. `src/shared/shortcut.ts`
bridges that:

- on every background start, the background script calls
  `chrome.commands.getAll(...)` and mirrors the resolved shortcut string into
  the `toggleShortcut` storage key;
- the content script reads that key and turns it into a keydown matcher with
  `resolveToggleShortcut(...)` and `matchesShortcut(...)`.

The key lives outside `ExtensionSettings` because it is browser state, not a
user preference. `normalizeSettings` has no field for it.

An unbound command falls back to the manifest default, so the in-page listener
keeps working. A binding the parser does not understand, such as a media key
that a page can never observe, matches nothing and does not fall back.
Answering to the default keys while the browser has bound different ones is the
mismatch this code exists to prevent.

## Background command flow

`src/background/worker.ts` listens for the `toggle-current-page-block` command,
currently suggested as `Ctrl+Shift+8` (`Command+Shift+8` on macOS). When the
command fires, it queries the active tab, checks the tab URL is on TikTok with
`src/shared/tiktok.ts`, and sends this message to the content script:

```ts
{
  action: 'toggleCurrentPageBlock',
}
```

The background script ignores missing tab ids, non-TikTok URLs, and the
expected `sendMessage` failures from tabs with no content script.

The content script also listens for the same shortcut on the focused page. That
listener is the more reliable path where Chrome's command dispatch does not fire
for number-row shortcuts. It ignores editable fields, and a short duplicate
guard stops a working Chrome command and the page listener from toggling twice.
It matches the binding the browser resolved, not a hardcoded combination; see
[Command shortcut](#command-shortcut).

## Popup flow

`src/popup/App.tsx` is the popup UI. It reads settings from
`chrome.storage.local`, normalizes them, saves the normalized result, and renders
compact toggles for every page section plus the overlay visibility preference.

When the user changes a toggle, the popup:

1. Derives the next `ExtensionSettings`.
2. Saves them to `chrome.storage.local`.
3. Queries the active tab.
4. Sends an `updateSettings` message to the content script when there is a tab.

The popup is designed around a 320px width, so keep it compact.

## Content script flow

The content script runs on TikTok pages and owns every DOM change. It is split
across `src/content/`:

| Module              | Responsibility                                                                         |
| ------------------- | -------------------------------------------------------------------------------------- |
| `selectors.ts`      | TikTok selectors, Home/Explore/Live detection, page-section labels                     |
| `blockingStyles.ts` | the blocking stylesheet, the root attributes that gate it, and the ready gate          |
| `blocking.css`      | generated from `blockingStyles.ts`; the copy the manifest injects at `document_start`  |
| `media.ts`          | saving and restoring previous muted, volume, and paused state                          |
| `overlay.ts`        | overlay element ids, the injected stylesheet, render and removal                       |
| `blocking.ts`       | per-section apply and clear, and `applyCurrentSettings`                                |
| `main.ts`           | lifecycle only: storage load, listeners, keydown, observer, interval, init and cleanup |

Imports flow one way: `selectors` ← `blockingStyles` ← `blocking`, with
`overlay` below `blocking`. `media.ts` sits outside that chain and imports
nothing from `src/content/`. `main.ts` owns the settings singleton and passes
it, along with the overlay toggle callbacks, into `overlay.ts` and
`blocking.ts`. Neither of those imports `main.ts`, and keeping it that way
prevents an import cycle.

`initContentScript` and `cleanupContentScript` stay exported from `main.ts`,
because the tests and the HMR dispose hook import them from there.

What those modules do together:

- detect Home, Explore, and Live targets;
- hide matching page containers, including the Home comments sidebar when it is
  already open from the feed;
- mute media while saving the previous muted, volume, and paused state;
- restore hidden elements and media state when blocking is turned off;
- render the in-page overlay: a centered toggle while a section is blocked, a
  compact top-right button while the current section is unblocked, and nothing
  at all when the `overlay` setting is off;
- react to storage changes and runtime messages;
- toggle the current page when the bound shortcut is pressed on a focused TikTok
  page outside editable fields;
- reapply blocking from a mutation observer and an interval as TikTok updates
  the page.

### How blocking is applied

Hiding is declarative. `blockingStyles.ts` injects one static stylesheet, every
rule gated on a root attribute, and blocking a section is a single
`toggleAttribute` on `<html>`:

```css
html[data-ttfb-home-blocked] #column-list-container {
  display: none !important;
}
```

A settings change costs O(1) instead of O(DOM), but the bigger win is timing.
The CSS engine hides anything TikTok renders later as it mounts, so fresh feed
content is never visible while waiting for the next sweep. Restoring is just as
complete: clear the attribute and every element the rules covered comes back,
with no per-element bookkeeping to leak.

Two jobs stay in JS, and they are why the observer and interval still exist:

- **Muting.** CSS cannot mute. Each section names the containers it mutes in
  `blocking.ts`, and every sweep re-mutes as media mounts. Home and Explore mute
  inside the container they hide. Live mutes across the whole document, because
  the player can sit outside the container the Live selector matches.
- **The Live URL gate.** `applyCurrentSettings` re-checks `isLivePage()` on each
  sweep and sets `data-ttfb-live-blocked` only when both the setting and the URL
  agree. An attribute toggled only on settings changes would survive a
  client-side navigation away from `/live` and mute whatever TikTok rendered
  next.

The stylesheet cannot defend against one failure: TikTok setting `display`
inline on a target, since an inline style beats an author `!important` rule.
Nobody has seen it happen, and it would fail without an error, so check it
first if a section ever stops hiding.

### Where detection and blocking deliberately disagree

Live gates both detection and blocking on the URL. Explore gates only detection,
on purpose.

Opening a video from the Explore grid is a client-side navigation to
`/@user/video/<id>`. TikTok leaves `#main-content-explore_page` mounted, visible,
and full size behind the player modal, and the player is a sibling of that
container, not a child. So the container is present on a page that is not the
Explore grid.

`hasExploreTargets` therefore requires `/explore` in the path as well as the
container. Detection decides whether the overlay renders and whether the
shortcut and the browser command have a section to toggle. Before the path
check, all three were wrong on the video page: the overlay offered "Block
Explore", and pressing it hid a grid nobody could see.

`isSectionBlocked` does not gate on the path, and must not. The grid behind the
player keeps whatever blocking it had. Revealing it there would put a second,
audible feed behind the video being watched. Explore mutes only inside the
container it hides, so the player, which sits outside it, is left alone either
way.

Home has no URL gate at all. The For You feed rewrites the URL to
`/@user/video/<id>` as it scrolls, so a Home gate would drop the overlay on the
feed itself.

### The ready gate and `document_start`

Blocking has to be in place before TikTok paints, so the manifest declares a
`css` entry next to the content script and both run at `document_start`. The
stylesheet hides every blockable target while `<html>` lacks `data-ttfb-ready`:

```css
html:not([data-ttfb-ready]) #column-list-container {
  display: none !important;
}
```

`main.ts` sets that attribute in the storage callback, together with the section
attributes, so the page appears already in its correct state. Until then
everything blockable stays hidden, even for users who block nothing. They see a
blank area for as long as the storage read takes instead of a flash of feed. For
a blocker that is the safer failure.

Three details of the gate are easy to get wrong:

- **The `css` entry is required and does not duplicate the runtime sheet.**
  crxjs wraps the content script in an async `import()`, so `js` at
  `document_start` still runs after that loader resolves. Only the manifest
  stylesheet is guaranteed to be in place before the document parses.
- **The gate only opens.** An unset attribute hides the page, so
  `clearAllBlocking` sets it instead of clearing it. Removing the runtime sheet
  leaves the manifest-injected one in place, so a teardown that cleared the
  attribute would leave the page blank for good.
- **Init cannot wait for `DOMContentLoaded`,** because `document_start` runs
  before it. The storage read, the root attributes, and the listeners do not
  need a body and run immediately. Only the observer, the interval, and the
  overlay wait for a body through `whenBodyAvailable`. A 1500ms fallback timer
  opens the gate regardless. It is armed before the storage call, so it still
  fires if `get` throws or never returns.

`src/content/blocking.css` is generated from `blockingStyles.ts`, and
`tests/blocking-css.test.ts` checks it byte for byte, so a selector change
cannot leave the `document_start` sheet blocking the old set. After editing
`selectors.ts` or `HIDDEN_SELECTORS`, regenerate it:

```bash
UPDATE_BLOCKING_CSS=1 pnpm test blocking-css
```

It is in `ignorePatterns` in `.oxfmtrc.json` because that guard compares exact
bytes.

That guard is also why `tsconfig.node.json` includes the `DOM` lib. `tests/`
belongs to that project and imports the stylesheet builder, which sits next to
DOM helpers in `blockingStyles.ts`. The cleaner fix is to split the pure
selector table out of `selectors.ts`, which mixes it with DOM predicates, so
`tests/` can import data without pulling `DOM` into a Node project. It was
skipped as a bigger refactor than the guard needed. Do it if `tests/` ever needs
more of `src/`.

Keep media changes idempotent. Clear and restore paths must undo every media
change the apply paths made. Restore finds media by its
`data-ttfb-previous-muted` attribute, not by container, so teardown still works
after TikTok replaces the container the media was muted through.

Prefer ids over class selectors in `selectors.ts`. TikTok puts a per-build hash
between styled-component name segments and rotates its emotion-style class
names every build. A `[class*=...]` selector may name only one segment, and a
bare hashed token will not last. [Real TikTok E2E](./real-tiktok-e2e.md) covers
the real-site checks for the selectors each section depends on.

Preferring ids left Live depending on a single hook. `hasLiveTargets` requires
both `isLivePage()` and `#tiktok-live-main-container-id`. The class fallback that
used to sit beside the id was deleted because it matched nothing on real
`/live`. A selector that matches zero elements today will not start matching
the day the id disappears, and keeping it made one point of failure look like
two. No stable class token turned up to replace it. So if TikTok renames that
id, Live detection fails even on a correct URL.

The obvious repair is to drop the id from detection and rely on
`location.pathname` alone. It is not done on purpose. It would split detection
from blocking, and the overlay could claim "Live blocked" on a page whose
container never resolved and whose media was never muted. The real-site
`loadBearingSelectors` assertion is the safety net instead: it fails loudly when
a selector stops matching.

Teardown has to cancel deferred work, not only detach listeners. The observer
defers each re-apply by 100ms, and `cleanupContentScript` clears that pending
timer, because a re-apply after teardown would block elements
`clearAllBlocking` had just restored. For the same reason it clears the
ready-gate fallback timer and any pending `DOMContentLoaded` handler.

### What the two sweep drivers cost

Measured on real TikTok Home, 30s of scrolling per state, extension loaded:

| State          | Observer callbacks | Coalesced sweeps | Sweep query cost |
| -------------- | ------------------ | ---------------- | ---------------- |
| Home blocked   | 0.1/s              | 0.03/s           | p95 0.2ms        |
| Home unblocked | 1.9/s              | 1.2/s            | p95 0.3ms        |

Both findings argue for leaving the drivers alone:

- **Sweeps are cheap.** The coalescing flag caps observer-driven sweeps at one
  per 100ms, and the real rate never gets near that. At about 1.2 sweeps per
  second costing about 0.3ms each, there is nothing worth optimizing. A blocked
  feed barely changes, because a hidden container does not lazy-load.
- **The 1s interval is needed.** In the unblocked run, 26 media elements went
  from muted to unmuted in place over 30s. No DOM insertion happened, so the
  observer saw nothing. The interval exists to catch exactly that, and slowing
  it to 5 to 10s would mean that many seconds of audio from a blocked feed.

The blocked run recorded zero in-place unmutes, but that does not prove it never
happens. The probe sampled at 1Hz alongside the extension's own 1s interval, so
it cannot tell "never happened" from "already re-muted before the next sample".
Trust the unblocked figure.

Only one deferred re-apply is ever queued. A scrolling feed fires observer
callbacks nonstop, and every sweep is a full-document pass, so mutations that
arrive while a sweep is already scheduled need no timer of their own. The
pending sweep re-reads the whole document anyway. For the same reason,
`applyCurrentSettings` resolves the current page section once and passes it to
`renderFeedOverlay`: detection walks the document, and both need the answer.

## Runtime boundaries

The popup and the content script both write settings. The shared settings
helpers are the source of truth for keeping `active` in line with the
page-section toggles. The background script never changes settings. It sends a
command to the content script, which toggles the page section it detected.

Every `chrome.*` call in `src/` uses a callback, and none may be awaited. Firefox
requires this; see [Firefox and AMO](./firefox-amo.md).
