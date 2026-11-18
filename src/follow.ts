// 「弾いているか、止まっているか」の判定(時計・マイクに依存しない)

export interface GateStep {
  playing: boolean
  /** onset: 音の立ち上がりがあった / stop: いま止まったと判断した */
  event: 'onset' | 'stop' | null
}

/**
 * 音の立ち上がり(onset)が続いている間は「演奏中」とみなす。
 * 立ち上がりが途切れても、音が鳴り続けていれば長い音符として待つ。
 */
export class PlayGate {
  private playing = false
  private lastOnset = -Infinity

  /**
   * @param now 現在時刻(秒)
   * @param holdSec 音が消えた状態で、最後の立ち上がりからこの秒数たてば停止
   * @param maxSec 音が鳴り続けていても、この秒数たてば停止
   */
  step(now: number, onset: boolean, sounding: boolean, holdSec: number, maxSec: number): GateStep {
    if (onset) {
      this.lastOnset = now
      this.playing = true
      return { playing: true, event: 'onset' }
    }
    if (!this.playing) return { playing: false, event: null }
    const since = now - this.lastOnset
    if ((since > holdSec && !sounding) || since > maxSec) {
      this.playing = false
      return { playing: false, event: 'stop' }
    }
    return { playing: true, event: null }
  }
}
