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
  background: isFirefox
    ? { scripts: ['src/background/main.ts'] }
    : { service_worker: 'src/background/main.ts', type: 'module' },
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
      run_at: 'document_end',
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
