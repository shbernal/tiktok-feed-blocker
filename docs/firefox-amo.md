# Firefox and AMO

The extension ships to Firefox and Zen from the same source tree as the Chrome
build. This documents what Gecko needs that Chromium does not, and what
distributing on addons.mozilla.org obliges the repository to do.

[Build Targets](./build-targets.md) covers the two build commands and the
manifest differences. [AMO Listing](./amo-listing.md) covers the listing copy
and metadata. [CI and Release Flow](./ci-release-flow.md) covers the release
workflow.

## Never Await A `chrome.*` Call

Gecko exposes `chrome.*` as callback-only and puts the promise-returning
variants on `browser.*`. An awaited `chrome.*` call therefore resolves to
`undefined` in Firefox instead of returning a value, and the failure is silent:
no exception, no warning, and every Chrome test still passes.

That is why `tests/browser-api-compat.test.ts` fails the suite if any file under
`src/` awaits a `chrome.*` call. It is a source-tree guard, not a runtime test —
the bug it catches cannot be caught by mocking, because a Chrome-shaped mock
returns a promise exactly as Chrome does.

The alternative was `webextension-polyfill`: add the dependency, migrate every
call site to `browser.*`, and rewrite the test mock. It was rejected because the
codebase was already almost entirely callback-style, so the migration touched
roughly twenty call sites for no behavioral gain, and the polyfill would have
had to be bundled into all three surfaces. Only two call sites actually awaited
a `chrome.*` call — the tab lookups in `src/background/worker.ts` and
`src/popup/App.tsx` — and both became callbacks.

Revisit this only if an API genuinely needs promise ergonomics. Adding the
polyfill to avoid one callback is not that.

## The Add-On Id Is Permanent

`browser_specific_settings.gecko.id` is `tiktok-feed-blocker@shbernal.github.io`.
AMO binds the listing, the review history, and every installed user's update
path to that id from the first upload onward.

Changing it does not rename the add-on. It creates a different add-on, and
existing users are never offered the new one. Treat the id as immutable.

Chrome has no equivalent key. Its identity comes from the Web Store item id,
which is why the Chrome manifest carries nothing of the sort.

## The Data Collection Declaration

The Firefox manifest declares `data_collection_permissions: { required: ['none']
}`, which Firefox shows at install time as a statement that the add-on collects
nothing. `none` is the strongest available answer and cannot be combined with
any other value.

It is correct only while settings stay in `chrome.storage.local`, the content
script only mutates DOM and media state, and nothing leaves the device. If a
future change transmits anything anywhere — analytics, error reporting, a remote
config fetch — this key must change in the same commit, and
`amo/data-collection.md` records the evidence the answer rests on.

The key is also what sets `strict_min_version` to `140.0`. Firefox only
understands it from 140; below that floor it is ignored silently and the
disclosure never reaches the user. Nothing else in the manifest needs a version
that high.

## Validating Before Submitting

`pnpm lint:firefox` is the cheap gate and runs in CI. `pnpm validate:firefox`
drives the built package in a real Firefox against real TikTok pages. Both are
documented in [Build Targets](./build-targets.md).

`pnpm publish:amo --validate-only` puts a candidate package through AMO's own
validator without submitting it. An upload on its own creates no listing and
does not claim the add-on id, so it is safe to run against a package that will
never be released.

## Source Submission Is An Obligation, Not A Step

AMO requires the source of any add-on built by a bundler, and a reviewer must be
able to rebuild the submitted package from that archive. This is not a one-time
hurdle cleared at first submission: every version upload carries a source
archive, and every release must remain reproducible from a clean extraction.

A change that makes the build depend on something outside the archive — an
untracked file, a local environment variable, a network fetch at build time —
breaks the submission rather than just the build. `amo/source-submission.md`
holds the reviewer instructions, and `scripts/publish-amo.mjs` sends that same
text as the reviewer notes so the two cannot drift.

## Submitted Is Not Published

A listed AMO version is queued for human review. It does not go live on upload
the way a Chrome Web Store publish does.

The successful outcome of a release is a file status of `unreviewed` — shown as
"Awaiting Review" in the developer dashboard — and an add-on status of
`nominated` until the first version is approved. Any tooling that waits for
`public` will fail every release, and any tooling that reports `public` on
submission is lying about the outcome. Review can take days.

Until that first approval the add-on is not public, so the public API returns
`401` for it and the listing URL returns `404`. That is the expected state after
a successful first submission, not a failed one.
