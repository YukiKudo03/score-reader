import { audioContext } from './metronome'
import { OnsetDetector, type MicFrame } from './onset'

export interface Mic {
  /** 描画フレームごとに呼び、直近の音を解析する */
  poll(nowMs: number): MicFrame
  close(): void
}

export async function openMic(): Promise<Mic> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('この環境ではマイクを使えません(HTTPS が必要です)')
  // 通話向けの加工は楽器音の立ち上がりを潰すので切る
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  const ctx = audioContext()
  const input = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 2048
  analyser.smoothingTimeConstant = 0
  input.connect(analyser)
  const detector = new OnsetDetector(ctx.sampleRate, analyser.fftSize)
  const db = new Float32Array(analyser.frequencyBinCount)
  const wave = new Float32Array(analyser.fftSize)
  return {
    poll(nowMs) {
      analyser.getFloatFrequencyData(db)
      analyser.getFloatTimeDomainData(wave)
      return detector.push(db, wave, nowMs)
    },
    close() {
      input.disconnect()
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}
