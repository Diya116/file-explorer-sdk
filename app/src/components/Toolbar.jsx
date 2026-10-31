import { useMemo, useState } from 'react'
import { fs } from '../fileExplorer'

// Flat list of every folder with its path, for the "Move to" dropdown.
function listFolders(node, path = [], out = []) {
  const here = [...path, node.name]
  out.push({ id: node.id, label: here.join(' / ') })
  node.children?.forEach((c) => c.type === 'folder' && listFolders(c, here, out))
  return out
}

export default function Toolbar({ tree, selectedId, checkedIds, pending, run, reveal, clearChecked }) {
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const folders = useMemo(() => listFolders(tree), [tree])
  const selected = selectedId ? fs.getItem(selectedId) : null

  // New items go into the selected folder, or next to the selected file, or into the root.
  const parentId = !selected ? tree.id : selected.type === 'folder' ? selected.id : selected.parentId

  const create = async (kind) => {
    const result = await run(() => (kind === 'file' ? fs.createFile(parentId, name) : fs.createFolder(parentId, name)))
    if (result.ok) {
      setName('')
      reveal(result.value)
    }
  }
  const rename = async () => {
    const result = await run(() => fs.rename(selectedId, name))
    if (result.ok) setName('')
  }
  const move = () => run(() => fs.move(selectedId, target))
  const remove = () => run(() => fs.delete(selectedId))
  const removeChecked = async () => {
    const result = await run(() => fs.deleteMany(checkedIds))
    if (result.ok) clearChecked() // on failure the selection stays
  }

  const noName = !name.trim()
  const count = checkedIds.length
  return (
    <section className="panel">
      <div className="toolbar-row">
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" />
        <button disabled={pending || noName} onClick={() => create('file')}>New file</button>
        <button disabled={pending || noName} onClick={() => create('folder')}>New folder</button>
        <button disabled={pending || noName || !selected} onClick={rename}>Rename</button>
      </div>
      <div className="toolbar-row">
        <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move to">
          <option value="">Move to…</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
        <button disabled={pending || !selected || !target} onClick={move}>Move</button>
        <button disabled={pending || !selected} onClick={remove}>Delete</button>
      </div>
      <div className="toolbar-row">
        <strong>{count} selected</strong>
        <button disabled={pending || count === 0} onClick={removeChecked}>Delete selected</button>
        <button disabled={count === 0} onClick={clearChecked}>Clear</button>
      </div>
    </section>
  )
}
