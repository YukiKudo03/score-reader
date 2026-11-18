import { del, get, set } from 'idb-keyval'
import type { System } from './layout'

export interface ScoreSettings {
  bpm: number
  beatsPerBar: number
  /** 小節数を個別指定していないページに使う値 */
  defaultBars: number
  /** ページ番号(0始まり) → そのページの小節数 */
  barsByPage: Record<number, number>
  /** ページ番号(0始まり) → 段マーク(上から順)。あるページでは小節数はここから求める */
  systems: Record<number, System[]>
  halfTurn: boolean
  metronome: boolean
  /** マイクで演奏を聴き、弾いている間だけ進める */
  listen: boolean
  /** 音が消えてから「止まった」と判断するまでの拍数 */
  holdBeats: number
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
  systems: {},
  halfTurn: true,
  metronome: false,
  listen: false,
  holdBeats: 2,
  lastPage: 0,
}

const LIST_KEY = 'scores'
const filesKey = (id: string) => `files:${id}`

export async function listScores(): Promise<ScoreMeta[]> {
  const list = (await get<ScoreMeta[]>(LIST_KEY)) ?? []
  // 旧バージョンで保存した楽譜に、後から増えた設定項目を補う
  return list.map((s) => ({ ...s, settings: { ...defaultSettings, ...s.settings } }))
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
