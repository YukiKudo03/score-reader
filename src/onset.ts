// マイク入力から音の立ち上がりを検出する(スペクトルフラックス法)

export interface MicFrame {
  /** このフレームで新しい音が鳴り始めた */
  onset: boolean
  /** 音がまだ鳴っている(減衰しきっていない) */
  sounding: boolean
}

const MIN_RMS = 0.003
const REFRACTORY_MS = 90
const HISTORY = 45

export class OnsetDetector {
  private prev: Float32Array | null = null
  private history: number[] = []
  private floor = Infinity
  private peak = 0
  private lastOnset = -Infinity
  private readonly lo: number
  private readonly hi: number

  constructor(sampleRate: number, fftSize: number) {
    const bin = (hz: number) => Math.round((hz * fftSize) / sampleRate)
    this.lo = bin(60)
    this.hi = Math.min(bin(5000), fftSize / 2 - 1)
  }

  /**
   * @param db 周波数ごとの大きさ(dB)。AnalyserNode.getFloatFrequencyData の出力
   * @param wave 時間波形。AnalyserNode.getFloatTimeDomainData の出力
   */
  push(db: Float32Array, wave: Float32Array, nowMs: number): MicFrame {
    let sq = 0
    for (let i = 0; i < wave.length; i++) sq += wave[i] * wave[i]
    const rms = Math.sqrt(sq / wave.length)
    // 周囲の雑音レベル: 小さい方へはすぐ、大きい方へはゆっくり追従
    this.floor = Math.min(rms, this.floor * 1.002 + 1e-7)

    const mags = new Float32Array(this.hi - this.lo + 1)
    let total = 0
    let flux = 0
    for (let i = 0; i < mags.length; i++) {
      const d = db[this.lo + i]
      const m = Number.isFinite(d) ? 10 ** (d / 20) : 0
      mags[i] = m
      total += m
      if (this.prev && m > this.prev[i]) flux += m - this.prev[i]
    }
    const hadPrev = this.prev !== null
    this.prev = mags

    const mean = this.history.length ? this.history.reduce((a, b) => a + b, 0) / this.history.length : 0
    this.history.push(flux)
    if (this.history.length > HISTORY) this.history.shift()

    const loud = rms > Math.max(MIN_RMS, this.floor * 3)
    const onset =
      hadPrev && loud && flux > mean * 2.5 && flux > total * 0.12 && nowMs - this.lastOnset > REFRACTORY_MS
    if (onset) {
      this.lastOnset = nowMs
      this.peak = rms
    } else if (nowMs - this.lastOnset < 150) {
      this.peak = Math.max(this.peak, rms)
    }
    const sounding = rms > Math.max(MIN_RMS, this.floor * 3, this.peak * 0.15)
    return { onset, sounding }
  }
}
