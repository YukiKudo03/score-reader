import { useEffect, useRef, useState } from 'react'
import { addScore, listScores, removeScore, type ScoreMeta } from './store'

export function Library({ onOpen }: { onOpen: (s: ScoreMeta) => void }) {
  const [scores, setScores] = useState<ScoreMeta[] | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const reload = () => listScores().then(setScores)
  useEffect(() => {
    void reload()
  }, [])

  async function onFiles(files: FileList | null) {
    if (!files?.length) return
    await addScore([...files])
    if (input.current) input.current.value = ''
    await reload()
  }

  async function onDelete(s: ScoreMeta) {
    if (!confirm(`「${s.name}」を削除しますか?`)) return
    await removeScore(s.id)
    await reload()
  }

  return (
    <div className="library">
      <header>
        <h1>Score Reader</h1>
        <button className="primary" onClick={() => input.current?.click()}>
          楽譜を追加
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/*"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </header>

      {scores?.length === 0 && (
        <p className="empty">
          PDF、または楽譜の画像(複数選択するとファイル名順に1ページずつ)を追加してください。
          <br />
          楽譜はこの端末の中だけに保存されます。
        </p>
      )}

      <ul>
        {scores?.map((s) => (
          <li key={s.id}>
            <button className="score" onClick={() => onOpen(s)}>
              <span className="name">{s.name}</span>
              <span className="sub">
                {s.kind === 'pdf' ? 'PDF' : '画像'}・♩={s.settings.bpm}
              </span>
            </button>
            <button className="delete" aria-label={`${s.name} を削除`} onClick={() => void onDelete(s)}>
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
