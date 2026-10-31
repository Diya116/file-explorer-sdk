import { ErrorCodes, FileExplorerError } from './error.js'

// ---------------------------------------------------------------------------
// HOW THE DATA IS STORED
//
// The whole file tree lives in one "state" object:
//   state = { nodes: Map(id -> node), rootId }
//
// Each node (a file or a folder) looks like:
//   { id, name, type: 'file' | 'folder', parentId, childIds: [...] }
//
// DECISION: we use a flat Map and link nodes by id instead of nesting objects.
// Finding any item by id is then one lookup (O(1)), and renaming or moving
// an item never has to rebuild a deep tree.
//
// DECISION: we never edit a state in place. Every action (create, rename,
// move, delete) returns a NEW state and leaves the old one untouched.
// This makes undo/redo easy: just keep the old states around.
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 255

// Shortcut for making an error, so we don't repeat "new FileExplorerError" everywhere.
function fail(code, message, details) {
  return new FileExplorerError(code, message, details)
}

// Make a node. Object.freeze stops anyone from changing it by accident.
// DECISION: we copy childIds so the caller's array can't change our node later.
function makeNode({ id, name, type, parentId, childIds }) {
  return Object.freeze({ id, name, type, parentId, childIds: Object.freeze([...childIds]) })
}

// Make a state object (also frozen, for the same reason).
function makeState(nodes, rootId) {
  return Object.freeze({ nodes, rootId })
}

// Make a new state from an old one.
// 1. copy the Map  2. let `edit` change the COPY  3. wrap it in a new state
// The old state is never touched.
function changeState(state, edit) {
  const nodes = new Map(state.nodes)
  edit(nodes)
  return makeState(nodes, state.rootId)
}

// Small text like: folder "Documents" (used in change labels)
function describe(node) {
  return `${node.type} "${node.name}"`
}

// ---------------------------------------------------------------------------
// READING THE TREE
// ---------------------------------------------------------------------------

// Get a node by id. Throws NOT_FOUND if the id is missing or not a string.
export function getNode(state, id) {
  const node = typeof id === 'string' ? state.nodes.get(id) : undefined
  if (!node) throw fail(ErrorCodes.NOT_FOUND, `Item "${String(id)}" does not exist.`, { id })
  return node
}

// Is `id` somewhere inside `ancestorId`?
// How: start at `id` and keep stepping up to its parent.
// If we meet `ancestorId` on the way, the answer is yes.
// If we reach the top (the root has parentId null), the answer is no.
export function isDescendant(state, ancestorId, id) {
  let current = state.nodes.get(id)
  while (current && current.parentId !== null) {
    if (current.parentId === ancestorId) return true
    current = state.nodes.get(current.parentId)
  }
  return false
}

// Get the id of a node plus the ids of everything inside it (children,
// grandchildren, ...). Delete uses this to remove a whole folder.
// How: keep a "to visit" list. Take one, save it, add its children to the list.
// DECISION: a list instead of recursion, so very deep folders can't crash us.
export function collectSubtree(state, id) {
  const result = []
  const toVisit = [id]
  while (toVisit.length > 0) {
    const node = state.nodes.get(toVisit.pop())
    result.push(node.id)
    toVisit.push(...node.childIds)
  }
  return result
}

// Get the path as a list of names, e.g. ['My Files', 'Documents', 'Resume.pdf'].
// How: start at the item and walk up to the root, putting each name at the front.
export function getPathNames(state, id) {
  const names = []
  let current = getNode(state, id)
  while (current) {
    names.unshift(current.name)
    current = current.parentId === null ? null : state.nodes.get(current.parentId)
  }
  return names
}

// ---------------------------------------------------------------------------
// CHECKING NAMES AND RULES
// ---------------------------------------------------------------------------

