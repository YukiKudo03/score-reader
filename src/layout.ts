// 段マーク(ページ内の各段の位置と小節数)から、分割位置やめくり時点を求める純粋ロジック

import type { ScoreSettings } from './store'
import { pageDuration, type PageTiming } from './turner'

/** 1段。y はページ高さに対する段の中央の位置(0=上端, 1=下端) */
export interface System {
  y: number
  bars: number
}

const DEFAULT_SPLIT = 0.5
/** 段マークがないページで、上側を差し替える時点(所要時間に対する割合) */
const DEFAULT_HALF_FRACTION = 0.6

export function totalBars(systems: System[]): number {
  return systems.reduce((n, s) => n + s.bars, 0)
}

/** 半ページめくりの分割線。段を横切らないよう、ページ中央に最も近い段間に置く */
export function splitY(systems: System[] | undefined): number {
  if (!systems || systems.length < 2) return DEFAULT_SPLIT
  let best = DEFAULT_SPLIT
  let bestDist = Infinity
  for (let i = 0; i + 1 < systems.length; i++) {
    const mid = (systems[i].y + systems[i + 1].y) / 2
    const dist = Math.abs(mid - DEFAULT_SPLIT)
    if (dist < bestDist) {
      best = mid
      bestDist = dist
    }
  }
  return best
}

/** 上側を差し替える時点。分割線より下の段に入って半小節たったところ */
export function halfFraction(systems: System[] | undefined): number {
  if (!systems || systems.length < 2) return DEFAULT_HALF_FRACTION
  const split = splitY(systems)
  const above = totalBars(systems.filter((s) => s.y < split))
  return (above + 0.5) / totalBars(systems)
}

/** その段の頭が、ページ所要時間のどの割合にあたるか */
export function systemStartFraction(systems: System[], index: number): number {
  return totalBars(systems.slice(0, index)) / totalBars(systems)
}

/** ページ内の進み具合(0〜1)から、いま弾いている段を求める */
export function systemAtFraction(systems: System[], fraction: number): number {
  const target = fraction * totalBars(systems)
  let acc = 0
  for (let i = 0; i < systems.length; i++) {
    acc += systems[i].bars
    if (target < acc) return i
  }
  return systems.length - 1
}

export function nearestSystem(systems: System[], y: number): number {
  let best = 0
  for (let i = 1; i < systems.length; i++) {
    if (Math.abs(systems[i].y - y) < Math.abs(systems[best].y - y)) best = i
  }
  return best
}

/** y の位置に段を追加する。小節数は最も近い既存の段にそろえる */
export function addSystem(systems: System[], y: number): System[] {
  const bars = systems.length ? systems[nearestSystem(systems, y)].bars : 4
  return [...systems, { y, bars }].sort((a, b) => a.y - b.y)
}

export function pageBars(s: ScoreSettings, page: number): number {
  const systems = s.systems[page]
  return systems?.length ? totalBars(systems) : (s.barsByPage[page] ?? s.defaultBars)
}

export function pageTiming(s: ScoreSettings, page: number): PageTiming {
  const duration = pageDuration(pageBars(s, page), s.beatsPerBar, s.bpm)
  return { duration, halfAt: duration * halfFraction(s.systems[page]) }
}
