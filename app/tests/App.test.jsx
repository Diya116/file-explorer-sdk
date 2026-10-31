import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { fs, resetFs } from '../src/fileExplorer'

// Every test gets a brand-new SDK instance (the real module exports one shared instance).
vi.mock('../src/fileExplorer', async () => {
  const { FileExplorer } = await import('sdk')
  let current = new FileExplorer()
  return {
    get fs() {
      return current
    },
    resetFs: () => {
      current = new FileExplorer()
    },
  }
})

const tree = () => screen.getByRole('tree')
const typeName = (user, value) => user.type(screen.getByLabelText('Name'), value)
const open = (user, folder) =>
  user.click(within(within(tree()).getByText(folder).closest('.row')).getByRole('button', { name: 'Expand' }))

beforeEach(() => resetFs())

describe('subscriptions', () => {
  it('subscribes on mount and cleans up on unmount', () => {
    expect(fs.listenerCount).toBe(0)
    const { unmount } = render(<App />)
    expect(fs.listenerCount).toBeGreaterThan(0)
    unmount()
    expect(fs.listenerCount).toBe(0)
  })

  it('does not leak subscriptions across re-renders', async () => {
    const user = userEvent.setup()
    render(<App />)
    const before = fs.listenerCount
    await typeName(user, 'x')
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    expect(fs.listenerCount).toBe(before)
  })
})

describe('UI updates from the SDK', () => {
  it('shows the seeded tree', () => {
    render(<App />)
    expect(within(tree()).getByText(/My Files/)).toBeInTheDocument()
    expect(within(tree()).getByText(/Documents/)).toBeInTheDocument()
    expect(within(tree()).getByText(/Notes\.txt/)).toBeInTheDocument()
  })

  it('creates a folder and logs it in the activity panel', async () => {
    const user = userEvent.setup()
    render(<App />)
    await typeName(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    expect(within(tree()).getByText(/Work/)).toBeInTheDocument()
    expect(screen.getByText(/Created folder "Work"/)).toBeInTheDocument()
  })

  it('updates when the SDK changes outside React', async () => {
    render(<App />)
    const { act } = await import('@testing-library/react')
    act(() => {
      fs.createFile(fs.getTree().id, 'outside.txt')
    })
    expect(within(tree()).getByText(/outside\.txt/)).toBeInTheDocument()
  })

  it('renames the selected item', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/Notes\.txt/))
    await typeName(user, 'Todo.txt')
    await user.click(screen.getByRole('button', { name: 'Rename' }))
    expect(within(tree()).getByText(/Todo\.txt/)).toBeInTheDocument()
    expect(within(tree()).queryByText(/Notes\.txt/)).not.toBeInTheDocument()
  })

  it('undo and redo restore and re-apply a deleted folder with its children', async () => {
    const user = userEvent.setup()
    render(<App />)
    await open(user, /Documents/)
    expect(within(tree()).getByText(/Resume\.pdf/)).toBeInTheDocument()

    await user.click(within(tree()).getByText(/Documents/))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(tree()).queryByText(/Documents/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Undo/ }))
    expect(within(tree()).getByText(/Documents/)).toBeInTheDocument()
    await open(user, /Documents/)
    expect(within(tree()).getByText(/Resume\.pdf/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Redo/ }))
    expect(within(tree()).queryByText(/Documents/)).not.toBeInTheDocument()
  })

  it('disables undo/redo when there is no history', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /Undo/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Redo/ })).toBeDisabled()
  })

  it('search results reflect later changes', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(screen.getByLabelText('Search'), 'report')
    expect(screen.getByText('No results.')).toBeInTheDocument()

    await typeName(user, 'report.txt')
    await user.click(screen.getByRole('button', { name: 'New file' }))
    expect(screen.getByRole('button', { name: /report\.txt/ })).toBeInTheDocument()
  })

  it('clears the selection when the selected item is deleted', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/Notes\.txt/))
    expect(screen.getByText('Details').parentElement).toHaveTextContent('Notes.txt')
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Select a file or folder.')).toBeInTheDocument()
  })
})

