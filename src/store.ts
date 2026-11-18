import { del, get, set } from 'idb-keyval'

export interface ScoreSettings {
  bpm: number
  beatsPerBar: number
  /** 小節数を個別指定していないページに使う値 */
  defaultBars: number
  /** ページ番号(0始まり) → そのページの小節数 */
  barsByPage: Record<number, number>
  halfTurn: boolean
  metronome: boolean
  lastPage: number
}

export interface ScoreMeta {
  id: string
  name: string
  kind: 'pdf' | 'images'
  addedAt: number
  settings: ScoreSettings
}

export const defaultSettings: ScoreSettings = {
  bpm: 60,
  beatsPerBar: 4,
  defaultBars: 16,
  barsByPage: {},
  halfTurn: true,
  metronome: false,
  lastPage: 0,
}

const LIST_KEY = 'scores'
const filesKey = (id: string) => `files:${id}`

export async function listScores(): Promise<ScoreMeta[]> {
  return (await get<ScoreMeta[]>(LIST_KEY)) ?? []
}

export async function addScore(files: File[]): Promise<ScoreMeta> {
  const isPdf = files[0].type === 'application/pdf' || /\.pdf$/i.test(files[0].name)
  const picked = isPdf
    ? [files[0]]
    : [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  const meta: ScoreMeta = {
    id: crypto.randomUUID(),
    name: files[0].name.replace(/\.[^.]+$/, ''),
    kind: isPdf ? 'pdf' : 'images',
    addedAt: Date.now(),
    settings: { ...defaultSettings },
  }
  await set(filesKey(meta.id), picked as Blob[])
  await set(LIST_KEY, [meta, ...(await listScores())])
  return meta
}

export async function loadFiles(id: string): Promise<Blob[]> {
  return (await get<Blob[]>(filesKey(id))) ?? []
}

export async function saveSettings(id: string, settings: ScoreSettings): Promise<void> {
  const list = await listScores()
  await set(LIST_KEY, list.map((s) => (s.id === id ? { ...s, settings } : s)))
}

export async function removeScore(id: string): Promise<void> {
  await set(LIST_KEY, (await listScores()).filter((s) => s.id !== id))
  await del(filesKey(id))
}
