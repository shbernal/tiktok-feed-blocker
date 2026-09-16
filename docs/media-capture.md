# Media capture

`pnpm media:capture` records the extension on real TikTok, `pnpm media:encode`
turns that recording into the README media, and `pnpm media:store` composes the
store screenshots. All three write to `media-capture/`, which git ignores.
Nothing is copied into the repository for you: look at the output, then copy
what changed.

| File                                                    | Where it goes                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `demo.gif`                                              | `.github/readme/demo.gif`                                       |
| `before-after.png`                                      | `.github/readme/before-after.png`                               |
| `popup.png`                                             | `.github/readme/popup.png`                                      |
| `demo.mp4`                                              | a YouTube upload, the only way the Chrome Web Store takes video |
| `store/tiktok-feedblocker-1..4.png`                     | `store/screenshots/`                                            |
| `home-*.png`, `explore-blocked.png`, `live-blocked.png` | source stills for the composites                                |

`store/screenshots/tiktok-feedblocker-5.png`, the open-source frame, is not
generated; it has no capture in it.

## What the capture does

`scripts/capture-media.mjs` opens logged-out TikTok in headless Chromium with
`dist/` loaded, in dark mode at 1280x800. Logged out reaches Home, Explore, and
LIVE, and keeps account UI out of public images. Before TikTok's own scripts
run, it:

- replaces `HTMLMediaElement.prototype.play`, so no video decodes or plays;
- blurs the For You feed, the Explore grid, and the LIVE player, because the
  feed shows other people's videos and these images are published;
- draws a cursor and a caption pill, since headless Chromium draws no pointer.

It then blocks and unblocks Home from the overlay and with
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>8</kbd>, and opens Explore and LIVE from
the sidebar. Frames come from the DevTools screencast and go straight to disk.
Last, it screenshots the popup at 2x, with every page blocked.

Logged-out TikTok interrupts at random: a cookie banner, an onboarding hint
with a "Got it" button, a "Saved!" toast, and a "Log in to TikTok" modal that
swallows clicks. The script closes whatever is up before every click and every
still. When a step still fails, it saves `fail-<step>.png` next to the output.

`scripts/capture-media-encode.mjs` drops frames that are almost entirely white
(LIVE paints white for a moment before its dark theme applies), then writes the
GIF with ffmpeg and gifski, the MP4 with libx264, and the before/after
composite with ImageMagick.

## Store screenshots

`scripts/capture-media-store.mjs` builds each screenshot as an HTML page and
renders it in headless Chromium at exactly 1280x800, the size the Chrome Web
Store requires. The pages keep the look of the open-source frame: black ground,
a heavy white headline, and the extension's pink as the only accent. The
headlines and crops live in that script.

Both stores publish `store/screenshots/` as is. After copying new files there:

1. Update the captions and order in `amo/previews.json`, then run `pnpm test`.
2. AMO picks up only the changed images at the next release. To apply them
   sooner, run `pnpm publish:amo --assets-only`, with `--plan` first to see the
   writes; see
   [Listing images are compared by pixels](./amo-listing.md#listing-images-are-compared-by-pixels).
3. Upload them to the Chrome Web Store in the Developer Dashboard and save the
   draft without submitting it. A submitted listing edit is a pending review,
   and the next release's upload fails against it. The release's publish call
   submits the saved draft together with the new package.

## Why it runs capped

An earlier version ran uncapped: 2x device scale, videos playing under the
blur, and every frame held in memory as PNG. On a machine with 15G of RAM, 4G
of zram, and no userspace OOM daemon, it exhausted memory system-wide. The
kernel logged two global OOM kills of Chromium, and the desktop froze while the
kernel swapped. `timeout` had killed only `node`, so its Chromium processes kept
running into the next attempt.

`scripts/capture-media.sh` runs each stage in a transient systemd user unit,
which covers node and every process it starts:

| Limit                           | Effect                                               |
| ------------------------------- | ---------------------------------------------------- |
| `MemoryMax=3G`, `MemoryHigh=2G` | an overrun is OOM-killed inside the unit, not global |
| `MemorySwapMax=0`               | the unit cannot push the machine into swap           |
| `CPUQuota=400%`, `Nice=10`      | four cores at most, at low priority                  |
| `RuntimeMaxSec`                 | 240s for capture, 180s for encode, 120s for store    |
| `KillMode=control-group`        | no browser outlives the unit                         |

The capture script adds its own guards: it will not start with less than 4G
available, it stops above 2.2G of unit memory or after 180s, it caps the
recording at 700 frames, and it closes the browser and deletes its temporary
profile on every exit path. The wrapper lists leftover processes and
`/tmp/ttfb-media-*` profiles before and after each stage.

If `systemd-run --user` is unavailable, the wrapper stops instead of running
uncapped.

A capped capture takes about 45 seconds and peaks under 1G.

## Requirements

Linux with a systemd user session and cgroup v2 memory delegation (check that
`/sys/fs/cgroup/user.slice/user-$UID.slice/user@$UID.service/cgroup.subtree_control`
lists `memory`), a Chromium binary, ffmpeg with libx264, gifski, ImageMagick 7,
and fontconfig. `pnpm media:capture` builds `dist/` first.
