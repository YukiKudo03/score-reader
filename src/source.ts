import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** iOS Safari の canvas 上限(約1677万px)に余裕を持たせた1ページあたりの最大画素数 */
const MAX_PIXELS = 8_000_000

/** PDF でも画像でも同じ扱いでページを描画するための抽象 */
export interface PageSource {
  pageCount: number
  /** ページの 幅/高さ */
  aspect(index: number): Promise<number>
  /** CSSピクセル幅 cssWidth で表示する前提で描画済み canvas を返す */
  render(index: number, cssWidth: number): Promise<HTMLCanvasElement>
  destroy(): void
}

function pixelScale(cssW: number, cssH: number): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  return Math.min(dpr, Math.sqrt(MAX_PIXELS / (cssW * cssH)))
}

async function pdfSource(blob: Blob): Promise<PageSource> {
  const task = pdfjs.getDocument({ data: await blob.arrayBuffer() })
  const doc = await task.promise
  return {
    pageCount: doc.numPages,
    async aspect(index) {
      const vp = (await doc.getPage(index + 1)).getViewport({ scale: 1 })
      return vp.width / vp.height
    },
    async render(index, cssWidth) {
      const page = await doc.getPage(index + 1)
      const base = page.getViewport({ scale: 1 })
      const cssScale = cssWidth / base.width
      const scale = cssScale * pixelScale(cssWidth, base.height * cssScale)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      await page.render({ canvas, viewport }).promise
      return canvas
    },
    destroy() {
      void task.destroy()
    },
  }
}

function imageSource(blobs: Blob[]): PageSource {
  const cache = new Map<number, Promise<ImageBitmap>>()
  const bitmap = (i: number) => {
    let p = cache.get(i)
    if (!p) cache.set(i, (p = createImageBitmap(blobs[i])))
    return p
  }
  return {
    pageCount: blobs.length,
    async aspect(index) {
      const b = await bitmap(index)
      return b.width / b.height
    },
    async render(index, cssWidth) {
      const b = await bitmap(index)
      const cssHeight = (cssWidth * b.height) / b.width
      const scale = Math.min(pixelScale(cssWidth, cssHeight), b.width / cssWidth)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(cssWidth * scale)
      canvas.height = Math.round(cssHeight * scale)
      const g = canvas.getContext('2d')!
      g.imageSmoothingQuality = 'high'
      g.drawImage(b, 0, 0, canvas.width, canvas.height)
      return canvas
    },
    destroy() {
      for (const p of cache.values()) void p.then((b) => b.close())
    },
  }
}

export function openSource(kind: 'pdf' | 'images', blobs: Blob[]): Promise<PageSource> {
  return kind === 'pdf' ? pdfSource(blobs[0]) : Promise.resolve(imageSource(blobs))
}
