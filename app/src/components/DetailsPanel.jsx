import { useMemo } from 'react'
import { fs } from '../fileExplorer'

// `version` makes this re-read the SDK whenever the file system changes.
export default function DetailsPanel({ selectedId, version }) {
  const details = useMemo(() => {
    const item = selectedId ? fs.getItem(selectedId) : null
    if (!item) return null
    return { item, path: fs.getPath(item.id).join(' / ') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, version])

  return (
    <section className="panel">
      <h3>Details</h3>
      {!details ? (
        <p className="muted">Select a file or folder.</p>
      ) : (
        <dl>
          <dt>Name</dt><dd>{details.item.name}</dd>
          <dt>Type</dt><dd>{details.item.type}</dd>
          <dt>Path</dt><dd>{details.path}</dd>
          <dt>ID</dt><dd className="mono">{details.item.id}</dd>
          {details.item.type === 'folder' && (
            <>
              <dt>Items inside</dt><dd>{details.item.childIds.length}</dd>
            </>
          )}
        </dl>
      )}
    </section>
  )
}
