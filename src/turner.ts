// 譜めくり位置とテンポ進行の純粋ロジック(UI・時計に依存しない)

/**
 * 表示位置。half=1 は「半ページめくり」済みの状態で、
 * 上半分に次ページの上半分、下半分に現在ページの下半分が見えている。
 */
export interface Pos {
  page: number
  half: 0 | 1
}

/** ページの所要時間のうち、上半分を次ページへ差し替える時点の割合 */
export const HALF_POINT = 0.6

export function nextPos(pos: Pos, pageCount: number, halfTurn: boolean): Pos {
  if (pos.page >= pageCount - 1) return pos
  if (halfTurn && pos.half === 0) return { page: pos.page, half: 1 }
  return { page: pos.page + 1, half: 0 }
}

export function prevPos(pos: Pos, halfTurn: boolean): Pos {
  if (pos.half === 1) return { page: pos.page, half: 0 }
  if (pos.page === 0) return pos
  return { page: pos.page - 1, half: halfTurn ? 1 : 0 }
}

/** 1ページの演奏にかかる秒数 */
export function pageDuration(bars: number, beatsPerBar: number, bpm: number): number {
  return (bars * beatsPerBar * 60) / bpm
}

/** その表示位置に手動で移動したとき、ページ内経過時間をどこに合わせるか */
export function elapsedForPos(pos: Pos, duration: number): number {
  return pos.half === 1 ? duration * HALF_POINT : 0
}

export interface Clock {
  pos: Pos
  /** 現在ページ内の経過秒。負の値はカウントイン中 */
  elapsed: number
  finished: boolean
}

/** dt 秒だけ時計を進め、必要ならページ(または半ページ)をめくる */
export function tick(
  clock: Clock,
  dt: number,
  durationOf: (page: number) => number,
  pageCount: number,
  halfTurn: boolean,
): Clock {
  let { page, half } = clock.pos
  let elapsed = clock.elapsed + dt
  const last = pageCount - 1
  for (;;) {
    const T = durationOf(page)
    if (elapsed >= T) {
      if (page >= last) return { pos: { page, half: 0 }, elapsed: T, finished: true }
      elapsed -= T
      page += 1
      half = 0
      continue
    }
    if (halfTurn && half === 0 && page < last && elapsed >= T * HALF_POINT) half = 1
    return { pos: { page, half }, elapsed, finished: false }
  }
}
