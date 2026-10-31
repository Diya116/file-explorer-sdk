import { ErrorCodes, FileExplorerError } from './error.js'
import { getPathNames } from './state.js'

const TYPES = ['all', 'file', 'folder']
const SORT_FIELDS = ['name', 'type', 'path']
const ORDERS = ['asc', 'desc']
const MAX_PAGE_SIZE = 100

const invalid = (message) => new FileExplorerError(ErrorCodes.INVALID_SEARCH_OPTIONS, message)
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

// Check every option and fill in defaults.
function normalizeOptions(options) {
  if (options === null || typeof options !== 'object') {
    throw invalid('Search options must be an object.')
  }
  const { query = '', type = 'all', sortBy = 'name', order = 'asc', page = 1, pageSize = 10 } = options

  if (typeof query !== 'string') throw invalid('"query" must be a string.')
  if (!TYPES.includes(type)) throw invalid(`"type" must be one of: ${TYPES.join(', ')}.`)
  if (!SORT_FIELDS.includes(sortBy)) throw invalid(`"sortBy" must be one of: ${SORT_FIELDS.join(', ')}.`)
  if (!ORDERS.includes(order)) throw invalid(`"order" must be one of: ${ORDERS.join(', ')}.`)
  if (!Number.isInteger(page) || page < 1) throw invalid('"page" must be an integer >= 1.')
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw invalid(`"pageSize" must be an integer between 1 and ${MAX_PAGE_SIZE}.`)
  }
  return { query: query.trim(), type, sortBy, order, page, pageSize }
}

export function searchState(state, options = {}) {
  const { query, type, sortBy, order, page, pageSize } = normalizeOptions(options)

  // 1. Filter
  const matches = []
  if (query) {
    const needle = query.toLowerCase()
    for (const node of state.nodes.values()) {
      if (node.id === state.rootId) continue
      if (type !== 'all' && node.type !== type) continue
      if (!node.name.toLowerCase().includes(needle)) continue

      const names = getPathNames(state, node.id)
      matches.push({
        id: node.id,
        name: node.name,
        type: node.type,
        path: names.join('/'),                       // My Files/Documents/Resume.pdf
        location: names.slice(0, -1).join('/'),      // My Files/Documents
      })
    }
  }

  // 2. Sort (with tie-breakers so pages stay stable)
  const dir = order === 'asc' ? 1 : -1
  matches.sort((a, b) => {
    const primary = collator.compare(a[sortBy], b[sortBy])
    if (primary !== 0) return primary * dir
    return collator.compare(a.path, b.path) * dir || (a.id < b.id ? -1 : 1)
  })

  // 3. Paginate
  const total = matches.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const start = (page - 1) * pageSize
  const items = matches.slice(start, start + pageSize).map((m) => Object.freeze(m))

  return Object.freeze({ items: Object.freeze(items), total, page, pageSize, totalPages, query })
}
