import { restoreMediaInContainers } from './media'

// Hiding is idempotent and self-marking: the attribute records that this
// extension is what set `display: none`, so restore never un-hides something
// TikTok hid itself.
export const hideElement = (element: HTMLElement, hiddenAttr: string) => {
  if (element.getAttribute(hiddenAttr) === 'true') {
    return
  }

  if (element.style.display === 'none') {
    return
  }

  element.style.display = 'none'
  element.setAttribute(hiddenAttr, 'true')
}

export const hideElements = (selector: string, hiddenAttr: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach(element => {
    hideElement(element, hiddenAttr)
  })
}

export const showElements = (selector: string, hiddenAttr: string) => {
  document
    .querySelectorAll<HTMLElement>(`${selector}[${hiddenAttr}="true"]`)
    .forEach(element => {
      element.style.display = ''
      element.removeAttribute(hiddenAttr)
      restoreMediaInContainers([element])
    })
}
