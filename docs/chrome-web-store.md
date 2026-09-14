# Chrome Web Store listing

`chrome-web-store/` holds the Chrome-only listing assets.

- `chrome-web-store/privacy-justifications.md` has paste-ready privacy,
  single-purpose, permission, and host-permission justifications for the
  Developer Dashboard privacy form.

The long description and the screenshots live under `store/`, because the AMO
listing uses the same ones: `store/description.txt` and `store/screenshots/`.
Edit them there. AMO captions and orders the images through `amo/previews.json`.
Chrome takes them as they are.

## The description is a manual paste

No CI step sends listing copy to the Chrome Web Store.
`.github/workflows/publish-cws.yml` uploads the package, waits for processing,
and publishes. It never touches the listing metadata. A change to
`store/description.txt` reaches Chrome only when someone pastes it into the
Developer Dashboard, and a description-only change still sends the item back
through Chrome review.

AMO works the other way: `scripts/publish-amo.mjs` reapplies the same file on
every release. So the Chrome listing lags the repository between a copy edit and
the next dashboard visit. Check the description during each release instead of
assuming it shipped.

Before a release, compare the listing copy with user-visible behavior changes.
For controls shown inside TikTok pages, describe what the user gets, not how the
extension does it.

## Privacy form process

Before filling in the Developer Dashboard privacy form:

1. Compare `manifest.config.ts` with
   `chrome-web-store/privacy-justifications.md`.
2. Check that every `permissions`, `host_permissions`, and
   `content_scripts.matches` entry in the manifest has a justification.
3. Delete justifications for permissions the manifest no longer has, and delete
   manifest permissions the single purpose no longer needs.
4. Re-read the popup, background, content script, and shared settings code
   before making claims about local storage, host access, or data handling.
5. Keep every answer under the field limit the Developer Dashboard shows.
