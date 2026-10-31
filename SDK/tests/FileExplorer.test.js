import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorCodes, FileExplorer, FileExplorerError } from '../src/index.js'

const find = (node, name) => {
  if (node.name === name) return node
  for (const c of node.children ?? []) {
    const hit = find(c, name)
    if (hit) return hit
  }
  return null
}
const codeOf = (fn) => { try { fn() } catch (e) { return e.code } }

let fs, root
const id = (name) => find(fs.getTree(), name).id

beforeEach(() => {
  fs = new FileExplorer()
  root = fs.getTree().id
})

describe('basic operations', () => {
  it('creates, renames, moves and deletes', () => {
    const folder = fs.createFolder(root, 'Music')
    const file = fs.createFile(folder, 'song.mp3')
    expect(fs.getPath(file)).toEqual(['My Files', 'Music', 'song.mp3'])

    fs.rename(file, 'track.mp3')
    expect(fs.getItem(file).name).toBe('track.mp3')

    fs.move(file, id('Documents'))
    expect(fs.getItem(file).parentId).toBe(id('Documents'))

    fs.delete(id('Images'))
    expect(fs.getItem(id('Notes.txt'))).not.toBeNull()
    expect(find(fs.getTree(), 'Logo.svg')).toBeNull()
  })

  it('getItem returns null for unknown ids', () => {
    expect(fs.getItem('nope')).toBeNull()
  })
})

describe('failed operations leave no trace', () => {
  it('does not change state, history or notify', () => {
    const listener = vi.fn()
    fs.subscribe(listener)
    const snap = fs.getSnapshot()

    expect(codeOf(() => fs.createFile(root, 'notes.TXT'))).toBe(ErrorCodes.DUPLICATE_NAME)
    expect(codeOf(() => fs.move(id('Documents'), id('Documents')))).toBe(ErrorCodes.MOVE_INTO_DESCENDANT)
    expect(codeOf(() => fs.delete(root))).toBe(ErrorCodes.CANNOT_MODIFY_ROOT)

    expect(fs.getSnapshot()).toBe(snap)
    expect(fs.canUndo()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('undo / redo', () => {
  it('undoes and redoes every kind of operation', () => {
    const file = fs.createFile(root, 'new.txt')
    fs.rename(file, 'renamed.txt')
    fs.move(file, id('Documents'))
    fs.delete(file)

    fs.undo()
    expect(fs.getPath(file)).toEqual(['My Files', 'Documents', 'renamed.txt'])
    fs.undo()
    expect(fs.getItem(file).parentId).toBe(root)
    fs.undo()
    expect(fs.getItem(file).name).toBe('new.txt')
    fs.undo()
    expect(fs.getItem(file)).toBeNull()

    fs.redo(); fs.redo(); fs.redo(); fs.redo()
    expect(fs.getItem(file)).toBeNull()
    expect(fs.canRedo()).toBe(false)
  })

  it('restores a deleted nested folder with the same ids', () => {
    const sub = fs.createFolder(id('Images'), 'Sub')
    const deep = fs.createFile(sub, 'deep.txt')
    const before = JSON.stringify(fs.getTree())

    fs.delete(id('Images'))
    expect(fs.getItem(deep)).toBeNull()

    fs.undo()
    expect(JSON.stringify(fs.getTree())).toBe(before)
    expect(fs.getPath(deep)).toEqual(['My Files', 'Images', 'Sub', 'deep.txt'])
  })

  it('clears redo history after a new operation', () => {
    fs.createFile(root, 'a.txt')
    fs.undo()
    expect(fs.canRedo()).toBe(true)
    fs.createFile(root, 'b.txt')
    expect(fs.canRedo()).toBe(false)
    expect(fs.redo()).toBe(false)
  })

  it('returns false when there is nothing to undo or redo', () => {
    expect(fs.undo()).toBe(false)
    expect(fs.redo()).toBe(false)
  })
})

describe('subscriptions', () => {
  it('notifies on changes, undo and redo', () => {
    const listener = vi.fn()
    fs.subscribe(listener)
    const file = fs.createFile(root, 'a.txt')
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'create', ids: [file] }))
    fs.undo()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'undo' }))
    fs.redo()
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'redo' }))
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('stops notifying after unsubscribe and tracks the count', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = fs.subscribe(a)
    fs.subscribe(b)
    expect(fs.listenerCount).toBe(2)
    offA()
    offA() // safe twice
    expect(fs.listenerCount).toBe(1)
    fs.createFile(root, 'a.txt')
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('isolates a throwing listener', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = vi.fn()
    fs.subscribe(() => { throw new Error('boom') })
    fs.subscribe(good)
    expect(() => fs.createFile(root, 'a.txt')).not.toThrow()
    expect(good).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('rejects a non-function listener', () => {
    expect(codeOf(() => fs.subscribe('nope'))).toBe(ErrorCodes.INVALID_ARGUMENT)
  })
})

describe('search through the class', () => {
  it('reflects mutations', () => {
    expect(fs.search({ query: 'photo' }).total).toBe(1)
    fs.rename(id('Photo.png'), 'Holiday.png')
    expect(fs.search({ query: 'photo' }).total).toBe(0)
    expect(fs.search({ query: 'holiday' }).total).toBe(1)
  })
})