// Clean up a name and check it is allowed. Returns the cleaned name.
// Rules: must be text, not empty, not too long, no slashes, not "." or "..".
export function normalizeName(name) {
  if (typeof name !== 'string') throw fail(ErrorCodes.INVALID_NAME, 'Name must be a string.')

  const trimmed = name.trim() // remove spaces at both ends
  if (!trimmed) throw fail(ErrorCodes.INVALID_NAME, 'Name cannot be empty.')
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw fail(ErrorCodes.INVALID_NAME, `Name cannot be longer than ${MAX_NAME_LENGTH} characters.`)
  }
  // Slashes would look like path separators, so we don't allow them.
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw fail(ErrorCodes.INVALID_NAME, 'Name cannot contain "/" or "\\".')
  }
  // "." and ".." already mean "this folder" and "parent folder".
  if (trimmed === '.' || trimmed === '..') {
    throw fail(ErrorCodes.INVALID_NAME, `"${trimmed}" is not a valid name.`)
  }
  return trimmed
}

// Make sure no other item in this folder already has this name.
// DECISION: we ignore upper/lower case, so "Notes" and "notes" count as the same.
// `ignoreId` lets an item be renamed to a different case of its OWN name
// (e.g. "notes" -> "Notes") without clashing with itself.
function assertNameIsFree(state, parentId, name, ignoreId = null) {
  const parent = state.nodes.get(parentId)
  const wanted = name.toLowerCase()

  for (const childId of parent.childIds) {
    if (childId === ignoreId) continue
    const sibling = state.nodes.get(childId)
    if (sibling.name.toLowerCase() === wanted) {
      throw fail(
        ErrorCodes.DUPLICATE_NAME,
        `"${parent.name}" already contains an item named "${sibling.name}".`,
        { parentId, name },
      )
    }
  }
}

// The root folder is special: it can't be renamed, moved or deleted.
// `action` is the past-tense word used in the message, e.g. "renamed".
function assertNotRoot(state, node, action) {
  if (node.id === state.rootId) {
    throw fail(ErrorCodes.CANNOT_MODIFY_ROOT, `The root folder cannot be ${action}.`)
  }
}

// Only folders can hold other items.
function assertIsFolder(node) {
  if (node.type !== 'folder') {
    throw fail(ErrorCodes.PARENT_NOT_FOLDER, `"${node.name}" is a file and cannot contain items.`)
  }
}

// ---------------------------------------------------------------------------
// ACTIONS
// Each action returns { state, change }:
//   state  = the new tree
//   change = a short record of what happened (type, affected ids, a label)
// ---------------------------------------------------------------------------

// Add a new file or folder inside `parentId`.
// `generateId` is a function that makes a new id (passed in so tests can control it).
export function createNode(state, parentId, type, rawName, generateId) {
  if (type !== 'file' && type !== 'folder') {
    throw fail(ErrorCodes.INVALID_ARGUMENT, `Unknown item type "${String(type)}".`)
  }

  const parent = getNode(state, parentId)
  assertIsFolder(parent)

  const name = normalizeName(rawName)
  assertNameIsFree(state, parentId, name)

  // Ids must be unique. If we get one that already exists, just ask for another.
  let id = generateId()
  while (state.nodes.has(id)) id = generateId()

  const node = makeNode({ id, name, type, parentId, childIds: [] })

  const newState = changeState(state, (nodes) => {
    nodes.set(id, node) // add the new item
    nodes.set(parentId, makeNode({ ...parent, childIds: [...parent.childIds, id] })) // tell the parent about it
  })

  return {
    state: newState,
    change: { type: 'create', ids: [id], label: `Created ${describe(node)} in "${parent.name}"` },
  }
}

// Change the name of an item.
export function renameNode(state, id, rawName) {
  const node = getNode(state, id)
  assertNotRoot(state, node, 'renamed')

  const name = normalizeName(rawName)
  if (name === node.name) {
    throw fail(ErrorCodes.NO_CHANGE, `"${node.name}" already has that name.`)
  }
  assertNameIsFree(state, node.parentId, name, id)

  const newState = changeState(state, (nodes) => {
    // Same id, new name. Because the id stays the same, the item keeps its place and children.
    nodes.set(id, makeNode({ ...node, name }))
  })

  return {
    state: newState,
    change: { type: 'rename', ids: [id], label: `Renamed ${node.type} "${node.name}" to "${name}"` },
  }
}

