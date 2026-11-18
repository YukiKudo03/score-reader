import { describe, expect, it } from 'vitest'
import {
  addSystem,
  halfFraction,
  nearestSystem,
  pageBars,
  pageTiming,
  splitY,
  systemAtFraction,
  systemStartFraction,
  type System,
} from './layout'
import { defaultSettings } from './store'

const five: System[] = [0.1, 0.3, 0.5, 0.7, 0.9].map((y) => ({ y, bars: 4 }))
const four: System[] = [0.15, 0.4, 0.6, 0.85].map((y) => ({ y, bars: 4 }))

describe('splitY', () => {
  it('段マークがなければ中央', () => {
    expect(splitY(undefined)).toBe(0.5)
    expect(splitY([{ y: 0.3, bars: 4 }])).toBe(0.5)
  })
  it('中央に最も近い段間に置く', () => {
    expect(splitY(four)).toBeCloseTo(0.5)
    // 5段だと中央の段を横切らないよう、2段目と3段目の間(0.4)になる
    expect(splitY(five)).toBeCloseTo(0.4)
  })
})

describe('halfFraction', () => {
  it('分割線より下の段に入って半小節後', () => {
    expect(halfFraction(four)).toBeCloseTo(8.5 / 16)
    expect(halfFraction(five)).toBeCloseTo(8.5 / 20)
  })
  it('段マークがなければ既定値', () => {
    expect(halfFraction(undefined)).toBe(0.6)
  })
})

describe('段と進み具合の対応', () => {
  const uneven: System[] = [
    { y: 0.2, bars: 2 },
    { y: 0.5, bars: 6 },
    { y: 0.8, bars: 2 },
  ]
  it('systemStartFraction', () => {
    expect(systemStartFraction(uneven, 0)).toBe(0)
    expect(systemStartFraction(uneven, 1)).toBe(0.2)
    expect(systemStartFraction(uneven, 2)).toBe(0.8)
  })
  it('systemAtFraction', () => {
    expect(systemAtFraction(uneven, 0)).toBe(0)
    expect(systemAtFraction(uneven, 0.19)).toBe(0)
    expect(systemAtFraction(uneven, 0.2)).toBe(1)
    expect(systemAtFraction(uneven, 0.79)).toBe(1)
    expect(systemAtFraction(uneven, 1)).toBe(2)
  })
  it('nearestSystem', () => {
    expect(nearestSystem(uneven, 0.05)).toBe(0)
    expect(nearestSystem(uneven, 0.6)).toBe(1)
    expect(nearestSystem(uneven, 0.99)).toBe(2)
  })
})

describe('addSystem', () => {
  it('位置順に並べ、小節数は近い段にそろえる', () => {
    const s = addSystem([{ y: 0.2, bars: 5 }, { y: 0.8, bars: 3 }], 0.7)
    expect(s).toEqual([{ y: 0.2, bars: 5 }, { y: 0.7, bars: 3 }, { y: 0.8, bars: 3 }])
  })
  it('最初の段は4小節', () => {
    expect(addSystem([], 0.3)).toEqual([{ y: 0.3, bars: 4 }])
  })
})

describe('pageBars / pageTiming', () => {
  it('段マークがあればその合計を使う', () => {
    const s = { ...defaultSettings, bpm: 120, systems: { 1: four }, barsByPage: { 1: 99, 2: 8 } }
    expect(pageBars(s, 0)).toBe(16)
    expect(pageBars(s, 1)).toBe(16)
    expect(pageBars(s, 2)).toBe(8)
    expect(pageTiming(s, 1)).toEqual({ duration: 32, halfAt: 17 })
    expect(pageTiming(s, 2)).toEqual({ duration: 16, halfAt: 16 * 0.6 })
  })
})
