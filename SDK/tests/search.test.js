import { describe, it, expect } from 'vitest'
import { createStateFromSpec, createNode, renameNode, deleteNode } from '../src/state.js'
import { searchState } from '../src/search.js'

let n = 0
const gen = () => `id-${++n}`

const seed = {
  name: 'My Files',
  children: [
    { name: 'Documents', children: [{ name: 'Resume.pdf' }, { name: 'Project Plan.docx' }] },
    { name: 'Images', children: [{ name: 'Photo.png' }, { name: 'Logo.svg' }] },
    { name: 'Notes.txt' },
  ],
}

const fresh = () => createStateFromSpec(seed, gen)
const find = (state, name) => [...state.nodes.values()].find((x) => x.name === name)
const codeOf = (fn) => { try { fn() } catch (e) { return e.code } }

describe('searchState', () => {
  it('is case-insensitive, searches nested items and shows location', () => {
    const r = searchState(fresh(), { query: 'RESUME' })
    expect(r.total).toBe(1)
    expect(r.items[0]).toMatchObject({
      name: 'Resume.pdf',
      type: 'file',
      location: 'My Files/Documents',
      path: 'My Files/Documents/Resume.pdf',
    })
  })

  it('filters by type', () => {
    const s = fresh()
    expect(searchState(s, { query: 'i', type: 'folder' }).items.map((i) => i.name)).toEqual(['Images'])
    expect(searchState(s, { query: 'o', type: 'file' }).items.every((i) => i.type === 'file')).toBe(true)
  })

  it('never returns the root folder', () => {
    expect(searchState(fresh(), { query: 'My Files' }).total).toBe(0)
  })

  it('sorts ascending and descending', () => {
    const s = fresh()
    expect(searchState(s, { query: '.', sortBy: 'name' }).items.map((i) => i.name)[0]).toBe('Logo.svg')
    expect(searchState(s, { query: '.', sortBy: 'name', order: 'desc' }).items[0].name).toBe('Resume.pdf')
  })

  it('paginates', () => {
    const s = fresh()
    const p1 = searchState(s, { query: '.', pageSize: 2, page: 1 })
    const p3 = searchState(s, { query: '.', pageSize: 2, page: 3 })
    expect(p1).toMatchObject({ total: 5, totalPages: 3, page: 1 })
    expect(p1.items).toHaveLength(2)
    expect(p3.items).toHaveLength(1)
    expect(searchState(s, { query: '.', pageSize: 2, page: 99 }).items).toEqual([])
  })

  it('handles empty queries', () => {
    const s = fresh()
    expect(searchState(s, { query: '' })).toMatchObject({ items: [], total: 0, totalPages: 1 })
    expect(searchState(s, { query: '   ' }).total).toBe(0)
    expect(searchState(s).total).toBe(0)
  })

  it('rejects invalid options', () => {
    const s = fresh()
    for (const bad of [{ query: 5 }, { type: 'x' }, { sortBy: 'size' }, { order: 'up' },
                       { page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 1000 }]) {
      expect(codeOf(() => searchState(s, { query: 'a', ...bad }))).toBe('INVALID_SEARCH_OPTIONS')
    }
    expect(codeOf(() => searchState(s, null))).toBe('INVALID_SEARCH_OPTIONS')
  })

  it('reflects mutations and never changes the state', () => {
    let s = fresh()
    const nodesBefore = s.nodes
    searchState(s, { query: 'a' })
    expect(s.nodes).toBe(nodesBefore)

    s = createNode(s, s.rootId, 'file', 'photo-new.txt', gen).state
    expect(searchState(s, { query: 'photo' }).total).toBe(2)
    s = renameNode(s, find(s, 'Photo.png').id, 'Holiday.png').state
    expect(searchState(s, { query: 'photo' }).total).toBe(1)
    s = deleteNode(s, find(s, 'Images').id).state
    expect(searchState(s, { query: 'holiday' }).total).toBe(0)
  })
})
