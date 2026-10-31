import { useMemo, useState } from 'react'
import { fs } from '../fileExplorer'

const PAGE_SIZE = 5

export default function SearchPanel({ version, onPick }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [order, setOrder] = useState('asc')
  const [page, setPage] = useState(1)

  // Re-run on every SDK change (version) so results never go stale.
  const { result, error } = useMemo(() => {
    try {
      return { result: fs.search({ query, type, sortBy, order, page, pageSize: PAGE_SIZE }), error: null }
    } catch (e) {
      return { result: null, error: e.message }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type, sortBy, order, page, version])

  // Changing any filter goes back to page 1.
  const set = (setter) => (e) => {
    setter(e.target.value)
    setPage(1)
  }

  return (
    <section className="panel">
      <h3>Search</h3>
      <div className="toolbar-row">
        <input placeholder="Search…" value={query} onChange={set(setQuery)} aria-label="Search" />
        <select value={type} onChange={set(setType)} aria-label="Type filter">
          <option value="all">All</option>
          <option value="file">Files</option>
          <option value="folder">Folders</option>
        </select>
        <select value={sortBy} onChange={set(setSortBy)} aria-label="Sort by">
          <option value="name">Name</option>
          <option value="type">Type</option>
          <option value="path">Path</option>
        </select>
        <select value={order} onChange={set(setOrder)} aria-label="Order">
          <option value="asc">Asc</option>
          <option value="desc">Desc</option>
        </select>
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && !query.trim() && <p className="muted">Type to search.</p>}
      {result && query.trim() && result.total === 0 && <p className="muted">No results.</p>}
      {result && result.items.length > 0 && (
        <>
          <ul className="results">
            {result.items.map((r) => (
              <li key={r.id}>
                <button className="link" onClick={() => onPick(r.id)}>
                  {r.type === 'folder' ? '📁' : '📄'} {r.name}
                </button>
                <small>{r.type} · {r.location}</small>
              </li>
            ))}
          </ul>
          <div className="toolbar-row">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span>Page {result.page} / {result.totalPages} ({result.total} results)</span>
            <button disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </section>
  )
}
