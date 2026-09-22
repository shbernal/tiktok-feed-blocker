<div align="center">

<img src="public/icons/icon128.png" width="96" alt="">

# TikTok Feed Blocker

Hide TikTok's For You feed, Explore, and LIVE, and mute whatever plays behind
them. Search, messages, and profiles stay reachable.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/hjagmapcdgdffjbbedipfoocmkmhbjeh?logo=googlechrome&logoColor=white&label=Chrome%20Web%20Store&color=ff0050)](https://chromewebstore.google.com/detail/tiktok-feed-blocker/hjagmapcdgdffjbbedipfoocmkmhbjeh)
[![Firefox Add-ons](https://img.shields.io/amo/v/tiktok-feed-blocker?logo=firefoxbrowser&logoColor=white&label=Firefox%20Add-ons&color=ff0050)](https://addons.mozilla.org/firefox/addon/tiktok-feed-blocker/)
[![Chrome users](https://img.shields.io/chrome-web-store/users/hjagmapcdgdffjbbedipfoocmkmhbjeh?label=Chrome%20users)](https://chromewebstore.google.com/detail/tiktok-feed-blocker/hjagmapcdgdffjbbedipfoocmkmhbjeh)
[![Firefox users](https://img.shields.io/amo/users/tiktok-feed-blocker?label=Firefox%20users)](https://addons.mozilla.org/firefox/addon/tiktok-feed-blocker/)
[![Rating](https://img.shields.io/chrome-web-store/rating/hjagmapcdgdffjbbedipfoocmkmhbjeh?label=Rating)](https://chromewebstore.google.com/detail/tiktok-feed-blocker/hjagmapcdgdffjbbedipfoocmkmhbjeh)
[![License: MIT](https://img.shields.io/github/license/shbernal/tiktok-feed-blocker)](LICENSE)

<img src=".github/readme/demo.gif" width="820" alt="Recording of TikTok with the extension: the For You feed is blocked behind a card, switched off from the page, blocked again with one click and with Ctrl+Shift+8, then Explore and LIVE open already blocked">

</div>

## Before and after

<img src=".github/readme/before-after.png" alt="Side by side: TikTok's For You feed playing a video, and the same page with the feed gone and a Block Home switch in its place">

The feed in these captures is blurred on purpose. It is someone else's video.

## What gets blocked

| Page        | Hidden                                             | Muted                             |
| ----------- | -------------------------------------------------- | --------------------------------- |
| **For You** | The feed column, plus the comments panel if open   | Every video in the feed           |
| **Explore** | The grid on `/explore`                             | Previews inside the grid          |
| **LIVE**    | The live player on `/live`                         | All audio and video on the page   |

Each page has its own switch. Turning one off puts back exactly what was there,
including a video's previous volume and play state.

## Three ways to flip a switch

<table>
  <tr>
    <td width="320" valign="top">
      <img src=".github/readme/popup.png" width="320" alt="The extension popup: Block all pages, Block Home, Block Explore, Block Live, and Show overlay switches, all on">
    </td>
    <td valign="top">

**The popup.** One master switch, one per page, and a switch to hide the
in-page card if you would rather not see it.

**On the page.** A blocked page shows a card with its switch. An unblocked one
keeps a small **Block Home** (or Explore, or LIVE) button in the top-right
corner, so going back takes one click.

**The keyboard.** <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>8</kbd> toggles the
page you are on (<kbd>⌘</kbd> + <kbd>Shift</kbd> + <kbd>8</kbd> on macOS).
Rebind it at `chrome://extensions/shortcuts`, or from the gear menu in Firefox's
`about:addons`.

</td>
  </tr>
</table>

## Privacy

Settings live in the browser's local extension storage and never leave it. The
extension makes no network requests, asks only for `storage`, `activeTab`, and
access to `tiktok.com`, and the Firefox build declares that it collects no data.

## How it works

```mermaid
flowchart LR
  popup["Popup"] -- "saves settings" --> storage[("storage.local")]
  storage -- "onChanged" --> content
  popup -- "updateSettings" --> content
  keys["Ctrl+Shift+8"] --> worker["Background worker"]
  worker -- "toggleCurrentPageBlock" --> content
  keys -. "keydown on the page" .-> content
  content["Content script<br/>on tiktok.com"] -- "sets data-ttfb-*-blocked on html" --> css["Blocking stylesheet<br/>display: none"]
  content -- "mute, then restore" --> media["video / audio"]
```

Hiding is pure CSS: blocking a page sets one attribute on `<html>`, so anything
TikTok renders later is hidden as it mounts. A stylesheet injected at
`document_start` keeps the feed hidden until settings load, which is why a
blocked page never flashes. Muting can't be done in CSS, so a sweep re-mutes
media as TikTok swaps it in. [docs/code-overview.md](docs/code-overview.md) has
the details.

## Build from source

```sh
pnpm install
pnpm build           # Chrome, into dist/
pnpm build:firefox   # Firefox, into dist-firefox/
```

Load `dist/` from `chrome://extensions` with Developer mode on, or
`dist-firefox/manifest.json` from `about:debugging` in Firefox.

Contributor docs (tests, build targets, release flow) start at
[docs/index.md](docs/index.md).

## License

[MIT](LICENSE)
