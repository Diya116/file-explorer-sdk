import { describe, it, expect } from 'vitest'
import {
  createStateFromSpec, createNode, renameNode, moveNode, deleteNode, getPathNames,
} from '../src/state.js'

let n = 0
const gen = () => `id-${++n}`

const seed = {
  name: 'My Files',
  children: [
    { name: 'Documents', children: [{ name: 'Resume.pdf' }] },
    { name: 'Images', children: [{ name: 'Logo.svg' }] },
    { name: 'Notes.txt' },
  ],
}

const find = (state, name) => [...state.nodes.values()].find((x) => x.name === name)
const codeOf = (fn) => { try { fn() } catch (e) { return e.code } }

describe('state operations', () => {
  it('builds the seed', () => {
    const s = createStateFromSpec(seed, gen)
    expect(getPathNames(s, find(s, 'Resume.pdf').id)).toEqual(['My Files', 'Documents', 'Resume.pdf'])
  })

  it('create / rename / move / delete work and never change the old state', () => {
    const s0 = createStateFromSpec(seed, gen)
    const root = s0.rootId

    const { state: s1 } = createNode(s0, root, 'folder', 'Music', gen)
    expect(find(s0, 'Music')).toBeUndefined()      // old state untouched
    expect(find(s1, 'Music')).toBeDefined()

    const notes = find(s1, 'Notes.txt')
    const { state: s2 } = renameNode(s1, notes.id, 'Todo.txt')
    expect(find(s2, 'Todo.txt').id).toBe(notes.id) // identity preserved

    const { state: s3 } = moveNode(s2, notes.id, find(s2, 'Music').id)
    expect(getPathNames(s3, notes.id)).toEqual(['My Files', 'Music', 'Todo.txt'])

    const { state: s4 } = deleteNode(s3, find(s3, 'Images').id)
    expect(find(s4, 'Logo.svg')).toBeUndefined()   // descendants gone
    expect(find(s3, 'Logo.svg')).toBeDefined()     // old state still has them
  })

  it('rejects invalid operations with the right code', () => {
    const s = createStateFromSpec(seed, gen)
    const docs = find(s, 'Documents')
    const notes = find(s, 'Notes.txt')
    expect(codeOf(() => createNode(s, s.rootId, 'file', 'NOTES.TXT', gen))).toBe('DUPLICATE_NAME')
    expect(codeOf(() => createNode(s, notes.id, 'file', 'x', gen))).toBe('PARENT_NOT_FOLDER')
    expect(codeOf(() => createNode(s, s.rootId, 'file', '  ', gen))).toBe('INVALID_NAME')
    expect(codeOf(() => renameNode(s, s.rootId, 'x'))).toBe('CANNOT_MODIFY_ROOT')
    expect(codeOf(() => deleteNode(s, 'nope'))).toBe('NOT_FOUND')
    expect(codeOf(() => moveNode(s, docs.id, docs.id))).toBe('MOVE_INTO_DESCENDANT')
  })

  it('rejects duplicate names on rename and move (ignoring case)', () => {
    let s = createStateFromSpec(seed, gen)
    const notes = find(s, 'Notes.txt')
    expect(codeOf(() => renameNode(s, notes.id, 'DOCUMENTS'))).toBe('DUPLICATE_NAME')
    s = createNode(s, find(s, 'Documents').id, 'file', 'notes.txt', gen).state
    expect(codeOf(() => moveNode(s, notes.id, find(s, 'Documents').id))).toBe('DUPLICATE_NAME')
    expect(codeOf(() => moveNode(s, notes.id, find(s, 'Resume.pdf').id))).toBe('PARENT_NOT_FOLDER')
  })

  it('blocks moving a folder into a deep descendant', () => {
    let s = createStateFromSpec(seed, gen)
    const docs = find(s, 'Documents')
    s = createNode(s, docs.id, 'folder', 'Sub', gen).state
    s = createNode(s, find(s, 'Sub').id, 'folder', 'Deep', gen).state
    expect(codeOf(() => moveNode(s, docs.id, find(s, 'Deep').id))).toBe('MOVE_INTO_DESCENDANT')
  })

  it('returns frozen nodes', () => {
    const s = createStateFromSpec(seed, gen)
    expect(Object.isFrozen(find(s, 'Documents'))).toBe(true)
    expect(Object.isFrozen(find(s, 'Documents').childIds)).toBe(true)
  })
})
