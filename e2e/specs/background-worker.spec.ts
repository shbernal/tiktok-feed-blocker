import { test, expect } from '../fixtures/extension'
import { getStorageValue } from '../fixtures/extensionRuntime'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../../src/shared/shortcut'

// The service worker mirrors the resolved command binding into storage on every
// background start. Nothing else writes that key, so its presence is the one
// observable proof that the background entry — rather than some other chunk —
// is what `service-worker-loader.js` actually imported. A worker that failed to
// evaluate still registers and still answers `evaluate`, so every other spec
// stays green while the command listener is missing.
test('the background entry runs and mirrors the command binding', async ({
  extensionContext,
}) => {
  await expect
    .poll(async () =>
      getStorageValue<string>(extensionContext, TOGGLE_SHORTCUT_STORAGE_KEY),
    )
    .toEqual(expect.any(String))
})
