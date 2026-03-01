import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'TikTok Feed Blocker',
  version: pkg.version,
  description: 'Blocks TikTok explore feed content and mutes audio',
  permissions: ['activeTab', 'storage'],
  host_permissions: ['*://*.tiktok.com/*'],
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
})
