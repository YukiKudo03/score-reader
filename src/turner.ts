// 譜めくり位置とテンポ進行の純粋ロジック(UI・時計に依存しない)

/**
 * 表示位置。half=1 は「半ページめくり」済みの状態で、
 * 分割線より上に次ページ、下に現在ページが見えている。
 */
export interface Pos {
  page: number
  half: 0 | 1
}

export interface PageTiming {
  /** ページ全体の演奏にかかる秒数 */
  duration: number
  /** 上側を次ページへ差し替える時点(ページ頭からの秒数) */
  halfAt: number
}

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

export interface Clock {
  pos: Pos
  /** 現在ページ内の経過秒 */
  elapsed: number
  finished: boolean
}

/** その表示位置に手動で移動したときの時計 */
export function clockForPos(pos: Pos, timing: PageTiming): Clock {
  return { pos, elapsed: pos.half === 1 ? timing.halfAt : 0, finished: false }
}

/** dt 秒だけ時計を進め、必要ならページ(または半ページ)をめくる */
export function tick(
  clock: Clock,
  dt: number,
  timingOf: (page: number) => PageTiming,
  pageCount: number,
  halfTurn: boolean,
): Clock {
  let { page, half } = clock.pos
  let elapsed = clock.elapsed + dt
  const last = pageCount - 1
  for (;;) {
    const { duration, halfAt } = timingOf(page)
    if (elapsed >= duration) {
      if (page >= last) return { pos: { page, half: 0 }, elapsed: duration, finished: true }
      elapsed -= duration
      page += 1
      half = 0
      continue
    }
    if (halfTurn && half === 0 && page < last && elapsed >= halfAt) half = 1
    return { pos: { page, half }, elapsed, finished: false }
  }
}