describe('read-only data', () => {
  const tryMutate = (fn) => { try { fn() } catch { /* frozen objects throw */ } }

  it('cannot be changed by consumers', () => {
    const before = JSON.stringify(fs.getTree())
    const tree = fs.getTree()
    tryMutate(() => { tree.name = 'hacked' })
    tryMutate(() => tree.children.push({ id: 'x' }))
    tryMutate(() => { tree.children[0].name = 'hacked' })
    expect(JSON.stringify(fs.getTree())).toBe(before)

    const item = fs.getItem(id('Documents'))
    tryMutate(() => { item.name = 'hacked' })
    tryMutate(() => item.childIds.push('x'))
    expect(fs.getItem(id('Documents')).name).toBe('Documents')
    expect(fs.getItem(id('Documents')).childIds).toHaveLength(2)
  })

  it('shares unchanged subtrees between snapshots', () => {
    const before = fs.getTree()
    fs.rename(id('Photo.png'), 'Pic.png')
    const after = fs.getTree()
    const docs = (t) => t.children.find((c) => c.name === 'Documents')
    expect(after).not.toBe(before)
    expect(docs(after)).toBe(docs(before))
  })
})

describe('activity log', () => {
  it('records changes newest first, including undo', () => {
    fs.createFile(root, 'a.txt')
    fs.rename(id('a.txt'), 'b.txt')
    fs.undo()
    expect(fs.getSnapshot().activity.map((a) => a.label)).toEqual([
      'Undo: Renamed file "a.txt" to "b.txt"',
      'Renamed file "a.txt" to "b.txt"',
      'Created file "a.txt" in "My Files"',
    ])
  })
})

it('exports FileExplorerError', () => {
  expect(new FileExplorerError('X', 'y')).toBeInstanceOf(Error)
})

describe('transactions (bonus)', () => {
  it('applies all operations as one undoable step with one notification', () => {
    const listener = vi.fn()
    fs.subscribe(listener)
    const start = JSON.stringify(fs.getTree())

    const folderId = fs.transaction((tx) => {
      const folder = tx.createFolder(root, 'Archive')
      tx.move(id('Notes.txt'), folder)
      tx.rename(id('Documents'), 'Docs')
      return folder
    })

    expect(fs.getPath(id('Notes.txt'))).toEqual(['My Files', 'Archive', 'Notes.txt'])
    expect(fs.getItem(folderId).name).toBe('Archive')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].type).toBe('transaction')

    fs.undo() // ONE undo reverts all three
    expect(JSON.stringify(fs.getTree())).toBe(start)
    expect(fs.canUndo()).toBe(false)
  })

  it('rolls back completely when any operation fails', () => {
    const listener = vi.fn()
    fs.subscribe(listener)
    const snap = fs.getSnapshot()

    const code = codeOf(() =>
      fs.transaction((tx) => {
        tx.createFolder(root, 'Archive')
        tx.delete(id('Images'))
        tx.rename(id('Notes.txt'), 'documents') // duplicate -> fails
      }),
    )

    expect(code).toBe(ErrorCodes.DUPLICATE_NAME)
    expect(fs.getSnapshot()).toBe(snap) // literally the same object
    expect(find(fs.getTree(), 'Archive')).toBeNull()
    expect(find(fs.getTree(), 'Images')).not.toBeNull()
    expect(fs.canUndo()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('rolls back when the callback throws its own error', () => {
    expect(() =>
      fs.transaction((tx) => {
        tx.createFile(root, 'x.txt')
        throw new Error('custom')
      }),
    ).toThrow('custom')
    expect(find(fs.getTree(), 'x.txt')).toBeNull()
    expect(fs.canUndo()).toBe(false)
  })

  it('lets later operations see earlier ones', () => {
    fs.transaction((tx) => {
      const f = tx.createFolder(root, 'A')
      tx.createFile(f, 'inside.txt')
    })
    expect(fs.getPath(id('inside.txt'))).toEqual(['My Files', 'A', 'inside.txt'])
  })

  it('rejects async callbacks and a reused tx', () => {
    expect(codeOf(() => fs.transaction(async () => {}))).toBe(ErrorCodes.TRANSACTION_ASYNC)

    let leaked
    fs.transaction((tx) => {
      leaked = tx
      tx.createFile(root, 'ok.txt')
    })
    expect(codeOf(() => leaked.createFile(root, 'late.txt'))).toBe(ErrorCodes.TRANSACTION_CLOSED)
    expect(find(fs.getTree(), 'late.txt')).toBeNull()
  })

  it('does not record an empty transaction', () => {
    const listener = vi.fn()
    fs.subscribe(listener)
    fs.transaction(() => {})
    expect(fs.canUndo()).toBe(false)
    expect(listener).not.toHaveBeenCalled()
  })

  it('deleteMany removes items atomically and skips nested duplicates', () => {
    fs.deleteMany([id('Images'), id('Logo.svg'), id('Notes.txt')]) // Logo.svg is inside Images
    expect(fs.getTree().children.map((c) => c.name)).toEqual(['Documents'])
    fs.undo() // one undo restores everything
    expect(fs.getTree().children.map((c) => c.name)).toEqual(['Documents', 'Images', 'Notes.txt'])
  })

  it('deleteMany fails atomically on a bad id', () => {
    const snap = fs.getSnapshot()
    expect(codeOf(() => fs.deleteMany([id('Notes.txt'), 'missing']))).toBe(ErrorCodes.NOT_FOUND)
    expect(codeOf(() => fs.deleteMany([id('Notes.txt'), root]))).toBe(ErrorCodes.CANNOT_MODIFY_ROOT)
    expect(codeOf(() => fs.deleteMany([]))).toBe(ErrorCodes.INVALID_ARGUMENT)
    expect(fs.getSnapshot()).toBe(snap)
  })
})
