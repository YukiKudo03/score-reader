import { useCallback, useEffect, useRef, useState } from 'react'
import { click, unlockAudio } from './metronome'
import { PageView } from './PageView'
import { openSource, type PageSource } from './source'
import { loadFiles, saveSettings, type ScoreMeta, type ScoreSettings } from './store'
import { elapsedForPos, nextPos, pageDuration, prevPos, tick, type Clock, type Pos } from './turner'

type Mode = 'manual' | 'tempo'

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
  const [showSettings, setShowSettings] = useState(false)
  const [box, setBox] = useState({ w: 0, h: 0 })

  const stage = useRef<HTMLDivElement>(null)
  const progress = useRef<HTMLDivElement>(null)
  const clock = useRef<Clock>({ pos, elapsed: 0, finished: false })
  const countInLeft = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const pageCount = source?.pageCount ?? 0
  const barsOf = (page: number, s = settingsRef.current) => s.barsByPage[page] ?? s.defaultBars
  const durationOf = useCallback((page: number) => {
    const s = settingsRef.current
    return pageDuration(s.barsByPage[page] ?? s.defaultBars, s.beatsPerBar, s.bpm)
  }, [])

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

  const showProgress = useCallback(() => {
    if (!progress.current) return
    const c = clock.current
    const ratio = Math.max(0, Math.min(1, c.elapsed / durationOf(c.pos.page)))
    progress.current.style.transform = `scaleX(${ratio})`
  }, [durationOf])

  const moveTo = useCallback(
    (p: Pos) => {
      clock.current = { pos: p, elapsed: elapsedForPos(p, durationOf(p.page)), finished: false }
      setPos(p)
      showProgress()
    },
    [durationOf, showProgress],
  )

  const go = useCallback(
    (dir: 1 | -1) => {
      if (!pageCount) return
      const cur = clock.current.pos
      const half = settingsRef.current.halfTurn
      moveTo(dir === 1 ? nextPos(cur, pageCount, half) : prevPos(cur, half))
    },
    [pageCount, moveTo],
  )

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
    const countInTotal = (s0.beatsPerBar * 60) / s0.bpm
    countInLeft.current = countInTotal
    let lastBeat = ''
    let lastCount = 0
    let prev = performance.now()
    let raf = 0

    const frame = (now: number) => {
      const dt = Math.min((now - prev) / 1000, 0.5)
      prev = now
      const s = settingsRef.current
      const beat = 60 / s.bpm

      if (countInLeft.current > 0) {
        countInLeft.current -= dt
        const n = Math.min(s0.beatsPerBar, Math.floor((countInTotal - countInLeft.current) / (60 / s0.bpm)) + 1)
        if (countInLeft.current > 0) {
          if (n !== lastCount) {
            lastCount = n
            setCount(n)
            click(n === 1)
          }
          raf = requestAnimationFrame(frame)
          return
        }
        setCount(null)
      }

      const before = clock.current.pos
      const c = tick(clock.current, dt, durationOf, pageCount, s.halfTurn)
      clock.current = c
      if (c.pos.page !== before.page || c.pos.half !== before.half) setPos(c.pos)
      showProgress()

      const idx = Math.floor(c.elapsed / beat + 1e-6)
      const key = `${c.pos.page}:${idx}`
      if (key !== lastBeat) {
        lastBeat = key
        if (s.metronome && !c.finished) click(idx % s.beatsPerBar === 0)
      }

      if (c.finished) setRunning(false)
      else raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const onHide = () => document.hidden && setRunning(false)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onHide)
      setCount(null)
    }
  }, [running, pageCount, durationOf, showProgress])

  function togglePlay() {
    if (running) return setRunning(false)
    unlockAudio()
    if (clock.current.finished) moveTo({ page: 0, half: 0 })
    setRunning(true)
  }

  function changeMode(m: Mode) {
    setMode(m)
    if (m === 'manual') setRunning(false)
  }

  function onStageClick(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect()
    go(e.clientX - r.left < r.width * 0.3 ? -1 : 1)
  }

  const update = (patch: Partial<ScoreSettings>) => setSettings((s) => ({ ...s, ...patch }))
  const pages = [pos.page - 1, pos.page, pos.page + 1].filter((i) => i >= 0 && i < pageCount)

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
              clip={i === pos.page ? 'full' : i === pos.page + 1 && pos.half === 1 ? 'top' : 'hidden'}
            />
          ))}
        {pos.half === 1 && <div className="divider" />}
        {mode === 'tempo' && (
          <div className="progress">
            <div ref={progress} />
          </div>
        )}
        {count !== null && <div className="count">{count}</div>}
      </div>

      <footer className="toolbar">
        <button onClick={onClose}>一覧</button>
        <span className="pageno" data-testid="pageno">
          {pageCount ? `${pos.page + 1}${pos.half ? '→' + (pos.page + 2) : ''} / ${pageCount}` : '-'}
        </span>
        <div className="segmented" role="group" aria-label="めくり方式">
          <button aria-pressed={mode === 'manual'} onClick={() => changeMode('manual')}>
            手動
          </button>
          <button aria-pressed={mode === 'tempo'} onClick={() => changeMode('tempo')}>
            テンポ
          </button>
        </div>
        {mode === 'tempo' && (
          <>
            <button className="primary play" onClick={togglePlay} disabled={!pageCount}>
              {running ? '一時停止' : '開始'}
            </button>
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
            <Row label={`このページ(${pos.page + 1})の小節数`}>
              <Stepper
                value={barsOf(pos.page, settings)}
                min={1}
                max={200}
                step={1}
                onChange={(bars) => update({ barsByPage: { ...settings.barsByPage, [pos.page]: bars } })}
              />
            </Row>
            <Row label="未設定ページの小節数">
              <Stepper
                value={settings.defaultBars}
                min={1}
                max={200}
                step={1}
                onChange={(defaultBars) => update({ defaultBars })}
              />
            </Row>
            <p className="hint">
              このページの所要時間: 約{' '}
              {Math.round(pageDuration(barsOf(pos.page, settings), settings.beatsPerBar, settings.bpm))} 秒
            </p>
            <label className="check">
              <input type="checkbox" checked={settings.halfTurn} onChange={(e) => update({ halfTurn: e.target.checked })} />
              <span>
                半ページめくり
                <small>下半分を弾いている間に、上半分だけ先に次のページへ差し替えます</small>
              </span>
            </label>
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
