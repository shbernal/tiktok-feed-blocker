import { PAGE_SECTIONS, type PageSection } from '../shared/settings'
import { SELECTORS } from './selectors'

export const BLOCKING_STYLE_ID = 'ttfb-blocking-style'

// Set on `<html>` once the stored settings have been read and the section
// attributes reflect them. Until then every blockable target is hidden, so the
// page never paints feed content the user has asked to block. Absent means
// "the extension has not decided yet", never "nothing is blocked" — which is
// why teardown sets it rather than clearing it.
export const READY_ATTR = 'data-ttfb-ready'

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
const displayNoneRule = (selectors: readonly string[]) => {
  return `${selectors.join(',\n')} {\n  display: none !important;\n}`
}

const sectionRule = (section: PageSection) => {
  const attribute = BLOCKED_SECTION_ATTRS[section]

  return displayNoneRule(
    HIDDEN_SELECTORS[section].map(selector => `html[${attribute}] ${selector}`),
  )
}

// The pre-settings default. Every target of every section is hidden while the
// root lacks `READY_ATTR`, because the content script cannot know which
// sections are blocked until the storage read lands. Targets a section does not
// own are absent from the page anyway, so the union costs nothing.
const notReadyRule = () => {
  const selectors = Array.from(
    new Set(PAGE_SECTIONS.flatMap(section => HIDDEN_SELECTORS[section])),
  ).map(selector => `html:not([${READY_ATTR}]) ${selector}`)

  return displayNoneRule(selectors)
}

export const buildBlockingStyleSheet = () => {
  return [notReadyRule(), ...PAGE_SECTIONS.map(sectionRule)].join('\n\n')
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

// Idempotent, and called from both the storage callback and the fallback timer.
// Nothing ever clears it: an unset attribute hides the page, so the only safe
// transitions are "not yet decided" -> "decided".
export const setDocumentReady = () => {
  document.documentElement.setAttribute(READY_ATTR, '')
}

export const isDocumentReady = () => {
  return document.documentElement.hasAttribute(READY_ATTR)
}

// `src/content/blocking.css` is this string on disk. The manifest injects it at
// `document_start`, which is the only delivery guaranteed to be in place before
// the document parses — crxjs wraps the content script in an async `import()`,
// so the runtime sheet cannot make that promise. `tests/blocking-css.test.ts`
// fails if the file drifts from this builder.
export const BLOCKING_CSS_HEADER = `/*
 * GENERATED FILE - do not edit by hand.
 * Source of truth: src/content/blockingStyles.ts (buildBlockingStyleSheet).
 * Regenerate: UPDATE_BLOCKING_CSS=1 pnpm test blocking-css
 */`

export const buildBlockingStyleFile = () => {
  return `${BLOCKING_CSS_HEADER}\n\n${buildBlockingStyleSheet()}\n`
}
