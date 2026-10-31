import { describe, it, expect } from 'vitest'
import { createStateFromSpec, renameNode } from '../src/state.js'
import { buildTree } from '../src/tree.js'

let n = 0
const gen = () => `id-${++n}`

const seed = {
  name: 'My Files',
  children: [
    { name: 'Notes.txt' },
    { name: 'Images', children: [{ name: 'Photo.png' }, { name: 'Logo.svg' }] },
    { name: 'Documents', children: [{ name: 'Resume.pdf' }] },
  ],
}

const find = (state, name) => [...state.nodes.values()].find((x) => x.name === name)

describe('buildTree', () => {
  it('nests children, folders first then alphabetical', () => {
    const tree = buildTree(createStateFromSpec(seed, gen))
    expect(tree.name).toBe('My Files')
    expect(tree.children.map((c) => c.name)).toEqual(['Documents', 'Images', 'Notes.txt'])
    expect(tree.children[1].children.map((c) => c.name)).toEqual(['Logo.svg', 'Photo.png'])
    expect(tree.children[2].children).toBeUndefined() // files have no children
  })

  it('returns frozen objects', () => {
    const tree = buildTree(createStateFromSpec(seed, gen))
    expect(Object.isFrozen(tree)).toBe(true)
    expect(Object.isFrozen(tree.children)).toBe(true)
    expect(Object.isFrozen(tree.children[0])).toBe(true)
  })

  it('returns the exact same object when the state has not changed', () => {
    const state = createStateFromSpec(seed, gen)
    expect(buildTree(state)).toBe(buildTree(state))
  })

  it('reuses unchanged subtrees after a change', () => {
    const s1 = createStateFromSpec(seed, gen)
    const t1 = buildTree(s1)

    const s2 = renameNode(s1, find(s1, 'Photo.png').id, 'Pic.png').state
    const t2 = buildTree(s2)

    expect(t2).not.toBe(t1)                                   // root changed
    const byName = (t, name) => t.children.find((c) => c.name === name)
    expect(byName(t2, 'Images')).not.toBe(byName(t1, 'Images')) // ancestor changed
    expect(byName(t2, 'Documents')).toBe(byName(t1, 'Documents')) // untouched => same object
    expect(byName(t2, 'Notes.txt')).toBe(byName(t1, 'Notes.txt'))
  })
})
