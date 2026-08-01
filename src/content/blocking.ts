import {
  PAGE_SECTIONS,
  type ExtensionSettings,
  type PageSection,
} from '../shared/settings'
import {
  clearAllSectionAttributes,
  ensureBlockingStyles,
  removeBlockingStyles,
  setDocumentReady,
  setSectionBlocked,
} from './blockingStyles'
import {
  muteMediaInContainers,
  restoreAllManagedMedia,
  restoreMediaInContainers,
} from './media'
import {
  removeFeedOverlay,
  renderFeedOverlay,
  type OverlayHandlers,
} from './overlay'
import { getCurrentPageSection, isLivePage, SELECTORS } from './selectors'

const queryAll = (selector: string) => {
  return Array.from(document.querySelectorAll<HTMLElement>(selector))
}

// Hiding is declarative; muting is not, so each section still names the
// containers it mutes. Home and Explore mute inside the container they hide.
// Live mutes document-wide because the player can sit outside the container
// the live selector matches.
const mediaContainersFor = (section: PageSection): Element[] => {
  switch (section) {
    case 'home':
      return queryAll(SELECTORS.columnListContainer)
    case 'explore':
      return queryAll(SELECTORS.mainContent)
    case 'live':
      return isLivePage() ? [document.documentElement] : []
  }
}

// Live blocking is gated on the URL as well as the setting. The container id
// only exists on `/live`, but muting there is document-wide, so an attribute
// left set across a client-side navigation would mute whatever page TikTok
// rendered next. The gate is re-evaluated on every sweep, which is what keeps
// SPA navigation handled now that hiding no longer walks the DOM.
const isSectionBlocked = (
  settings: ExtensionSettings,
  section: PageSection,
) => {
  return section === 'live' ? settings.live && isLivePage() : settings[section]
}

const applySectionBlocking = (
  settings: ExtensionSettings,
  section: PageSection,
) => {
  const blocked = isSectionBlocked(settings, section)
  setSectionBlocked(section, blocked)

  const containers = mediaContainersFor(section)
  if (blocked) {
    muteMediaInContainers(containers)
  } else {
    restoreMediaInContainers(containers)
  }
}

// The full undo: attributes off, every managed media restored wherever it sits,
// and the stylesheet gone. Restoring by attribute rather than by container
// matters here, because teardown can run after TikTok has already replaced the
// container the media was muted through.
//
// `setDocumentReady` is part of the undo, not a leftover. Removing the runtime
// sheet does not remove the one the manifest injected at `document_start`, and
// its rules hide every target while the root lacks the ready attribute — so a
// teardown that cleared it would leave the page permanently blank.
export const clearAllBlocking = () => {
  clearAllSectionAttributes()
  restoreAllManagedMedia()
  removeBlockingStyles()
  setDocumentReady()
}

export const applyCurrentSettings = (
  settings: ExtensionSettings,
  handlers: OverlayHandlers,
) => {
  ensureBlockingStyles()

  PAGE_SECTIONS.forEach(section => {
    applySectionBlocking(settings, section)
  })

  // Resolved once per sweep and shared with the overlay, which would otherwise
  // walk the document for the same answer immediately afterwards.
  const currentPageSection = getCurrentPageSection()
  if (settings.overlay && currentPageSection) {
    renderFeedOverlay(settings, handlers, currentPageSection)
  } else {
    removeFeedOverlay()
  }
}
