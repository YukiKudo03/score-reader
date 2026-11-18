import { describe, expect, it } from 'vitest'
import { PlayGate } from './follow'

describe('PlayGate', () => {
  it('最初の立ち上がりまでは待機', () => {
    const g = new PlayGate()
    expect(g.step(0, false, false, 1, 3)).toEqual({ playing: false, event: null })
    expect(g.step(0.1, false, true, 1, 3)).toEqual({ playing: false, event: null })
    expect(g.step(0.2, true, true, 1, 3)).toEqual({ playing: true, event: 'onset' })
  })
  it('音が消えて hold を過ぎると停止し、次の立ち上がりで再開', () => {
    const g = new PlayGate()
    g.step(0, true, true, 1, 3)
    expect(g.step(0.9, false, false, 1, 3).playing).toBe(true)
    expect(g.step(1.1, false, false, 1, 3)).toEqual({ playing: false, event: 'stop' })
    expect(g.step(1.2, false, false, 1, 3)).toEqual({ playing: false, event: null })
    expect(g.step(5, true, true, 1, 3)).toEqual({ playing: true, event: 'onset' })
  })
  it('音が鳴り続けていれば長い音符として待つが、max を過ぎたら停止', () => {
    const g = new PlayGate()
    g.step(0, true, true, 1, 3)
    expect(g.step(2.5, false, true, 1, 3).playing).toBe(true)
    expect(g.step(3.1, false, true, 1, 3)).toEqual({ playing: false, event: 'stop' })
  })
})
