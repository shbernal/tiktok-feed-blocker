# AMO listing

`amo/` holds the AMO-only listing assets, the same way `chrome-web-store/` holds
the Chrome-only ones. Copy both stores publish verbatim lives once in `store/`.

- `store/description.txt` has the long description. It is shared with the
  Chrome listing; see
  [Store listing copy is shared](#store-listing-copy-is-shared).
- `amo/listing.json` has the rest of the listing metadata (slug, summary,
  categories, tags, and support links) in the shape the AMO API accepts.
- `amo/previews.json` orders and captions the screenshots AMO publishes; see
  [Listing assets are repo-driven too](#listing-assets-are-repo-driven-too).
- `amo/data-collection.md` has the `data_collection_permissions` answer, the
  evidence for it, and paste-ready permission justifications for reviewer notes.
- `amo/source-submission.md` has the reviewer build instructions and how to
  produce the source archive.

`store/screenshots/` holds the screenshots both stores use. AMO has no
promo-tile requirement, so it needs nothing the Chrome listing lacks. Don't copy
those files into `amo/` and don't regenerate them for AMO. `amo/previews.json`
points at them where they are. It stays in `amo/` because its localized captions
and `position` order are AMO-specific, and Chrome uses the same images without
either.

## Store listing copy is shared

The long description is the only listing field both stores publish verbatim, so
it has one copy at `store/description.txt`. It is plain text with `-` bullets,
the one format both stores render well. AMO accepts a few HTML tags in this
field and the Chrome Web Store accepts none, so the shared file sticks to plain
text. Needing markup on AMO is the only good reason to split the file again.

The two stores pick up edits at different speeds. AMO is automatic: the release
job reapplies the file, as described below. Chrome needs a manual dashboard
paste, so after a copy edit AMO shows the new text at the next release while
Chrome keeps the old text until someone pastes it. Every edit to this file is a
queued AMO change, so don't park draft copy there.

## Listing metadata is applied through the API

The listing comes from this repository, not the AMO developer dashboard, so it
stays reviewable in version control. On every release, `scripts/publish-amo.mjs`
sends `amo/listing.json` with `description` filled in from
`store/description.txt`, so the next release overwrites any dashboard edit.
`name` comes from the manifest.

The add-on record does not exist until the first version upload, which is why
the metadata goes out with the submission instead of ahead of it.

Field constraints to know before editing:

- `summary` is capped at 250 characters and `name` at 50.
- `tags` and `categories` accept fixed lists only. AMO defines 42 tags and 15
  extension categories and rejects anything else. The live lists are at
  `https://addons.mozilla.org/api/v5/addons/tags/` and
  `.../addons/categories/`, and `pnpm publish:amo --dry-run` checks the file
  against both. This listing uses the `social-communication` category and the
  `content blocker` and `social media` tags. `tags` is also capped at 10.
- Don't probe a tag with `GET /api/v5/addons/search/?tag=<tag>`. The write
  endpoint rejects an unknown tag, but search returns HTTP 200 and `count: 0`
  for a name that is not a tag at all. A zero count is as likely to mean "not a
  tag" as "an unused tag".
- `categories` is a flat array in v5. The published API reference still shows it
  keyed by application. AMO accepts that shape only for backwards compatibility,
  and the Android categories behind it no longer exist.
- Localized fields are written as `{"en-US": "..."}`. They read back in a richer
  shape than they are written in, so never send a `GET` response back as a
  `PATCH` body.

## Listing assets are repo-driven too

The listing icon and the screenshots belong to the add-on, not to a version, and
they do not come from the package. The manifest `icons` key sets the icon in
`about:addons`, but the AMO page shows a placeholder until something uploads an
icon explicitly. Neither asset can go in the listing `PUT`: AMO accepts both as
multipart form-data only and refuses `icon` at add-on creation. The script
applies both after `submitVersion`, which on a first submission is also when the
add-on record first exists.

`scripts/publish-amo.mjs` applies them:

| Asset    | Endpoint                               | When                        |
| -------- | -------------------------------------- | --------------------------- |
| Icon     | `PATCH /addons/addon/{guid}/` (`icon`) | every release               |
| Previews | `POST`/`DELETE .../previews/{id}/`     | only with `--sync-previews` |

Captions take a second call. The throttle section below explains why there is no
way around it.

The script checks these constraints locally, so a bad file fails before any
upload: PNG or JPEG only, not animated, under 4MB. The icon must also be square,
which AMO enforces server-side. Previews have no minimum size. The 1000×750 in
AMO's documentation is a resize target, not a rejection threshold, and AMO
accepts the 1280×800 screenshots as they are.

### Preview writes are throttled hard

Every call on the previews endpoint uses an unsafe method, so all of them count
against AMO's add-on submission throttles: 3 per minute, 10 per hour, and 24 per
day per user. Reads are free. Syncing five screenshots costs five uploads, five
caption patches, and one delete per image already published. Replacing a
published set of five is 15 calls, half again an hour's budget, so a sync always
hits the limit partway through.

The script waits out the `Retry-After` header and retries, so a sync works but
spends most of its time idle. It prints the call count up front so a slow run
doesn't look hung. It retries only on 429, because any other failure means the
request itself is wrong. Waits can be long: the first real sync got a
`Retry-After` of 3454 seconds when it crossed the hourly boundary, and finished
correctly after sitting out the full window.

Some waits are not worth serving. The header varies by four orders of magnitude
depending on which bucket was hit, and the daily bucket answers with whatever is
left of its 24 hours. Release 1.4.1 got 52277 seconds from it and slept inside a
GitHub job that gets cancelled at six hours. That burned a whole runner, created
no version, and left the reason in a log line six hours above the failure.
`planThrottleRetry` in `scripts/amo-previews.mjs` now caps a single wait at 70
minutes, just past the hourly boundary, which is the longest wait that can still
succeed. It also caps total throttled time per run at two hours, since shorter
waits still add up past what the job can serve. Past either cap, the run fails
at once and prints when the bucket refills. Re-run it after that.

The throttle covers more than previews. `AddonViewSet` uses the same classes, so
the listing `PUT` and the icon `PATCH` share one budget, and a release already
spends about four of the ten hourly calls. **Do not run a preview sync in the
same hour as a release.** Eight calls plus four exceeds the cap, and the sync is
what stalls. This is the other reason `--assets-only` is its own command and not
a flag on the release path.

There is no way to raise the ceiling. `GranularUserRateThrottle` honors one
bypass, the `API_BYPASS_THROTTLING` permission, which comes from a group
membership Mozilla grants to its own release-engineering and QA accounts. No
token, key, or scope can get it. The throttle keys on the authenticated user,
with separate per-IP limits on top, so minting new credentials changes nothing.
The only option is making fewer calls.

Each image needs two calls. `caption` is writable when a preview is created, but
`TranslationSerializerField` only deserializes a dictionary (a bare string needs
the `l10n_flat_input_output` gate), and multipart cannot carry a dictionary. So
the localized caption has to follow as JSON.

### Why previews are opt-in

A sync replaces everything: it uploads every entry in `amo/previews.json` and
deletes what was published before. It cannot do less. AMO re-encodes images on
upload, so a local file never shares a hash with its published copy, and nothing
on a preview records which manifest entry produced it. Reusing a published
preview would mean assuming its bytes still match the file on disk, and a
swapped screenshot that never uploads is exactly the failure to avoid.

Replacing previews on every release would churn the public listing for
description-only changes, so `--sync-previews` is off by default. So that
skipped syncs stay visible, every release without the flag prints how many
previews the manifest has and how many AMO has. Equal counts are reported as
equal counts, not as a match, because the script cannot compare the images.

The order of `amo/previews.json` is the display order. `position` comes from the
array index, so reordering the file reorders the listing.

### Repairing a live listing

`pnpm publish:amo --assets-only` applies the icon, and with `--sync-previews` the
previews, to the existing add-on. It uploads no package and creates no version,
so it works between releases. AMO accepts both while a version is in review,
because they are add-on metadata, not version metadata.

## Source submission is mandatory

AMO requires the source of any add-on built with a bundler. Every version upload
must carry a source archive built with `pnpm package:source`, and a reviewer
must be able to rebuild the submitted package from it byte for byte. See
[Source code submission](../amo/source-submission.md) for the archive contents,
the reviewer instructions, and the reproducibility check.

## Before submitting a version

1. Compare `manifest.config.ts` with `amo/data-collection.md`. Every permission
   needs a current justification, and no justification should be stale.
2. Confirm the `data_collection_permissions` answer still matches the code.
3. Re-read `store/description.txt` against the release's user-visible changes.
   The same text is the Chrome listing copy.
4. Rebuild from a fresh extraction of the source archive and confirm the output
   matches the submitted package.
5. Run `pnpm publish:amo --dry-run`. It resolves the listing, prints the
   reviewer notes and previews, and checks the tags and categories against AMO.
   AMO only rejects bad metadata on the call that creates the version, which
   runs after the triggering release is already published, so the dry run is
   the last cheap place to catch it.
