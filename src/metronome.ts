let ctx: AudioContext | null = null

/** ユーザー操作(開始ボタン)の中で最初に呼ぶこと。iOS では操作起点でないと音が出ない */
export function audioContext(): AudioContext {
  ctx ??= new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function click(accent: boolean): void {
  if (!ctx) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = accent ? 1600 : 1000
  gain.gain.setValueAtTime(0.3, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + 0.06)
}
