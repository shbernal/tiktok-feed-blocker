// The three attributes are written together and read together: restore bails
// unless all three are present, so a partial write would strand the element in
// a muted state with no way back.
const MEDIA_PREVIOUS_MUTED_ATTR = 'data-ttfb-previous-muted'
const MEDIA_PREVIOUS_VOLUME_ATTR = 'data-ttfb-previous-volume'
const MEDIA_PREVIOUS_PAUSED_ATTR = 'data-ttfb-previous-paused'

const restoreManagedMedia = (media: HTMLMediaElement) => {
  const previousMuted = media.getAttribute(MEDIA_PREVIOUS_MUTED_ATTR)
  const previousVolume = media.getAttribute(MEDIA_PREVIOUS_VOLUME_ATTR)
  const previousPaused = media.getAttribute(MEDIA_PREVIOUS_PAUSED_ATTR)

  if (
    previousMuted === null ||
    previousVolume === null ||
    previousPaused === null
  ) {
    return
  }

  media.muted = previousMuted === 'true'
  media.volume = Number(previousVolume)

  if (previousPaused === 'false' && media.paused) {
    void media.play().catch(() => {
      // Autoplay restrictions can block resume; restoring mute/volume is still useful.
    })
  }

  media.removeAttribute(MEDIA_PREVIOUS_MUTED_ATTR)
  media.removeAttribute(MEDIA_PREVIOUS_VOLUME_ATTR)
  media.removeAttribute(MEDIA_PREVIOUS_PAUSED_ATTR)
}

// Restore queries the bookkeeping attribute rather than `video, audio`. Only
// media this extension muted ever carries it, so the common case — a sweep
// where nothing is muted — matches nothing instead of walking every player on
// the page.
export const restoreMediaInContainers = (containers: Element[]) => {
  containers.forEach(container => {
    container
      .querySelectorAll<HTMLMediaElement>(`[${MEDIA_PREVIOUS_MUTED_ATTR}]`)
      .forEach(media => {
        restoreManagedMedia(media)
      })
  })
}

// Teardown needs a restore that does not depend on the containers still being
// in the DOM or the current page section still being detectable.
export const restoreAllManagedMedia = () => {
  restoreMediaInContainers([document.documentElement])
}

export const muteMediaInContainers = (containers: Element[]) => {
  containers.forEach(container => {
    container
      .querySelectorAll<HTMLMediaElement>('video, audio')
      .forEach(media => {
        if (!media.hasAttribute(MEDIA_PREVIOUS_MUTED_ATTR)) {
          media.setAttribute(MEDIA_PREVIOUS_MUTED_ATTR, String(media.muted))
          media.setAttribute(MEDIA_PREVIOUS_VOLUME_ATTR, String(media.volume))
          media.setAttribute(MEDIA_PREVIOUS_PAUSED_ATTR, String(media.paused))
        }

        if (!media.muted || media.volume !== 0) {
          media.muted = true
          media.volume = 0
        }
      })
  })
}
