# Firefox and AMO

The Firefox and Zen builds come from the same source tree as the Chrome build.
This page covers what Gecko needs that Chromium does not, and what listing on
addons.mozilla.org commits the repository to.

[Build targets](./build-targets.md) covers the two build commands and the
manifest differences. [AMO listing](./amo-listing.md) covers the listing copy
and metadata. [CI and release flow](./ci-release-flow.md) covers the release
workflow.

## Never await a `chrome.*` call

Gecko exposes `chrome.*` as callback-only and puts the promise-returning
variants on `browser.*`. In Firefox an awaited `chrome.*` call resolves to
`undefined`, and nothing reports it: no exception, no warning, and every Chrome
test still passes.

`tests/browser-api-compat.test.ts` fails the suite if any file under `src/`
awaits a `chrome.*` call. It reads the source tree and runs nothing. A runtime
test could not catch this bug, because a Chrome-shaped mock returns a promise
exactly as Chrome does.

The alternative was `webextension-polyfill`: add the dependency, move every call
site to `browser.*`, and rewrite the test mock. It lost because the codebase was
already almost all callbacks. The migration would have touched about twenty call
sites for no change in behavior, and the polyfill would have been bundled into
all three runtime contexts. Only two call sites awaited a `chrome.*` call, the
tab lookups in `src/background/worker.ts` and `src/popup/App.tsx`, and both
became callbacks.

Revisit this only if an API needs promise ergonomics. Avoiding one callback is
not a reason to add the polyfill.

## The add-on id is permanent

`browser_specific_settings.gecko.id` is `tiktok-feed-blocker@shbernal.github.io`.
From the first upload, AMO ties the listing, the review history, and every
installed user's update path to that id.

Changing it creates a different add-on. Existing users are never offered the new
one. Treat the id as immutable.

Chrome has no equivalent key. The Web Store item id identifies the extension
there, so the Chrome manifest carries nothing like it.

## The data collection declaration

The Firefox manifest declares
`data_collection_permissions: { required: ['none'] }`. Firefox shows this at
install time as a statement that the add-on collects nothing. `none` is the
strongest answer available and cannot be combined with any other value.

The answer holds only while settings stay in `chrome.storage.local`, the content
script only changes DOM and media state, and nothing leaves the device. If a
change sends anything anywhere, such as analytics, error reports, or a remote
config fetch, change this key in the same commit. `amo/data-collection.md`
records the evidence behind the answer.

This key also sets `strict_min_version` to `140.0`. Firefox only understands it
from 140. Below that, Firefox ignores it without a warning and the user never
sees the disclosure. Nothing else in the manifest needs a version that high.

## Validating before submitting

`pnpm lint:firefox` is the cheap gate, and CI runs it. `pnpm validate:firefox`
drives the built package in a real Firefox against real TikTok pages. Both are
covered in [Build targets](./build-targets.md).

`pnpm publish:amo --validate-only` runs a candidate package through AMO's own
validator without submitting it. An upload alone creates no listing and does not
claim the add-on id, so it is safe on a package that will never ship.

## Every version needs a source submission

AMO requires the source of any add-on built with a bundler, and a reviewer has
to be able to rebuild the submitted package from that archive. This applies to
every version upload, so every release has to stay reproducible from a clean
extraction.

If the build starts depending on anything outside the archive, such as an
untracked file, a local environment variable, or a network fetch at build time,
the submission breaks along with the build. `amo/source-submission.md` holds the
reviewer instructions, and `scripts/publish-amo.mjs` sends that same text as the
reviewer notes so the two cannot drift.

## Submitted is not published

AMO queues a listed version for human review. It does not go live on upload the
way a Chrome Web Store publish does.

A successful release ends with a file status of `unreviewed`, which the
developer dashboard shows as "Awaiting Review", and an add-on status of
`nominated` until AMO approves the first version. Tooling that waits for
`public` will fail every release, and tooling that reports `public` on
submission is wrong. Review can take days.

Before that first approval the add-on is not public, so the public API returns
`401` and the listing URL returns `404`. That is the normal state after a
successful first submission.
