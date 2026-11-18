import { memo, useEffect, useRef, useState } from 'react'
import type { PageSource } from './source'

interface Props {
  source: PageSource
  index: number
  boxW: number
  boxH: number
  /** full: 全体表示 / top: 分割線より上だけ表示(半ページめくり) / hidden: 先読みのみ */
  clip: 'full' | 'top' | 'hidden'
  /** 分割線の位置(ページ高さに対する割合) */
  split: number
}

/** ステージ中央に1ページを収まる最大サイズで描画する */
export const PageView = memo(function PageView({ source, index, boxW, boxH, clip, split }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [aspect, setAspect] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void source.aspect(index).then((a) => alive && setAspect(a))
    return () => {
      alive = false
    }
  }, [source, index])

  const w = aspect ? Math.floor(Math.min(boxW, boxH * aspect)) : 0
  const h = aspect ? Math.floor(w / aspect) : 0

  useEffect(() => {
    if (!w) return
    let alive = true
    void source.render(index, w).then((rendered) => {
      const canvas = ref.current
      if (!alive || !canvas) return
      canvas.width = rendered.width
      canvas.height = rendered.height
      canvas.getContext('2d')!.drawImage(rendered, 0, 0)
    })
    return () => {
      alive = false
    }
  }, [source, index, w])

  return (
    <canvas
      ref={ref}
      className="page"
      data-page={index}
      data-clip={clip}
      style={{
        width: w,
        height: h,
        visibility: clip === 'hidden' ? 'hidden' : 'visible',
        clipPath: clip === 'top' ? `inset(0 0 ${(1 - split) * 100}% 0)` : undefined,
      }}
    />
  )
})
