# Repository Instructions

## Hard Rule

Do not modify `README.md` unless told explicitly to do so.

## Project Shape

This is a Manifest V3 Chrome extension built with Vite, React, TypeScript, and
`@crxjs/vite-plugin`.

- `manifest.config.ts` defines the extension manifest and reads the version from
  `package.json`.
- `src/background/main.ts` handles the browser command that toggles blocking for
  the active TikTok tab.
- `src/content/main.ts` runs on TikTok pages, hides page sections, mutes media,
  renders the in-page overlay, and listens for storage/runtime changes.
- `src/popup/App.tsx` is the extension popup UI for global and per-section
  toggles.
- `src/shared/settings.ts` owns storage keys, defaults, normalization, and legacy
  settings migration.
- `public/icons/` contains extension icons copied into builds.
- `chrome-web-store/` contains store-listing screenshots.
- `dist/` and `release/` are generated/packaged outputs and are ignored by git.

## Commands

Use `pnpm`.

- `pnpm build` - run TypeScript project build and create the extension build in
  `dist/`.
- `pnpm typecheck` - run TypeScript checks only.
- `pnpm format` - check Prettier formatting.
- `pnpm dev` - start the Vite dev server for extension development.
- `pnpm preview` - preview the Vite build.

There is no dedicated test script at the moment. For code changes, run at least
`pnpm typecheck`; run `pnpm build` when touching manifest, content script,
background script, popup, shared settings, icons, or packaging behavior.

## Coding Guidelines

- Keep changes narrow and follow the existing TypeScript style: strict types,
  no semicolons, single quotes, 2-space indentation, and 80-column Prettier
  wrapping.
- Prefer shared helpers in `src/shared/settings.ts` for storage shape changes.
  Preserve migration support for `LEGACY_ACTIVE_STORAGE_KEY` unless the user
  explicitly asks to remove it.
- Treat `ExtensionSettings` and `PageSection` as the contract between popup,
  content script, and storage. Update all three surfaces together when adding or
  removing a page section.
- Keep content-script DOM changes idempotent. Use stable constants for element
  IDs, data attributes, and selectors, and make sure clear/restore paths undo
  any managed hiding or media mutation.
- TikTok DOM selectors are brittle. When changing selectors in
  `src/content/main.ts`, keep fallback behavior conservative and avoid matching
  broad elements that could hide unrelated TikTok UI.
- Preserve user media state when muting. If adding new media-blocking behavior,
  store previous muted/volume/paused state before mutating and restore it when
  blocking is disabled.
- For Chrome APIs, prefer the existing callback-compatible patterns unless a
  surrounding file already uses promises safely for that API.
- Keep popup UI compact. The popup is fixed around a 320px width; avoid adding
  verbose explanatory text inside the extension UI.

## Generated And Release Files

- Do not hand-edit `dist/`; update source/config and rebuild instead.
- Do not create or replace files in `release/` unless doing explicit release
  packaging.
- Do not change `chrome-web-store/` assets unless the task is about listing
  screenshots or store metadata.
- Do not bump `package.json` version unless explicitly requested.

## Manual Validation Notes

After a build, load `dist/` as an unpacked extension in Chrome or a Chromium
browser when behavior needs runtime validation. Check at least:

- popup toggles persist via `chrome.storage.local`;
- Home, Explore, and Live settings can be toggled independently;
- the command in `manifest.config.ts` toggles the currently detected TikTok page;
- disabled sections restore hidden elements and media state.
