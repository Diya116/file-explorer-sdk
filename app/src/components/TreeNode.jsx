import { memo } from 'react'

const subtreeIds = (node, out = new Set()) => {
  out.add(node.id)
  node.children?.forEach((c) => subtreeIds(c, out))
  return out
}

// Ids whose membership differs between two Sets.
const diff = (a, b) => {
  if (a === b) return []
  return [...a].filter((id) => !b.has(id)).concat([...b].filter((id) => !a.has(id)))
}

// A node only needs to re-render if a changed id lives inside its own subtree.
const affects = (node, ids) => {
  if (ids.length === 0) return false
  const inside = subtreeIds(node)
  return ids.some((id) => inside.has(id))
}

function areEqual(prev, next) {
  if (
    prev.node !== next.node || // SDK reuses this object when nothing below changed
    prev.depth !== next.depth ||
    prev.onToggle !== next.onToggle ||
    prev.onSelect !== next.onSelect ||
    prev.onCheck !== next.onCheck
  ) {
    return false
  }
  const selection = prev.selectedId === next.selectedId ? [] : [prev.selectedId, next.selectedId].filter(Boolean)
  return (
    !affects(next.node, diff(prev.expanded, next.expanded)) &&
    !affects(next.node, diff(prev.checked, next.checked)) &&
    !affects(next.node, selection)
  )
}

function TreeNodeBase({ node, depth, expanded, selectedId, checked, onToggle, onSelect, onCheck }) {
  console.log('render TreeNode:', node.name)

  const isFolder = node.type === 'folder'
  const isOpen = isFolder && expanded.has(node.id)

  return (
    <li>
      <div className={`row${selectedId === node.id ? ' selected' : ''}`} style={{ paddingLeft: depth * 16 }}>
        {depth > 0 ? (
          <input
            type="checkbox"
            aria-label={`Select ${node.name}`}
            checked={checked.has(node.id)}
            onChange={() => onCheck(node.id)}
          />
        ) : (
          <span className="spacer" />
        )}
        {isFolder ? (
          <button className="twisty" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => onToggle(node.id)}>
            {isOpen ? '▼' : '▶'}
          </button>
        ) : (
          <span className="spacer" />
        )}
        <span className="label" onClick={() => onSelect(node.id)}>
          {isFolder ? '📁' : '📄'} {node.name}
        </span>
      </div>
      {isOpen && node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selectedId={selectedId}
              checked={checked}
              onToggle={onToggle}
              onSelect={onSelect}
              onCheck={onCheck}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

const TreeNode = memo(TreeNodeBase, areEqual)
export default TreeNode
