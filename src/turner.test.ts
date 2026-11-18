import { describe, expect, it } from 'vitest'
import { clockForPos, nextPos, pageDuration, prevPos, tick, type Clock } from './turner'

describe('nextPos / prevPos', () => {
  it('半ページめくりありでは half を経由する', () => {
    expect(nextPos({ page: 0, half: 0 }, 3, true)).toEqual({ page: 0, half: 1 })
    expect(nextPos({ page: 0, half: 1 }, 3, true)).toEqual({ page: 1, half: 0 })
    expect(prevPos({ page: 1, half: 0 }, true)).toEqual({ page: 0, half: 1 })
    expect(prevPos({ page: 0, half: 1 }, true)).toEqual({ page: 0, half: 0 })
  })
  it('半ページめくりなしではページ単位', () => {
    expect(nextPos({ page: 0, half: 0 }, 3, false)).toEqual({ page: 1, half: 0 })
    expect(prevPos({ page: 1, half: 0 }, false)).toEqual({ page: 0, half: 0 })
  })
  it('両端で止まる', () => {
    expect(nextPos({ page: 2, half: 0 }, 3, true)).toEqual({ page: 2, half: 0 })
    expect(prevPos({ page: 0, half: 0 }, true)).toEqual({ page: 0, half: 0 })
  })
})

describe('pageDuration', () => {
  it('16小節・4拍子・120BPM は 32 秒', () => {
    expect(pageDuration(16, 4, 120)).toBe(32)
  })
})

describe('tick', () => {
  const timing = () => ({ duration: 10, halfAt: 6 })
  const start: Clock = { pos: { page: 0, half: 0 }, elapsed: 0, finished: false }

  it('halfAt を過ぎると半ページめくる', () => {
    expect(tick(start, 5.9, timing, 3, true).pos).toEqual({ page: 0, half: 0 })
    expect(tick(start, 6.1, timing, 3, true).pos).toEqual({ page: 0, half: 1 })
  })
  it('ページ終わりで次ページへ進み、余りを持ち越す', () => {
    const c = tick(start, 10.5, timing, 3, true)
    expect(c.pos).toEqual({ page: 1, half: 0 })
    expect(c.elapsed).toBeCloseTo(0.5)
  })
  it('半ページめくりなしでは half にならない', () => {
    expect(tick(start, 9, timing, 3, false).pos).toEqual({ page: 0, half: 0 })
  })
  it('最終ページでは半ページめくりせず、終わりで finished', () => {
    const lastPage: Clock = { pos: { page: 2, half: 0 }, elapsed: 0, finished: false }
    expect(tick(lastPage, 9, timing, 3, true).pos).toEqual({ page: 2, half: 0 })
    expect(tick(lastPage, 11, timing, 3, true)).toEqual({ pos: { page: 2, half: 0 }, elapsed: 10, finished: true })
  })
  it('大きな dt でも複数ページをまたげる', () => {
    const c = tick(start, 21, timing, 5, false)
    expect(c.pos.page).toBe(2)
    expect(c.elapsed).toBeCloseTo(1)
  })
  it('dt=0 で経過時間に応じた half を求められる', () => {
    const c = tick({ pos: { page: 0, half: 0 }, elapsed: 7, finished: false }, 0, timing, 3, true)
    expect(c.pos).toEqual({ page: 0, half: 1 })
  })
})

describe('clockForPos', () => {
  it('half=1 へ移動したら halfAt に合わせる', () => {
    expect(clockForPos({ page: 1, half: 1 }, { duration: 10, halfAt: 4 }).elapsed).toBe(4)
    expect(clockForPos({ page: 1, half: 0 }, { duration: 10, halfAt: 4 }).elapsed).toBe(0)
  })
})
