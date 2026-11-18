import { useCallback, useEffect, useRef, useState } from 'react'
import { PlayGate } from './follow'
import {
  addSystem,
  nearestSystem,
  pageBars,
  pageTiming,
  splitY,
  systemAtFraction,
  systemStartFraction,
  type System,
} from './layout'
import { MarkLayer, type Rect } from './MarkLayer'
import { audioContext, click } from './metronome'
import { openMic, type Mic } from './mic'
import { PageView } from './PageView'
import { openSource, type PageSource } from './source'
import { loadFiles, saveSettings, type ScoreMeta, type ScoreSettings } from './store'
import { clockForPos, nextPos, prevPos, tick, type Clock, type Pos } from './turner'

type Mode = 'manual' | 'tempo' | 'mark'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'])
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'])

export function Viewer({ score, onClose }: { score: ScoreMeta; onClose: () => void }) {
  const [source, setSource] = useState<PageSource | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<ScoreSettings>(score.settings)
  const [pos, setPos] = useState<Pos>({ page: score.settings.lastPage, half: 0 })
  const [mode, setMode] = useState<Mode>('manual')
  const [running, setRunning] = useState(false)
  const [count, setCount] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [curSys, setCurSys] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [aspect, setAspect] = useState<number | null>(null)

  const stage = useRef<HTMLDivElement>(null)
  const progress = useRef<HTMLDivElement>(null)
  const clock = useRef<Clock>({ pos, elapsed: 0, finished: false })
  /** 最後に音が立ち上がった時点の時計。止まったと判断したらここへ巻き戻す */
  const snapshot = useRef<Clock>(clock.current)
  const mic = useRef<Mic | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const pageCount = source?.pageCount ?? 0
  const timingOf = useCallback((page: number) => pageTiming(settingsRef.current, page), [])

  // 楽譜を開く
  useEffect(() => {
    let alive = true
    let opened: PageSource | null = null
    loadFiles(score.id)
      .then((files) => openSource(score.kind, files))
      .then((src) => {
        opened = src
        if (!alive) return src.destroy()
        const page = Math.min(score.settings.lastPage, src.pageCount - 1)
        clock.current = { pos: { page, half: 0 }, elapsed: 0, finished: false }
        setPos(clock.current.pos)
        setSource(src)
      })
      .catch((e) => alive && setError(String(e?.message ?? e)))
    return () => {
      alive = false
      opened?.destroy()
    }
  }, [score])

  // ステージの大きさに追従
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 現在ページの縦横比(段マークや分割線を重ねる位置の計算に使う)
  useEffect(() => {
    if (!source) return
    let alive = true
    void source.aspect(pos.page).then((a) => alive && setAspect(a))
    return () => {
      alive = false
    }
  }, [source, pos.page])

  // 練習中に画面が消えないようにする
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock?.request('screen').then(
        (l) => (lock = l),
        () => {},
      )
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      document.removeEventListener('visibilitychange', acquire)
      void lock?.release()
    }
  }, [])

  // 設定と最後に開いていたページを保存
  useEffect(() => {
    void saveSettings(score.id, { ...settings, lastPage: pos.page })
  }, [score.id, settings, pos.page])

  // マイクは画面を離れるときに必ず閉じる
  useEffect(() => () => mic.current?.close(), [])

  /** 時計の内容を画面(進行バー・現在の段)に反映する */
  const showClock = useCallback(() => {
    const c = clock.current
    const fraction = Math.max(0, Math.min(1, c.elapsed / timingOf(c.pos.page).duration))
    if (progress.current) progress.current.style.transform = `scaleX(${fraction})`
    const systems = settingsRef.current.systems[c.pos.page]
    setCurSys(systems?.length ? systemAtFraction(systems, fraction) : null)
  }, [timingOf])

  const setClock = useCallback(
    (c: Clock) => {
      clock.current = c
      snapshot.current = c
      setPos((p) => (p.page === c.pos.page && p.half === c.pos.half ? p : c.pos))
      showClock()
    },
    [showClock],
  )

  const moveTo = useCallback((p: Pos) => setClock(clockForPos(p, timingOf(p.page))), [setClock, timingOf])

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!pageCount) return
      const cur = clock.current.pos
      const half = settingsRef.current.halfTurn && mode !== 'mark'
      moveTo(dir === 1 ? nextPos(cur, pageCount, half) : prevPos(cur, half))
    },
    [pageCount, moveTo, mode],
  )

  /** 「いまここを弾いている」と段を指定して位置を合わせる */
  const jumpToSystem = useCallback(
    (page: number, index: number) => {
      const s = settingsRef.current
      const elapsed = systemStartFraction(s.systems[page], index) * timingOf(page).duration
      setClock(tick({ pos: { page, half: 0 }, elapsed, finished: false }, 0, timingOf, pageCount, s.halfTurn))
    },
    [setClock, timingOf, pageCount],
  )

  // 設定(テンポや段マーク)が変わったら表示を合わせ直す
  useEffect(showClock, [settings, showClock])

  // キーボード/Bluetooth譜めくりペダル(矢印キーや PageUp/Down を送る)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showSettings) return
      if (NEXT_KEYS.has(e.key)) go(1)
      else if (PREV_KEYS.has(e.key)) go(-1)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, showSettings])

  // テンポ進行
  useEffect(() => {
    if (!running || !pageCount) return
    const s0 = settingsRef.current
    const listening = mic.current !== null
    const gate = new PlayGate()
    const countInTotal = listening ? 0 : (s0.beatsPerBar * 60) / s0.bpm
    let countInLeft = countInTotal
    let lastBeat = ''
    let lastCount = 0
    let prev = performance.now()
    let raf = 0
    snapshot.current = clock.current

    const apply = (c: Clock) => {
      const before = clock.current.pos
      clock.current = c
      if (c.pos.page !== before.page || c.pos.half !== before.half) setPos(c.pos)
      showClock()
    }

    const frame = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.5)
      prev = now
      const s = settingsRef.current
      const beat = 60 / s.bpm
      raf = requestAnimationFrame(frame)

      if (countInLeft > 0) {
        countInLeft -= dt
        if (countInLeft > 0) {
          const n = Math.min(s0.beatsPerBar, Math.floor((countInTotal - countInLeft) / (60 / s0.bpm)) + 1)
          if (n !== lastCount) {
            lastCount = n
            setCount(n)
            click(n === 1)
          }
          return
        }
        setCount(null)
      }

      if (mic.current) {
        const heard = mic.current.poll(now)
        const g = gate.step(now / 1000, heard.onset, heard.sounding, s.holdBeats * beat, (s.holdBeats + s.beatsPerBar) * beat)
        if (g.event === 'onset') {
          snapshot.current = clock.current
          setPlaying(true)
        } else if (g.event === 'stop') {
          // 止まったのは最後の音の直後のはず。進みすぎた分を戻し、次の音を待つ
          apply(tick(snapshot.current, beat, timingOf, pageCount, s.halfTurn))
          setPlaying(false)
        }
        if (!g.playing) return
      }

      const c = tick(clock.current, dt, timingOf, pageCount, s.halfTurn)
      apply(c)

      const key = `${c.pos.page}:${Math.floor(c.elapsed / beat + 1e-6)}`
      if (key !== lastBeat) {
        lastBeat = key
        if (s.metronome && !listening && !c.finished) click(Math.floor(c.elapsed / beat + 1e-6) % s.beatsPerBar === 0)
      }

      if (c.finished) setRunning(false)
    }
    raf = requestAnimationFrame(frame)

    const onHide = () => document.hidden && setRunning(false)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onHide)
      setCount(null)
      setPlaying(false)
      mic.current?.close()
      mic.current = null
    }
  }, [running, pageCount, timingOf, showClock])

  async function togglePlay() {
    if (running) return setRunning(false)
    audioContext()
    if (settings.listen) {
      try {
        mic.current = await openMic()
      } catch (e) {
        alert(`マイクを使えませんでした: ${e instanceof Error ? e.message : e}`)
        return
      }
    }
    if (clock.current.finished) moveTo({ page: 0, half: 0 })
    setRunning(true)
  }

  function changeMode(m: Mode) {
    setMode(m)
    if (m !== 'tempo') setRunning(false)
    if (m === 'mark') moveTo({ page: clock.current.pos.page, half: 0 })
  }

  const update = (patch: Partial<ScoreSettings>) => setSettings((s) => ({ ...s, ...patch }))
  const setSystems = (page: number, systems: System[]) => update({ systems: { ...settings.systems, [page]: systems } })

  // 現在ページが画面上で占める範囲
  const pw = aspect ? Math.floor(Math.min(box.w, box.h * aspect)) : 0
  const ph = aspect ? Math.floor(pw / aspect) : 0
  const rect: Rect | null = pw ? { left: (box.w - pw) / 2, top: (box.h - ph) / 2, w: pw, h: ph } : null

  const systems = settings.systems[pos.page] ?? []
  const prevSystems = settings.systems[pos.page - 1] ?? []
  const split = splitY(settings.systems[pos.page])

  function onStageClick(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = rect ? (e.clientY - r.top - rect.top) / rect.h : 0.5

    if (mode === 'mark') {
      if (rect && y > 0 && y < 1) setSystems(pos.page, addSystem(systems, y))
      return
    }
    if (mode === 'tempo') {
      // 半ページめくり中は、分割線より上に見えているのは次のページ
      const page = pos.half === 1 && y < split ? pos.page + 1 : pos.page
      const target = settings.systems[page]
      if (target?.length) return jumpToSystem(page, nearestSystem(target, y))
    }
    go(x < r.width * 0.3 ? -1 : 1)
  }

  const pages = [pos.page - 1, pos.page, pos.page + 1].filter((i) => i >= 0 && i < pageCount)
  const marker = mode === 'tempo' && rect && curSys !== null && systems[curSys]

  return (
    <div className="viewer">
      <div className="stage" ref={stage} onClick={onStageClick}>
        {error && <p className="message">楽譜を開けませんでした: {error}</p>}
        {!source && !error && <p className="message">読み込み中…</p>}
        {source &&
          box.w > 0 &&
          pages.map((i) => (
            <PageView
              key={i}
              source={source}
              index={i}
              boxW={box.w}
              boxH={box.h}
              split={split}
              clip={i === pos.page ? 'full' : i === pos.page + 1 && pos.half === 1 ? 'top' : 'hidden'}
            />
          ))}
        {pos.half === 1 && <div className="divider" style={{ top: rect ? rect.top + split * rect.h : '50%' }} />}
        {marker && (
          <div
            className="cursor"
            data-testid="cursor"
            data-system={curSys}
            style={{ left: rect.left, top: rect.top + marker.y * rect.h, height: rect.h * 0.07 }}
          />
        )}
        {mode === 'mark' && rect && (
          <MarkLayer rect={rect} systems={systems} onChange={(s) => setSystems(pos.page, s)} />
        )}
        {mode === 'tempo' && (
          <div className="progress">
            <div ref={progress} />
          </div>
        )}
        {count !== null && <div className="count">{count}</div>}
      </div>

      {mode === 'mark' && (
        <div className="markbar">
          <span>
            各段の中央を上から順にタップし、小節数を合わせてください({systems.length}段・
            {pageBars(settings, pos.page)}小節)
          </span>
          {systems.length === 0 && prevSystems.length > 0 && (
            <button onClick={() => setSystems(pos.page, prevSystems)}>前のページと同じにする</button>
          )}
          {systems.length > 0 && <button onClick={() => setSystems(pos.page, [])}>このページを消去</button>}
        </div>
      )}

      <footer className="toolbar">
        <button onClick={onClose}>一覧</button>
        <span className="pager">
          <button aria-label="前へ" onClick={() => go(-1)}>
            ‹
          </button>
          <span className="pageno" data-testid="pageno">
            {pageCount ? `${pos.page + 1}${pos.half ? '→' + (pos.page + 2) : ''} / ${pageCount}` : '-'}
          </span>
          <button aria-label="次へ" onClick={() => go(1)}>
            ›
          </button>
        </span>
        <div className="segmented" role="group" aria-label="モード">
          <button aria-pressed={mode === 'manual'} onClick={() => changeMode('manual')}>
            手動
          </button>
          <button aria-pressed={mode === 'tempo'} onClick={() => changeMode('tempo')}>
            自動
          </button>
          <button aria-pressed={mode === 'mark'} onClick={() => changeMode('mark')}>
            段マーク
          </button>
        </div>
        {mode === 'tempo' && (
          <>
            <button className="primary play" onClick={() => void togglePlay()} disabled={!pageCount}>
              {running ? '一時停止' : '開始'}
            </button>
            {running && settings.listen && (
              <span className="listen" data-testid="listen" data-playing={playing}>
                {playing ? '● 演奏中' : '○ 音を待っています'}
              </span>
            )}
            <Stepper label="♩=" value={settings.bpm} min={20} max={240} step={2} onChange={(bpm) => update({ bpm })} />
          </>
        )}
        <button onClick={() => setShowSettings(true)}>設定</button>
      </footer>

      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" role="dialog" aria-label="設定" onClick={(e) => e.stopPropagation()}>
            <h2>設定</h2>
            <Row label="テンポ (BPM)">
              <Stepper value={settings.bpm} min={20} max={240} step={1} onChange={(bpm) => update({ bpm })} />
            </Row>
            <Row label="1小節の拍数">
              <Stepper
                value={settings.beatsPerBar}
                min={1}
                max={12}
                step={1}
                onChange={(beatsPerBar) => update({ beatsPerBar })}
              />
            </Row>
            {systems.length > 0 ? (
              <Row label={`このページ(${pos.page + 1})の小節数`}>
                <span className="fixed">{pageBars(settings, pos.page)}(段マークより)</span>
              </Row>
            ) : (
              <Row label={`このページ(${pos.page + 1})の小節数`}>
                <Stepper
                  value={pageBars(settings, pos.page)}
                  min={1}
                  max={200}
                  step={1}
                  onChange={(bars) => update({ barsByPage: { ...settings.barsByPage, [pos.page]: bars } })}
                />
              </Row>
            )}
            <Row label="未設定ページの小節数">
              <Stepper
                value={settings.defaultBars}
                min={1}
                max={200}
                step={1}
                onChange={(defaultBars) => update({ defaultBars })}
              />
            </Row>
            <p className="hint">このページの所要時間: 約 {Math.round(pageTiming(settings, pos.page).duration)} 秒</p>
            <label className="check">
              <input type="checkbox" checked={settings.halfTurn} onChange={(e) => update({ halfTurn: e.target.checked })} />
              <span>
                半ページめくり
                <small>下側を弾いている間に、上側だけ先に次のページへ差し替えます</small>
              </span>
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.listen} onChange={(e) => update({ listen: e.target.checked })} />
              <span>
                演奏を聴いて進む(マイク)
                <small>弾き始めると進み、音が止まると待ちます。カウントとメトロノーム音は鳴りません</small>
              </span>
            </label>
            {settings.listen ? (
              <Row label="止まったと判断するまでの拍数">
                <Stepper
                  value={settings.holdBeats}
                  min={1}
                  max={8}
                  step={1}
                  onChange={(holdBeats) => update({ holdBeats })}
                />
              </Row>
            ) : (
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.metronome}
                  onChange={(e) => update({ metronome: e.target.checked })}
                />
                <span>
                  メトロノーム音
                  <small>開始前の1小節のカウントは常に鳴ります</small>
                </span>
              </label>
            )}
            <button className="primary" onClick={() => setShowSettings(false)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <span>{label}</span>
      {children}
    </div>
  )
}

function Stepper(props: {
  label?: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  const { label, value, min, max, step, onChange } = props
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)))
  return (
    <span className="stepper">
      <button aria-label="減らす" onClick={() => set(value - step)}>
        −
      </button>
      <output>
        {label}
        {value}
      </output>
      <button aria-label="増やす" onClick={() => set(value + step)}>
        +
      </button>
    </span>
  )
}
