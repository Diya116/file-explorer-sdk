// Cache: internal node object -> { children, tree }
const cache = new WeakMap()

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

// Folders first, then alphabetical (case-insensitive, "file2" before "file10")
function compareNodes(a, b) {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return collator.compare(a.name, b.name)
}

// Same length and every item is the identical object
function sameItems(a, b) {
  if (a === undefined || b === undefined) return a === b
  return a.length === b.length && a.every((item, i) => item === b[i])
}

export function buildTree(state, id = state.rootId) {
  const node = state.nodes.get(id)

  // Build children first (recursion). Files have no children.
  let children
  if (node.type === 'folder') {
    children = node.childIds
      .map((childId) => state.nodes.get(childId))
      .sort(compareNodes)
      .map((child) => buildTree(state, child.id))
  }

  // Nothing changed here or below? Reuse the previous tree object.
  const hit = cache.get(node)
  if (hit && sameItems(hit.children, children)) return hit.tree

  const tree = { id: node.id, name: node.name, type: node.type, parentId: node.parentId }
  if (children) tree.children = Object.freeze(children)
  Object.freeze(tree)

  cache.set(node, { children, tree })
  return tree
}
