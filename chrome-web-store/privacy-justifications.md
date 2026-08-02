# Privacy And Permission Justifications

Use this copy for the Chrome Web Store Developer Dashboard privacy and
permission form. Keep each answer aligned with `manifest.config.ts` and current
runtime behavior before submitting a build.

The body text under each heading is the answer itself and goes into a plain-text
form field verbatim, so it stays free of Markdown — no backticks, emphasis, or
lists. Headings are labels, not answers, and may keep their markup.

Last reviewed against `manifest.config.ts`.

## Single Purpose Description

TikTok Feed Blocker helps users reduce distraction on TikTok by blocking only
supported high-distraction pages: Home, Explore, and Live. Users can control
each page separately from the popup, an in-page control, or the shortcut. When a
supported page is blocked, the extension hides the relevant page surface and
mutes media, while leaving other TikTok pages available. Settings are stored
locally in Chrome extension storage.

## Permission Justifications

### `activeTab`

activeTab is used only after a user action from the popup or keyboard command to
identify and message the currently active TikTok tab. This lets the extension
apply the user's chosen blocking state to the page they are viewing without
broad tab history access or background scanning of unrelated tabs.

### `storage`

storage saves the user's local extension settings, including whether blocking is
enabled and whether Home, Explore, and Live are blocked. The extension stores
this configuration in chrome.storage.local; it does not use this permission to
collect or transmit browsing data.

### Host Permission: `*://*.tiktok.com/*`

Access to TikTok pages is required because the content script must run there to
detect Home, Explore, and Live; hide or restore selected page containers; show
the in-page control; and mute or restore media. It does not run on non-TikTok
sites.
