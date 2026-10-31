import { ErrorCodes, FileExplorerError } from './error.js'
import { searchState } from './search.js'
import {
  createNode,
  createStateFromSpec,
  deleteNode,
  getNode,
  getPathNames,
  isDescendant,
  moveNode,
  renameNode,
} from './state.js'
import { buildTree } from './tree.js'

export const DEFAULT_SEED = {
  name: 'My Files',
  children: [
    { name: 'Documents', children: [{ name: 'Resume.pdf' }, { name: 'Project Plan.docx' }] },
    { name: 'Images', children: [{ name: 'Photo.png' }, { name: 'Logo.svg' }] },
    { name: 'Notes.txt' },
  ],
}

const MAX_HISTORY = 100
const MAX_ACTIVITY = 50

let fallbackCounter = 0
const defaultIdGenerator = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}`

const isThenable = (value) => value != null && typeof value.then === 'function'

export class FileExplorer {
  #state
  #undoStack = []
  #redoStack = []
  #activity = []
  #listeners = new Set()
  #version = 0
  #snapshot
  #generateId
  #now
  #activitySeq = 0

  /**
   * @param {object}   [options]
   * @param {object}   [options.initialData] nested spec { name, children: [...] }
   * @param {Function} [options.generateId]  () => string  (handy for tests)
   * @param {Function} [options.now]         () => number  (handy for tests)
   */
  constructor({ initialData = DEFAULT_SEED, generateId = defaultIdGenerator, now = Date.now } = {}) {
    this.#generateId = generateId
    this.#now = now
    this.#state = createStateFromSpec(initialData, generateId)
    this.#snapshot = this.#buildSnapshot()
  }

  /* ----------------------------- reads ----------------------------- */

  /** Complete nested hierarchy (frozen). */
  getTree() {
    return this.#snapshot.tree
  }

  /** One frozen item, or null if the id does not exist. */
  getItem(id) {
    return this.#state.nodes.get(id) ?? null
  }

  /** ['My Files', 'Documents', 'Resume.pdf']. Throws NOT_FOUND. */
  getPath(id) {
    return getPathNames(this.#state, id)
  }

  /** One immutable object; changes identity only when something changed. */
  getSnapshot = () => this.#snapshot

  search(options) {
    return searchState(this.#state, options)
  }

  /* --------------------------- mutations --------------------------- */

  /** @returns {string} id of the new file */
  createFile(parentId, name) {
    return this.#commit(createNode(this.#state, parentId, 'file', name, this.#generateId)).ids[0]
  }

  /** @returns {string} id of the new folder */
  createFolder(parentId, name) {
    return this.#commit(createNode(this.#state, parentId, 'folder', name, this.#generateId)).ids[0]
  }

  rename(id, newName) {
    this.#commit(renameNode(this.#state, id, newName))
  }

  move(id, newParentId) {
    this.#commit(moveNode(this.#state, id, newParentId))
  }

  /** Deletes the item and all its descendants. */
  delete(id) {
    this.#commit(deleteNode(this.#state, id))
  }

  /**
   * Delete several items as ONE atomic, undoable operation.
   * Items whose ancestor is also in the list are skipped (they go with the ancestor).
   */
  deleteMany(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new FileExplorerError(ErrorCodes.INVALID_ARGUMENT, 'Provide a non-empty array of ids.')
    }
    const unique = [...new Set(ids)]
    unique.forEach((id) => getNode(this.#state, id)) // fail early with NOT_FOUND
    const topLevel = unique.filter(
      (id) => !unique.some((other) => other !== id && isDescendant(this.#state, other, id)),
    )
    this.transaction((tx) => topLevel.forEach((id) => tx.delete(id)), {
      label: `Deleted ${topLevel.length} item(s)`,
    })
  }

  /* ------------------------- transactions -------------------------- */

  /**
   * Run several operations atomically.
   *
   *   fs.transaction((tx) => {
   *     const folder = tx.createFolder(rootId, 'Archive')
   *     tx.move(fileId, folder)
   *   })
   *
   * - If `fn` throws, or any operation fails validation, nothing is applied.
   * - On success: ONE state change, ONE history entry, ONE notification.
   * - `fn` must be synchronous. `tx` stops working once `fn` returns.
   *
   * @param {(tx: object) => any} fn
   * @param {{ label?: string }} [options]
   * @returns whatever `fn` returned
   */
  transaction(fn, { label } = {}) {
    if (typeof fn !== 'function') {
      throw new FileExplorerError(ErrorCodes.INVALID_ARGUMENT, 'transaction() needs a function.')
    }
    let draft = this.#state // private working copy
    const changes = []
    let open = true

    // Run one pure op against the draft and remember what it did.
    const run = (op) => {
      if (!open) {
        throw new FileExplorerError(ErrorCodes.TRANSACTION_CLOSED, 'This transaction has already finished.')
      }
      const result = op(draft)
      draft = result.state
      changes.push(result.change)
      return result.change
    }

    const tx = Object.freeze({
      createFile: (parentId, name) => run((s) => createNode(s, parentId, 'file', name, this.#generateId)).ids[0],
      createFolder: (parentId, name) => run((s) => createNode(s, parentId, 'folder', name, this.#generateId)).ids[0],
      rename: (id, name) => void run((s) => renameNode(s, id, name)),
      move: (id, parentId) => void run((s) => moveNode(s, id, parentId)),
      delete: (id) => void run((s) => deleteNode(s, id)),
    })

    let result
    try {
      result = fn(tx)
      if (isThenable(result)) {
        throw new FileExplorerError(
          ErrorCodes.TRANSACTION_ASYNC,
          'Transactions must be synchronous; do async work before calling transaction().',
        )
      }
    } finally {
      open = false // tx is dead from here on, even if fn threw
    }

    if (changes.length === 0) return result // nothing happened: nothing to record

    this.#commit({
      state: draft,
      change: {
        type: 'transaction',
        ids: [...new Set(changes.flatMap((c) => c.ids))],
        label: label ?? `Transaction (${changes.length} operations)`,
        changes,
      },
    })
    return result
  }

  /* -------------------------- undo / redo -------------------------- */

  canUndo() {
    return this.#undoStack.length > 0
  }

  canRedo() {
    return this.#redoStack.length > 0
  }

  /** @returns {boolean} false when there was nothing to undo */
  undo() {
    const entry = this.#undoStack.pop()
    if (!entry) return false
    this.#redoStack.push(entry)
    this.#state = entry.before
    this.#publish({ type: 'undo', ids: entry.change.ids, label: `Undo: ${entry.change.label}` })
    return true
  }

  /** @returns {boolean} false when there was nothing to redo */
  redo() {
    const entry = this.#redoStack.pop()
    if (!entry) return false
    this.#undoStack.push(entry)
    this.#state = entry.after
    this.#publish({ type: 'redo', ids: entry.change.ids, label: `Redo: ${entry.change.label}` })
    return true
  }

  /* ------------------------- subscriptions ------------------------- */

  /**
   * Register a listener called with a change event after every successful change.
   * @returns {Function} unsubscribe (safe to call more than once)
   */
  subscribe = (listener) => {
    if (typeof listener !== 'function') {
      throw new FileExplorerError(ErrorCodes.INVALID_ARGUMENT, 'subscribe() needs a function.')
    }
    const registration = { listener }
    this.#listeners.add(registration)
    return () => {
      this.#listeners.delete(registration)
    }
  }

  /** Number of active subscriptions (useful for leak tests). */
  get listenerCount() {
    return this.#listeners.size
  }

  /* --------------------------- internals --------------------------- */

  /** Called only after a pure operation succeeded. */
  #commit({ state, change }) {
    this.#undoStack.push({ before: this.#state, after: state, change })
    if (this.#undoStack.length > MAX_HISTORY) this.#undoStack.shift()
    this.#redoStack = [] // a new action invalidates the "future"
    this.#state = state
    this.#publish(change)
    return change
  }

  /** Log activity, rebuild the snapshot, notify listeners. */
  #publish(change) {
    this.#activity = [
      { id: ++this.#activitySeq, type: change.type, label: change.label, timestamp: this.#now() },
      ...this.#activity,
    ].slice(0, MAX_ACTIVITY)
    this.#version += 1
    this.#snapshot = this.#buildSnapshot()

    const event = Object.freeze({
      type: change.type,
      ids: Object.freeze([...change.ids]),
      label: change.label,
      version: this.#version,
    })
    for (const { listener } of [...this.#listeners]) {
      try {
        listener(event)
      } catch (error) {
        console.error('FileExplorer listener threw:', error)
      }
    }
  }

  #buildSnapshot() {
    return Object.freeze({
      version: this.#version,
      tree: buildTree(this.#state),
      canUndo: this.#undoStack.length > 0,
      canRedo: this.#redoStack.length > 0,
      activity: Object.freeze(this.#activity.map((a) => Object.freeze({ ...a }))),
    })
  }
}
