import { promises as fs } from 'node:fs'
import type { Locator, Page, TestInfo } from '@playwright/test'
import { expect } from '@playwright/test'
import type { PageSection } from '../../src/shared/settings'

type OverlayProofOptions = {
  page: Page
  overlay: Locator
  section: PageSection
  state: string
  testInfo: TestInfo
  expectedText?: string
  expectedClass?: RegExp
  timeout?: number
}

const sanitizeArtifactName = (value: string) => {
  return value
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
}

const assertScreenshotWritten = async (filePath: string) => {
  const stats = await fs.stat(filePath)
  expect(stats.size).toBeGreaterThan(0)
}

export const expectVisibleOverlayProof = async ({
  page,
  overlay,
  section,
  state,
  testInfo,
  expectedText,
  expectedClass,
  timeout,
}: OverlayProofOptions) => {
  const artifactName = sanitizeArtifactName(`${section}-${state}`)
  const fullViewportPath = testInfo.outputPath(`${artifactName}-viewport.png`)
  const overlayPath = testInfo.outputPath(`${artifactName}-overlay.png`)
  const proofPath = testInfo.outputPath(`${artifactName}-proof.json`)

  await expect(overlay).toBeVisible({ timeout })

  if (expectedText) {
    await expect(overlay).toContainText(expectedText)
  }

  if (expectedClass) {
    await expect(overlay).toHaveClass(expectedClass)
  }

  const proof = await overlay.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const styles = getComputedStyle(element)

    return {
      text: element.textContent?.trim() ?? '',
      className: element.className,
      css: {
        position: styles.position,
        top: styles.top,
        right: styles.right,
        bottom: styles.bottom,
        left: styles.left,
        transform: styles.transform,
        zIndex: styles.zIndex,
        display: styles.display,
        visibility: styles.visibility,
        opacity: styles.opacity,
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      boundingBox: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
    }
  })

  expect(proof.boundingBox.width).toBeGreaterThan(0)
  expect(proof.boundingBox.height).toBeGreaterThan(0)
  expect(proof.css.visibility).not.toBe('hidden')
  expect(proof.css.display).not.toBe('none')

  await page.screenshot({
    path: fullViewportPath,
    fullPage: false,
  })
  await overlay.screenshot({
    path: overlayPath,
  })
  await fs.writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`)

  await assertScreenshotWritten(fullViewportPath)
  await assertScreenshotWritten(overlayPath)

  await testInfo.attach(`${artifactName}-viewport`, {
    path: fullViewportPath,
    contentType: 'image/png',
  })
  await testInfo.attach(`${artifactName}-overlay`, {
    path: overlayPath,
    contentType: 'image/png',
  })
  await testInfo.attach(`${artifactName}-proof`, {
    path: proofPath,
    contentType: 'application/json',
  })

  return proof
}
