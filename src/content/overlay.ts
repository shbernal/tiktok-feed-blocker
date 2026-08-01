import { type ExtensionSettings } from '../shared/settings'
import { getCurrentPageSection, getPageSectionLabel } from './selectors'

export const OVERLAY_ID = 'ttfb-feed-overlay'
export const OVERLAY_STYLE_ID = 'ttfb-feed-overlay-style'
export const OVERLAY_TOGGLE_ID = 'ttfb-active-toggle'
export const OVERLAY_TOGGLE_LABEL_ID = 'ttfb-active-toggle-label'
export const OVERLAY_BLOCK_BUTTON_ID = 'ttfb-feed-overlay-block-button'

// Callbacks are injected rather than imported so this module never depends on
// the lifecycle module that owns the settings singleton.
export type OverlayHandlers = {
  onToggle: (enabled: boolean) => void
  onBlock: () => void
}

let overlayHandlers: OverlayHandlers | null = null

const ensureOverlayStyles = () => {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = OVERLAY_STYLE_ID
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

#${OVERLAY_ID}.ttfb-overlay-blocked {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  padding: 20px 24px;
  min-width: 320px;
  text-align: center;
}

#${OVERLAY_ID}.ttfb-overlay-available {
  top: 16px;
  right: 16px;
  max-width: calc(100vw - 32px);
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 999px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.18);
  padding: 8px;
}

.ttfb-title {
  margin: 0 0 16px 0;
  color: #111;
  font-size: 20px;
  font-weight: 700;
}

.ttfb-toggle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ttfb-toggle-label {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.ttfb-switch {
  position: relative;
  width: 60px;
  height: 32px;
  cursor: pointer;
}

.ttfb-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ttfb-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  border-radius: 32px;
  transition: all 0.3s ease;
}

.ttfb-slider::before {
  position: absolute;
  content: '';
  height: 24px;
  width: 24px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.ttfb-switch input:checked + .ttfb-slider {
  background: linear-gradient(135deg, #ff0050, #ff4081);
}

.ttfb-switch input:checked + .ttfb-slider::before {
  transform: translateX(28px);
}

.ttfb-slider:hover {
  box-shadow: 0 0 8px rgba(255, 0, 80, 0.3);
}

.ttfb-switch input:checked + .ttfb-slider:hover {
  box-shadow: 0 0 8px rgba(255, 0, 80, 0.5);
}

.ttfb-switch input:focus + .ttfb-slider {
  outline: 2px solid #ff4081;
  outline-offset: 2px;
}

.ttfb-block-button {
  appearance: none;
  background: #111;
  border: 0;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
  min-height: 36px;
  padding: 0 14px;
}

.ttfb-block-button:hover {
  background: #ff0050;
}

.ttfb-block-button:focus {
  outline: 2px solid #ff4081;
  outline-offset: 2px;
}

@media (max-width: 480px) {
  #${OVERLAY_ID}.ttfb-overlay-blocked {
    min-width: 0;
    width: calc(100vw - 40px);
  }

  #${OVERLAY_ID}.ttfb-overlay-available {
    top: 12px;
    right: 12px;
    max-width: calc(100vw - 24px);
  }
}

`

  document.documentElement.appendChild(style)
}

export const removeFeedOverlay = () => {
  const overlay = document.getElementById(OVERLAY_ID)
  if (overlay) {
    overlay.remove()
  }
}

export const removeOverlayStyles = () => {
  const style = document.getElementById(OVERLAY_STYLE_ID)
  if (style) {
    style.remove()
  }
}

// Stable listener identities: renderFeedOverlay only attaches them when the
// overlay state actually changes, so the handlers are read from module state
// at event time rather than captured per render.
const handleOverlayToggle = (event: Event) => {
  const input = event.currentTarget as HTMLInputElement
  overlayHandlers?.onToggle(input.checked)
}

const handleOverlayBlock = () => {
  overlayHandlers?.onBlock()
}

export const renderFeedOverlay = (
  settings: ExtensionSettings,
  handlers: OverlayHandlers,
) => {
  overlayHandlers = handlers

  const currentPageSection = getCurrentPageSection()
  if (!document.body || !currentPageSection) {
    removeFeedOverlay()
    return
  }

  ensureOverlayStyles()

  const isBlocked = settings[currentPageSection]
  const overlayState = isBlocked ? 'blocked' : 'available'
  const pageSectionLabel = getPageSectionLabel(currentPageSection)
  let overlay = document.getElementById(OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    document.body.appendChild(overlay)
  }

  overlay.className = `ttfb-overlay-${overlayState}`

  if (overlay.dataset.ttfbState !== overlayState) {
    overlay.dataset.ttfbState = overlayState

    if (isBlocked) {
      overlay.innerHTML = `
        <p class="ttfb-title">TikTok Feed Blocker Extension</p>
        <div class="ttfb-toggle-row">
          <p id="${OVERLAY_TOGGLE_LABEL_ID}" class="ttfb-toggle-label"></p>
          <label class="ttfb-switch">
            <input
              id="${OVERLAY_TOGGLE_ID}"
              type="checkbox"
              aria-labelledby="${OVERLAY_TOGGLE_LABEL_ID}"
            />
            <span class="ttfb-slider"></span>
          </label>
        </div>
      `

      const toggleInput = overlay.querySelector<HTMLInputElement>(
        `#${OVERLAY_TOGGLE_ID}`,
      )
      if (toggleInput) {
        toggleInput.addEventListener('change', handleOverlayToggle)
      }
    } else {
      overlay.innerHTML = `
        <button
          id="${OVERLAY_BLOCK_BUTTON_ID}"
          class="ttfb-block-button"
          type="button"
        ></button>
      `

      const blockButton = overlay.querySelector<HTMLButtonElement>(
        `#${OVERLAY_BLOCK_BUTTON_ID}`,
      )
      if (blockButton) {
        blockButton.addEventListener('click', handleOverlayBlock)
      }
    }
  }

  const blockButton = overlay.querySelector<HTMLButtonElement>(
    `#${OVERLAY_BLOCK_BUTTON_ID}`,
  )
  if (blockButton) {
    blockButton.textContent = `Block ${pageSectionLabel}`
    blockButton.setAttribute('aria-label', `Block ${pageSectionLabel}`)
  }

  const toggleLabel = overlay.querySelector<HTMLParagraphElement>(
    `#${OVERLAY_TOGGLE_LABEL_ID}`,
  )
  if (toggleLabel) {
    toggleLabel.textContent = `Block ${pageSectionLabel}`
  }

  const toggleInput = overlay.querySelector<HTMLInputElement>(
    `#${OVERLAY_TOGGLE_ID}`,
  )
  if (toggleInput) {
    toggleInput.checked = isBlocked
  }
}
