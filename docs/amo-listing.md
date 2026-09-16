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

| Asset    | Endpoint                                   | When                                         |
| -------- | ------------------------------------------ | -------------------------------------------- |
| Icon     | `PATCH /addons/addon/{guid}/` (`icon`)     | AMO serves different pixels                  |
| Previews | `POST`/`PATCH`/`DELETE .../previews/{id}/` | pixels, position, or caption differ from AMO |

Captions take a second call. The throttle section below explains why there is no
way around it.

The script checks these constraints locally, so a bad file fails before any
upload: PNG only, decodable, not animated, under 4MB. AMO also takes JPEG, but
the script does not; see
[Listing images are compared by pixels](#listing-images-are-compared-by-pixels).
The icon must also be square, which AMO enforces server-side. Previews have no
minimum size. The 1000×750 in AMO's documentation is a resize target, not a
rejection threshold, and AMO accepts the 1280×800 screenshots as they are.

### Writes are throttled hard

Every write to the add-on counts against AMO's add-on submission throttles,
documented as 3 per minute, 10 per hour, and 24 per day per user.
`AddonViewSet` and the previews endpoint use the same classes, so the listing
`PUT`, the icon `PATCH`, and every preview call share one budget. Reads are
free, and so are the listing images, which AMO serves from its media host.

A release that changes no listing asset makes three writes: the upload, the
version `PUT`, and the source `PATCH`. Each new screenshot adds two, and each
reorder, caption edit, or removal adds one.

The documented numbers understate what AMO does. On 2026-09-14, about 13
writes between 13:59 and 16:46 UTC locked every add-on write until 21:07. Three
release writes at 21:30 then drew an 8-hour lock on the third. Release 1.4.1
was once told to wait 52277 seconds. `Retry-After` has been accurate each time:
once it passed, writes went through.

The script only retries a 429 in-process when the wait is short enough.
`planThrottleRetry` in `scripts/amo-previews.mjs` caps one wait at 70 minutes.
That clears the hourly boundary, which has answered with 3454 seconds and then
completed. Total throttled time per run is capped at two hours. Past either
cap, the run defers, and the release workflow continues it in a later run once
`Retry-After` has passed; see
[AMO publishing](ci-release-flow.md#amo-publishing). The cap exists because
release 1.4.1 slept on its 52277 seconds inside a job GitHub cancels at six
hours. That run created nothing, and its only explanation was a log line six
hours above the failure.

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

### Listing images are compared by pixels

AMO re-encodes every listing image on upload. A published copy never has the
same bytes as the local file, and nothing on a preview records which file it
came from. The pixels do survive: a PNG that AMO does not resize decodes to the
same RGBA as the original. This was checked against the five 1280×800
screenshots and the 128×128 icon. `pixelKey` in `scripts/amo-previews.mjs`
hashes the decoded pixels with `pngjs`, which normalizes color type and bit
depth. `planPreviewReconcile` then matches on those keys:

- Each manifest entry claims a published preview with the same pixels,
  preferring one already at its position. The claimed preview gets a `PATCH`
  only if its position or caption differs.
- An entry with no match is uploaded, then captioned.
- A published preview that no entry claimed is deleted.

Uploads run first, so a run that stops partway leaves too many images rather
than none. The next run finishes the work: an upload whose caption never
landed gets only the caption.

This is why listing images must be PNG. AMO re-encodes a JPEG lossily, so it
could never match and would upload again on every run. Two manifest entries
with the same pixels are rejected too. After each upload, the script polls
until AMO serves the expected pixels, since AMO resizes in a background task.
If AMO still serves different pixels after two minutes, it has altered the
image, and the run fails rather than re-uploading it on every release.

The order of `amo/previews.json` is the display order. `position` comes from the
array index, so reordering the file reorders the listing.

### Repairing a live listing

`pnpm publish:amo --assets-only` reconciles the icon and the previews on the
existing add-on. It uploads no package and creates no version, so it works
between releases. AMO accepts both while a version is in review, because they
are add-on metadata, not version metadata. Add `--plan` to list the writes
first. A long throttle defers this command the same way it defers a release;
run it again after the printed time.

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
6. Run `pnpm publish:amo --plan` to see which icon and screenshot writes the
   release will add to its own three.
