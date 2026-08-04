# Chrome Web Store Listing

Chrome Web Store listing assets live in `chrome-web-store/`.

- `chrome-web-store/privacy-justifications.md` contains paste-ready privacy,
  single-purpose, permission, and host-permission justifications for the
  Developer Dashboard privacy form.
- `chrome-web-store/screenshots/` contains the screenshot assets for the store
  listing.

The long description is not in this directory. It is shared with the AMO listing
at `store/description.txt`, because it is the one field both stores publish
verbatim. Edit it there.

## The Description Is A Manual Paste

Nothing in CI sends listing copy to the Chrome Web Store.
`.github/workflows/publish-cws.yml` uploads the package, waits for processing,
and publishes — it never touches the item's listing metadata. So a change to
`store/description.txt` reaches Chrome only when someone pastes it into the
Developer Dashboard, and a description-only change still puts the item back
through Chrome review.

This is the opposite of AMO, where `scripts/publish-amo.mjs` reapplies the same
file on every release. Expect the Chrome listing to lag the repository between a
copy edit and the next dashboard visit; that lag is the reason to check the
description during a release rather than assuming it shipped.

Before a release, review the listing copy against user-visible behavior changes.
For content controls shown inside TikTok pages, keep the listing focused on the
control outcome rather than implementation details.

## Privacy Form Process

Before filling the Developer Dashboard privacy form:

1. Compare `manifest.config.ts` against
   `chrome-web-store/privacy-justifications.md`.
2. Check that every manifest `permissions`, `host_permissions`, and
   `content_scripts.matches` entry has a matching justification.
3. Remove justification text for permissions that are no longer in the
   manifest, and remove manifest permissions that no longer support the single
   purpose.
4. Re-read the popup, background, content script, and shared settings behavior
   before submitting claims about local storage, host access, or data handling.
5. Keep every dashboard answer under the field limit shown in the Developer
   Dashboard.