// Move an item into another folder.
export function moveNode(state, id, newParentId) {
  const node = getNode(state, id)
  assertNotRoot(state, node, 'moved')

  const newParent = getNode(state, newParentId)
  assertIsFolder(newParent)

  if (newParent.id === node.parentId) {
    throw fail(ErrorCodes.NO_CHANGE, `"${node.name}" is already in "${newParent.name}".`)
  }

  // A folder can't go inside itself or inside its own subfolder.
  // That would cut it off from the tree and make a loop.
  if (newParent.id === id || isDescendant(state, id, newParent.id)) {
    throw fail(
      ErrorCodes.MOVE_INTO_DESCENDANT,
      `Cannot move "${node.name}" into itself or one of its own subfolders.`,
    )
  }

  // The new folder must not already have an item with the same name.
  assertNameIsFree(state, newParent.id, node.name)

  const oldParent = state.nodes.get(node.parentId)

  const newState = changeState(state, (nodes) => {
    // 1. remove the item from the old parent's list
    nodes.set(
      oldParent.id,
      makeNode({ ...oldParent, childIds: oldParent.childIds.filter((childId) => childId !== id) }),
    )
    // 2. add it to the new parent's list
    nodes.set(newParent.id, makeNode({ ...newParent, childIds: [...newParent.childIds, id] }))
    // 3. point the item at its new parent
    nodes.set(id, makeNode({ ...node, parentId: newParent.id }))
  })

  return {
    state: newState,
    change: {
      type: 'move',
      ids: [id],
      label: `Moved ${describe(node)} from "${oldParent.name}" to "${newParent.name}"`,
    },
  }
}

// Delete an item. If it is a folder, everything inside it is deleted too.
export function deleteNode(state, id) {
  const node = getNode(state, id)
  assertNotRoot(state, node, 'deleted')

  const removedIds = collectSubtree(state, id) // the item + everything inside it
  const parent = state.nodes.get(node.parentId)

  const newState = changeState(state, (nodes) => {
    for (const removedId of removedIds) nodes.delete(removedId)
    // Also remove the item from its parent's list.
    nodes.set(
      parent.id,
      makeNode({ ...parent, childIds: parent.childIds.filter((childId) => childId !== id) }),
    )
  })

  // removedIds includes the item itself, so the nested count is one less.
  const nestedCount = removedIds.length - 1
  const extra = nestedCount > 0 ? ` and ${nestedCount} nested item(s)` : ''

  return {
    state: newState,
    change: { type: 'delete', ids: removedIds, label: `Deleted ${describe(node)}${extra}` },
  }
}

// ---------------------------------------------------------------------------
// BUILDING THE STARTING TREE
// ---------------------------------------------------------------------------

// Make the first state from a nested object like:
//   { name: 'My Files', children: [ { name: 'Docs', children: [...] }, { name: 'a.txt' } ] }
// Rule: an item with a `children` array is a folder. Anything else is a file.
//
// How: make the root folder, then go through the children one by one and add
// each with createNode (so all the same name checks apply).
// If a child is a folder, repeat the same steps for its children.
export function createStateFromSpec(spec, generateId) {
  const rootName = normalizeName(spec?.name)
  const rootId = generateId()
  const root = makeNode({ id: rootId, name: rootName, type: 'folder', parentId: null, childIds: [] })

  let state = makeState(new Map([[rootId, root]]), rootId)

  function addChildren(parentId, children) {
    if (children === undefined) return
    if (!Array.isArray(children)) {
      throw fail(ErrorCodes.INVALID_ARGUMENT, '"children" must be an array.')
    }

    for (const child of children) {
      const type = Array.isArray(child?.children) ? 'folder' : 'file'
      const result = createNode(state, parentId, type, child?.name, generateId)
      state = result.state

      if (type === 'folder') {
        const newFolderId = result.change.ids[0]
        addChildren(newFolderId, child.children)
      }
    }
  }

  addChildren(rootId, spec.children)
  return state
}
