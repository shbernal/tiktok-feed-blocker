# AMO Listing

AMO-specific listing assets live in `amo/`, mirroring how `chrome-web-store/`
holds the Chrome-specific ones. Copy that both stores publish verbatim lives in
`store/` instead of being duplicated into each.

- `store/description.txt` contains the long description. It is shared with the
  Chrome listing rather than living in `amo/`; see [Store Listing
  Copy](#store-listing-copy-is-shared) below.
- `amo/listing.json` contains the rest of the listing metadata — slug, summary,
  categories, tags, and support links — in the shape the AMO API accepts.
- `amo/previews.json` orders and captions the screenshots AMO publishes; see
  [Listing Assets](#listing-assets-are-repo-driven-too) below.
- `amo/data-collection.md` contains the `data_collection_permissions` answer,
  the evidence it rests on, and paste-ready permission justifications for
  reviewer notes.
- `amo/source-submission.md` contains the reviewer build instructions and how to
  produce the source archive.

Screenshots are shared with the Chrome listing: `store/screenshots/` holds the
three images used on both stores. AMO has no promo-tile requirement, so it needs
nothing the Chrome listing does not already have. Do not copy those files into
`amo/` and do not regenerate them for AMO. `amo/previews.json` references them
in place, and stays in `amo/` because it is AMO-shaped metadata — localized
captions and `position` semantics — about images Chrome consumes without either.

## Store Listing Copy Is Shared

The long description is the only listing field both stores publish verbatim, so
there is one copy at `store/description.txt` and no per-store duplicate. It is
plain text with `-` bullets, which is the format both stores render acceptably:
AMO accepts a limited set of HTML tags in this field and the Chrome Web Store
does not, so the shared file stays at that lowest common denominator. Wanting
markup on the AMO side is the one thing that would justify splitting the file
again.

The two stores consume it at different speeds. AMO is automatic — the release
job reapplies it below. Chrome is a manual dashboard paste, so a copy edit is
live on AMO at the next release while Chrome still shows the old text until
someone pastes it. Edits to this file are effectively queued AMO changes; do not
park draft copy there.

## Listing Metadata Is Applied Through The API

The listing is set from this repository, not from the AMO developer dashboard,
so it stays reviewable in version control. `scripts/publish-amo.mjs` sends
`amo/listing.json` with `description` filled in from `store/description.txt` on
every release, so a dashboard edit is overwritten by the next one. `name` comes
from the manifest.

The add-on record does not exist until the first version upload, which is why
the metadata travels with the submission rather than being applied ahead of it.

Field constraints worth knowing before editing:

- `summary` is capped at 250 characters and `name` at 50.
- `tags` and `categories` are closed vocabularies, not free text: AMO defines 42
  tags and 15 extension categories and rejects anything else. The live lists are
  `https://addons.mozilla.org/api/v5/addons/tags/` and `.../addons/categories/`,
  and `pnpm publish:amo --dry-run` checks the file against both. This listing
  uses the `social-communication` category and the `content blocker` and
  `social media` tags; `tags` is additionally capped at 10.
- Do not probe a tag with `GET /api/v5/addons/search/?tag=<tag>`. The write
  endpoint rejects a tag outside the vocabulary but search does not: it returns
  HTTP 200 and `count: 0` for a name that is not a tag at all, so a zero count
  means "not a tag" as often as it means "an unused tag".
- `categories` is a flat array in v5. The published API reference still shows
  it keyed by application; that shape is accepted only for backwards
  compatibility, and the Android categories behind it no longer exist.
- Localized fields are written as `{"en-US": "..."}`. They read back in a
  richer shape than they are written in, so do not round-trip a `GET` response
  into a `PATCH` body.

## Listing Assets Are Repo-Driven Too

The listing icon and the screenshots are metadata on the add-on, not on a
version, and they do not come from the package. The manifest `icons` key drives
`about:addons`; the AMO page shows a placeholder until something uploads an icon
explicitly. Neither can ride along on the listing `PUT`, because AMO takes both
as multipart form-data only and refuses `icon` at add-on creation. Both are
applied after `submitVersion`, which is also when the add-on record first exists
on a maiden submission.

`scripts/publish-amo.mjs` applies them:

| Asset    | Endpoint                               | When                        |
| -------- | -------------------------------------- | --------------------------- |
| Icon     | `PATCH /addons/addon/{guid}/` (`icon`) | every release               |
| Previews | `POST`/`DELETE .../previews/{id}/`     | only with `--sync-previews` |

Captions are a second call — see the throttle note below for why that is forced
rather than chosen.

Constraints, which the script checks locally so a bad file fails before anything
is uploaded: PNG or JPEG only, not animated, under 4MB. The icon must also be
square — AMO enforces that server-side. Previews have no minimum dimension; the
1000×750 in AMO's documentation is a resize target, not a rejection threshold.
The three 1280×800 screenshots are accepted as they are.

### Preview Writes Are Throttled Hard

Every call on the previews endpoint is an unsafe method, so all of them count
against AMO's add-on submission throttles: 3/minute, 10/hour and 24/day per
user. Reads are free. Syncing three screenshots costs three uploads, three
caption patches and a delete per superseded image — close to a whole hour's
budget, and enough to trip the limit partway through.

The script waits out the `Retry-After` header and retries, so a sync works but
spends most of its wall-clock idle; it prints the call count up front so a slow
run is not mistaken for a hung one. A 429 is the only status it retries, since
every other failure means the request itself is wrong. Waits are not short: the
first real sync was handed a `Retry-After` of 3454 seconds when it crossed the
hourly boundary, and finished correctly after sitting out the full window.

It does not wait out all of them. Which bucket was hit changes the header by
four orders of magnitude, and the daily one answers with whatever is left of its
24 hours — that is not a wait, it is a different day. Release 1.4.1 was handed
52277 seconds by it and slept, inside a GitHub job that is cancelled at six
hours: a whole runner spent, no version created, and the reason visible only in
a log line six hours above the failure. `planThrottleRetry` in
`scripts/amo-previews.mjs` now caps a single wait at 70 minutes — clear of the
hourly boundary, which is the longest wait that is still a real one — and caps
what one run may spend throttled at two hours, since waits under the ceiling
still add up past the job serving them. Past either, the run fails at once and
prints when the bucket refills, so the answer is to re-run it after that.

The throttle is not specific to previews. `AddonViewSet` carries the same
classes, so the listing `PUT` and the icon `PATCH` draw on one shared budget —
a release already spends about four calls of the ten. **Do not run a preview
sync in the same hour as a release**: eight plus four exceeds the cap, and the
sync is what will stall. This is the other reason `--assets-only` is a separate
command rather than a flag on the release path.

There is no way to raise the ceiling. `GranularUserRateThrottle` honors one
bypass, the `API_BYPASS_THROTTLING` permission, and that is a group membership
granted to Mozilla's own release-engineering and QA accounts — not something a
token, key, or scope can obtain. The throttle keys on the authenticated user
with independent per-IP limits on top, so re-minting credentials changes
nothing. The only lever is making fewer calls.

The two calls per image are not avoidable. `caption` is writable when a preview
is created, but `TranslationSerializerField` deserializes a dictionary only —
a bare string needs the `l10n_flat_input_output` gate — and multipart cannot
carry one, so the localized caption has to follow as JSON.

### Why Previews Are Opt-In

A sync replaces: it uploads every entry in `amo/previews.json` and deletes what
was published before. It cannot do less. AMO re-encodes images on ingest, so a
local file and its published copy never share a hash, and nothing on a preview
records which manifest entry produced it. Any attempt to reuse a published
preview would amount to assuming its bytes are still the ones on disk — and a
swapped screenshot that silently never uploads is the failure worth avoiding.

Replacing on every release would churn the public listing for description-only
changes, so `--sync-previews` is off by default. To keep that from going quiet,
every release without the flag prints how many previews the manifest holds
versus how many AMO has. Equal counts are reported as equal counts, not as a
match — the images themselves are not comparable from here.

Order in `amo/previews.json` is the display order. `position` is derived from
the index rather than written out, so reordering the file reorders the listing.

### Repairing A Live Listing

`pnpm publish:amo --assets-only` applies the icon, and with `--sync-previews`
the previews, to the add-on that already exists. It uploads no package and
creates no version, which is what makes it usable between releases. AMO accepts
both while a version sits in review, since they are add-on metadata rather than
version metadata.

## Source Submission Is Mandatory

AMO requires the source of any add-on built by a bundler. Every version upload
must carry a source archive built with `pnpm package:source`, and a reviewer
must be able to rebuild the submitted package from it byte for byte. See
[Source Code Submission](../amo/source-submission.md) for the archive contents,
the reviewer instructions, and the reproducibility check.

## Before Submitting A Version

1. Compare `manifest.config.ts` against `amo/data-collection.md`; every
   permission needs a current justification and no stale ones.
2. Confirm the `data_collection_permissions` answer still matches what the code
   does.
3. Re-read `store/description.txt` against user-visible behavior changes in the
   release, remembering the same text is the Chrome listing copy.
4. Rebuild from a fresh extraction of the source archive and confirm the output
   matches the submitted package.
5. Run `pnpm publish:amo --dry-run`. It resolves the listing, prints the
   reviewer notes and previews, and validates the tags and categories against
   AMO. Metadata AMO rejects is only rejected on the call that creates the
   version, which happens after the release that triggered it is already
   published, so the dry run is the last cheap place to catch it.
