import { useState } from 'react'
import { Library } from './Library'
import { Viewer } from './Viewer'
import type { ScoreMeta } from './store'

export function App() {
  const [open, setOpen] = useState<ScoreMeta | null>(null)
  return open ? <Viewer score={open} onClose={() => setOpen(null)} /> : <Library onOpen={setOpen} />
}