describe('toolbar actions', () => {
  it('creates a file inside the selected folder', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(within(tree()).getByText(/Documents/))
    await typeName(user, 'todo.md')
    await user.click(screen.getByRole('button', { name: 'New file' }))
    expect(within(tree()).getByText(/todo\.md/)).toBeInTheDocument()
    expect(screen.getByLabelText('Name')).toHaveValue('')
  })

  it('moves the selected item to another folder', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/Notes\.txt/))
    await user.selectOptions(screen.getByLabelText('Move to'), screen.getByRole('option', { name: /Documents/ }))
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(fs.search({ query: 'Notes.txt' }).items[0].location).toBe('My Files/Documents')
  })

  it('shows an error when moving a folder into its own descendant', async () => {
    const user = userEvent.setup()
    render(<App />)
    const docs = fs.search({ query: 'Documents' }).items[0]
    let child
    act(() => {
      child = fs.createFolder(docs.id, 'Inner')
    })
    await user.click(within(tree()).getByText(/Documents/))
    await user.selectOptions(screen.getByLabelText('Move to'), child)
    await user.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(fs.getItem(docs.id).parentId).toBe(fs.getTree().id)
  })

  it('deletes the selected item', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText(/Notes\.txt/))
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(within(tree()).queryByText(/Notes\.txt/)).not.toBeInTheDocument()
  })
})

describe('error handling', () => {
  it('shows the SDK error for a duplicate name and leaves the tree unchanged', async () => {
    const user = userEvent.setup()
    render(<App />)
    await typeName(user, 'documents') // different case
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/already contains/)
    expect(within(tree()).getAllByText(/documents/i)).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Undo/ })).toBeDisabled() // no history entry
  })

  it('dismisses the error', async () => {
    const user = userEvent.setup()
    render(<App />)
    await typeName(user, 'Images')
    await user.click(screen.getByRole('button', { name: 'New folder' }))
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('multi-selection', () => {
  it('shows the count and deletes the selected items in one operation', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByLabelText('Select Documents'))
    await user.click(screen.getByLabelText('Select Notes.txt'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(within(tree()).queryByText(/Documents/)).not.toBeInTheDocument()
    expect(within(tree()).queryByText(/Notes\.txt/)).not.toBeInTheDocument()
    expect(screen.getByText('0 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Undo/ })) // one undo restores both
    expect(within(tree()).getByText(/Documents/)).toBeInTheDocument()
    expect(within(tree()).getByText(/Notes\.txt/)).toBeInTheDocument()
  })

  it('keeps the selection and shows an error when bulk delete fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(fs, 'deleteMany').mockImplementation(() => {
      throw new Error('boom')
    })
    render(<App />)
    await user.click(screen.getByLabelText('Select Notes.txt'))
    await user.click(screen.getByRole('button', { name: 'Delete selected' }))
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByLabelText('Select Notes.txt')).toBeChecked()
  })
})

describe('render behaviour', () => {
  it('collapsing/expanding a folder does not re-render its siblings', async () => {
    const user = userEvent.setup()
    render(<App />)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await open(user, /Documents/)
    const rendered = log.mock.calls.map((c) => c[1])
    expect(rendered).toContain('My Files') // ancestor on the path
    expect(rendered).toContain('Documents')
    expect(rendered).not.toContain('Images')
    expect(rendered).not.toContain('Notes.txt')
  })

  it('selecting a file does not re-render unrelated folders', async () => {
    const user = userEvent.setup()
    render(<App />)
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await user.click(screen.getByText(/Notes\.txt/))
    const rendered = log.mock.calls.map((c) => c[1])
    expect(rendered).not.toContain('Documents')
    expect(rendered).not.toContain('Images')
  })
})
