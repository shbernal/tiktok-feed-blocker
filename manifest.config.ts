import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

// Gecko needs an explicit add-on id and an up-front data-collection answer.
// Chrome has no use for either key, so they are only emitted for the Firefox
// build and the default build stays exactly as it ships to the Chrome Web
// Store.
const isFirefox = process.env.EXT_TARGET === 'firefox'

export default defineManifest({
  manifest_version: 3,
  name: 'TikTok Feed Blocker',
  version: pkg.version,
  description: pkg.description,
  permissions: ['activeTab', 'storage'],
  host_permissions: ['*://*.tiktok.com/*'],
  // Gecko has no extension service workers, and crxjs reads the background
  // entry straight off this manifest rather than rewriting it per target.
  //
  // `worker.ts`, not `main.ts`: crxjs emits every entry chunk under
  // `basename(file)`, so two entries sharing a basename collide and the
  // generated `service-worker-loader.js` ends up importing the wrong chunk.
  // With both entries called `main.ts` the loader imported the *content*
  // script, the background chunk was emitted but referenced by nothing, and
  // `chrome.commands.onCommand` was never registered in any shipped build.
  // `tests/manifest-entry-names.test.ts` keeps the basenames distinct.
  background: isFirefox
    ? { scripts: ['src/background/worker.ts'] }
    : { service_worker: 'src/background/worker.ts', type: 'module' },
  commands: {
    'toggle-current-page-block': {
      suggested_key: {
        default: 'Ctrl+Shift+8',
        mac: 'Command+Shift+8',
      },
      description: 'Toggle blocking for the current TikTok page',
    },
  },
  content_scripts: [
    {
      matches: ['*://*.tiktok.com/*'],
      js: ['src/content/main.ts'],
      // The stylesheet is the only half that can be guaranteed to land before
      // the document parses: crxjs wraps the content script in an async
      // `import()`, so `js` at `document_start` still executes after the loader
      // resolves. Its rules hide every blockable target until the script sets
      // `data-ttfb-ready`, which is what removes the flash of feed content.
      // Generated from `src/content/blockingStyles.ts`; see
      // `tests/blocking-css.test.ts`.
      css: ['src/content/blocking.css'],
      run_at: 'document_start',
    },
  ],
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'TikTok Feed Blocker',
  },
  icons: {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
  ...(isFirefox
    ? {
        browser_specific_settings: {
          gecko: {
            id: 'tiktok-feed-blocker@shbernal.github.io',
            // 140 is the floor for `data_collection_permissions`; below it the
            // key is ignored and the disclosure never reaches the user.
            strict_min_version: '140.0',
            // The extension reads and writes nothing but its own settings.
            data_collection_permissions: { required: ['none'] },
          },
        },
      }
    : {}),
})
