import { useCallback, useEffect, useState } from 'react'
import { fs } from '../fileExplorer'

// Keep only ids that still exist. Returns the same Set when nothing was removed,
// so React skips the re-render.
const prune = (set) => {
  for (const id of set) {
    if (!fs.getItem(id)) return new Set([...set].filter((i) => fs.getItem(i)))
  }
  return set
}

const flip = (set, id) => {
  const next = new Set(set)
  if (!next.delete(id)) next.add(id)
  return next
}

/** All UI-only state. File data itself always comes from the SDK. */
export function useExplorerUI() {
  const [expanded, setExpanded] = useState(() => new Set([fs.getTree().id]))
  const [selectedId, setSelectedId] = useState(null)
  const [checked, setChecked] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  // One subscription: drop ids of deleted items from selection / expanded / checked.
  useEffect(
    () =>
      fs.subscribe(() => {
        setSelectedId((id) => (id && fs.getItem(id) ? id : null))
        setExpanded(prune)
        setChecked(prune)
      }),
    [],
  )

  const toggleExpanded = useCallback((id) => setExpanded((s) => flip(s, id)), [])
  const toggleChecked = useCallback((id) => setChecked((s) => flip(s, id)), [])
  const clearChecked = useCallback(() => setChecked(new Set()), [])
  const select = useCallback((id) => setSelectedId(id), [])
  const dismissError = useCallback(() => setError(null), [])

  // Select an item and open all its parent folders.
  const reveal = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (let cur = fs.getItem(id); cur?.parentId; cur = fs.getItem(cur.parentId)) next.add(cur.parentId)
      return next
    })
    setSelectedId(id)
  }, [])

  // Run an SDK action with pending + error handling. Accepts sync or async actions.
  const run = useCallback(async (action) => {
    setPending(true)
    setError(null)
    try {
      return { ok: true, value: await action() }
    } catch (e) {
      setError(e.message ?? String(e))
      return { ok: false }
    } finally {
      setPending(false)
    }
  }, [])

  return {
    expanded, selectedId, checked, error, pending,
    toggleExpanded, toggleChecked, clearChecked, select, reveal, run, dismissError,
  }
}
