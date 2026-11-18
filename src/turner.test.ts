import { describe, expect, it } from 'vitest'
import { HALF_POINT, nextPos, pageDuration, prevPos, tick, type Clock } from './turner'

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
  const dur = () => 10
  const start: Clock = { pos: { page: 0, half: 0 }, elapsed: -2, finished: false }

  it('カウントイン中はめくらない', () => {
    expect(tick(start, 1, dur, 3, true)).toEqual({ pos: { page: 0, half: 0 }, elapsed: -1, finished: false })
  })
  it('HALF_POINT を過ぎると半ページめくる', () => {
    const c = tick(start, 2 + 10 * HALF_POINT + 0.01, dur, 3, true)
    expect(c.pos).toEqual({ page: 0, half: 1 })
  })
  it('ページ終わりで次ページへ進み、余りを持ち越す', () => {
    const c = tick(start, 2 + 10.5, dur, 3, true)
    expect(c.pos).toEqual({ page: 1, half: 0 })
    expect(c.elapsed).toBeCloseTo(0.5)
  })
  it('半ページめくりなしでは half にならない', () => {
    expect(tick(start, 2 + 9, dur, 3, false).pos).toEqual({ page: 0, half: 0 })
  })
  it('最終ページでは半ページめくりせず、終わりで finished', () => {
    const lastPage: Clock = { pos: { page: 2, half: 0 }, elapsed: 0, finished: false }
    expect(tick(lastPage, 9, dur, 3, true).pos).toEqual({ page: 2, half: 0 })
    expect(tick(lastPage, 11, dur, 3, true)).toEqual({ pos: { page: 2, half: 0 }, elapsed: 10, finished: true })
  })
  it('大きな dt でも複数ページをまたげる', () => {
    const c = tick(start, 2 + 21, dur, 5, false)
    expect(c.pos.page).toBe(2)
    expect(c.elapsed).toBeCloseTo(1)
  })
})
