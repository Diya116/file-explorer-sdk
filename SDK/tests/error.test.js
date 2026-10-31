import { describe, it, expect } from 'vitest'
import { ErrorCodes, FileExplorerError } from '../src/error.js'

describe('FileExplorerError', () => {
  it('carries a code and message', () => {
    const e = new FileExplorerError(ErrorCodes.NOT_FOUND, 'missing', { id: 'x' })
    expect(e).toBeInstanceOf(Error)
    expect(e.code).toBe('NOT_FOUND')
    expect(e.message).toBe('missing')
    expect(e.details).toEqual({ id: 'x' })
  })

  it('has frozen codes', () => {
    expect(Object.isFrozen(ErrorCodes)).toBe(true)
  })
})
