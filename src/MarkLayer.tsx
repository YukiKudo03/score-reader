import type { System } from './layout'

export interface Rect {
  left: number
  top: number
  w: number
  h: number
}

/** 段マークの編集用オーバーレイ。各段の位置に線と、小節数の増減・削除ボタンを出す */
export function MarkLayer(props: { rect: Rect; systems: System[]; onChange: (s: System[]) => void }) {
  const { rect, systems, onChange } = props
  const setBars = (i: number, bars: number) =>
    onChange(systems.map((s, j) => (j === i ? { ...s, bars: Math.max(1, Math.min(32, bars)) } : s)))

  return (
    <>
      {systems.map((s, i) => (
        <div
          key={i}
          className="mark"
          style={{ left: rect.left, width: rect.w, top: rect.top + s.y * rect.h }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="mark-controls">
            <button aria-label="小節を減らす" onClick={() => setBars(i, s.bars - 1)}>
              −
            </button>
            <output>{s.bars}小節</output>
            <button aria-label="小節を増やす" onClick={() => setBars(i, s.bars + 1)}>
              +
            </button>
            <button aria-label={`${i + 1}段目のマークを削除`} onClick={() => onChange(systems.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        </div>
      ))}
    </>
  )
}
