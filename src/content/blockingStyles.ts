import { PAGE_SECTIONS, type PageSection } from '../shared/settings'
import { SELECTORS } from './selectors'

export const BLOCKING_STYLE_ID = 'ttfb-blocking-style'

// One attribute per section, toggled on `<html>`. Blocking a section costs a
// single attribute write instead of a DOM walk, and anything TikTok renders
// afterwards is hidden by the CSS engine as it mounts rather than on the next
// sweep — which is what closes the window where fresh feed content was briefly
// visible.
export const BLOCKED_SECTION_ATTRS: Record<PageSection, string> = {
  home: 'data-ttfb-home-blocked',
  explore: 'data-ttfb-explore-blocked',
  live: 'data-ttfb-live-blocked',
}

// What each section hides. Muting is driven from its own table in
// `blocking.ts`: CSS cannot mute, so that half stays in JS and still needs
// re-application as media mounts.
const HIDDEN_SELECTORS: Record<PageSection, readonly string[]> = {
  home: [
    SELECTORS.columnListContainer,
    SELECTORS.progressIndicator,
    SELECTORS.homeCommentSidebar,
    SELECTORS.feedNavigationContainer,
  ],
  explore: [SELECTORS.mainContent],
  live: [SELECTORS.livePageMainContainer],
}

// `!important` because TikTok's own rules are author origin too. It does not
// win against an inline `display` from TikTok, which is the one failure mode
// this cannot defend against — and it is silent, so it is the first thing to
// check if a section ever stops hiding.
const sectionRule = (section: PageSection) => {
  const attribute = BLOCKED_SECTION_ATTRS[section]
  const selectors = HIDDEN_SELECTORS[section]
    .map(selector => `html[${attribute}] ${selector}`)
    .join(',\n')

  return `${selectors} {\n  display: none !important;\n}`
}

export const buildBlockingStyleSheet = () => {
  return PAGE_SECTIONS.map(sectionRule).join('\n\n')
}

// Appended to `documentElement` rather than `head` so it does not depend on
// `head` existing, and so it survives TikTok replacing the head contents.
export const ensureBlockingStyles = () => {
  if (document.getElementById(BLOCKING_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = BLOCKING_STYLE_ID
  style.textContent = buildBlockingStyleSheet()
  document.documentElement.appendChild(style)
}

export const removeBlockingStyles = () => {
  const style = document.getElementById(BLOCKING_STYLE_ID)
  if (style) {
    style.remove()
  }
}

export const setSectionBlocked = (section: PageSection, blocked: boolean) => {
  document.documentElement.toggleAttribute(
    BLOCKED_SECTION_ATTRS[section],
    blocked,
  )
}

export const clearAllSectionAttributes = () => {
  PAGE_SECTIONS.forEach(section => {
    setSectionBlocked(section, false)
  })
}
