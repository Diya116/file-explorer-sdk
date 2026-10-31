# SDK Guide (validation, errors, search, undo/redo, transactions)

A framework-agnostic JavaScript SDK that manages an in-memory hierarchy of files and folders.
It has no dependencies, no DOM access and no React code, so it runs in a browser, in Node, or in a test.

Features: create / rename / move / delete, search with filter + sort + pagination, undo / redo,
change subscriptions, and atomic transactions.

## Install and test

```bash
cd SDK
npm install
npm test            # run all tests once
npm run test:watch  # re-run on every save
```

## Quick start

```js
import { FileExplorer, ErrorCodes, FileExplorerError } from './src/index.js'

const fs = new FileExplorer()               // starts with the example "My Files" tree
const rootId = fs.getTree().id

const unsubscribe = fs.subscribe((event) => console.log(event.type, event.label))

const docs = fs.createFolder(rootId, 'Work')
const file = fs.createFile(docs, 'report.txt')
fs.rename(file, 'final-report.txt')
fs.move(file, rootId)

console.log(fs.search({ query: 'report' }).items)

fs.undo()                                   // moves the file back into "Work"
fs.redo()

try {
  fs.createFile(rootId, 'FINAL-REPORT.TXT') // same name, different case
} catch (error) {
  if (error instanceof FileExplorerError) console.log(error.code, error.message)
}

unsubscribe()
```

## Data model

Internally the state is one immutable value:

```
{ nodes: Map<id, Node>, rootId }
Node = { id, name, type: 'file' | 'folder', parentId: string | null, childIds: string[] }
```

- **Flat map keyed by id.** Lookup is O(1). Move and rename only touch a few nodes and never change an id,
  so an item keeps its identity.
- **Immutable.** Nodes and the map are never edited in place. Every change builds a new state, reusing
  every node that did not change. All nodes are frozen.
- **The tree consumers see is derived.** `getTree()` builds a nested, frozen view from the map
  (folders first, then alphabetical). Unchanged subtrees keep the same object identity between versions,
  which lets UI libraries skip re-rendering them.

### Architecture

| File | Responsibility |
|---|---|
| `src/error.js` | `FileExplorerError` and `ErrorCodes` |
| `src/state.js` | Pure functions: validate + return a new state (`createNode`, `renameNode`, `moveNode`, `deleteNode`) |
| `src/tree.js` | Builds the nested frozen tree with structural sharing |
| `src/search.js` | Pure search / filter / sort / pagination |
| `src/FileExplorer.js` | The public class: holds current state, history, listeners, snapshot |
| `src/index.js` | Public exports |

Every change follows one path:

```
public method -> pure function (validates, returns new state) -> commit -> publish
```

If the pure function throws, `commit` is never reached, so a failed operation cannot change state,
add history, add activity, or notify anyone.

## API reference

### `new FileExplorer(options?)`

| Option | Type | Default | Description |
|---|---|---|---|
| `initialData` | `{ name, children? }` | the example tree | Nested spec. An entry with a `children` array is a folder, otherwise a file. Obeys the same validation rules as normal operations. |
| `generateId` | `() => string` | `crypto.randomUUID` | Id generator (useful for deterministic tests). |
| `now` | `() => number` | `Date.now` | Clock used for activity timestamps. |

### Reading

| Method | Returns | Notes |
|---|---|---|
| `getTree()` | frozen nested tree `{ id, name, type, parentId, children? }` | Files have no `children` property. |
| `getItem(id)` | frozen node `{ id, name, type, parentId, childIds }` or `null` | Returns `null` for unknown ids instead of throwing. |
| `getPath(id)` | `string[]`, e.g. `['My Files', 'Documents', 'Resume.pdf']` | Throws `NOT_FOUND`. |
| `getSnapshot()` | frozen `{ version, tree, canUndo, canRedo, activity }` | Same object until something changes. Designed for `useSyncExternalStore`. |
| `search(options)` | see [Search](#search) | Never modifies data. |
| `canUndo()` / `canRedo()` | `boolean` | |
| `listenerCount` | `number` | Active subscriptions. Handy for leak checks. |

### Changing

All of these throw a `FileExplorerError` on invalid input and leave everything untouched when they do.

| Method | Returns | Description |
|---|---|---|
| `createFile(parentId, name)` | new id | Adds a file inside a folder. |
| `createFolder(parentId, name)` | new id | Adds a folder inside a folder. |
| `rename(id, newName)` | `void` | Same id, new name. |
| `move(id, newParentId)` | `void` | Same id, new parent. |
| `delete(id)` | `void` | Removes the item and all descendants. |
| `deleteMany(ids)` | `void` | Deletes several items as one atomic, undoable operation. Items inside another selected item are skipped. |
| `transaction(fn, { label }?)` | whatever `fn` returned | See [Transactions](#transactions). |
| `undo()` / `redo()` | `boolean` | `false` if there was nothing to do. |
| `subscribe(listener)` | `unsubscribe()` | See [Subscriptions](#subscriptions). |

### Validation rules

1. Every item has a stable, unique id (never changes on rename or move).
2. Names are trimmed and must be unique within a folder, ignoring letter case.
   A name cannot be empty, longer than 255 characters, contain `/` or `\`, or be `.` / `..`.
3. Files cannot contain items (`PARENT_NOT_FOLDER`).
4. A folder cannot be moved into itself or a descendant (`MOVE_INTO_DESCENDANT`).
5. The root folder cannot be renamed, moved or deleted (`CANNOT_MODIFY_ROOT`).
6. Renaming to the same name or moving to the current folder is rejected (`NO_CHANGE`) so that
   no-ops never create history entries.
7. Deleting a folder deletes everything inside it.

### Errors

Every error is a `FileExplorerError` with a human-readable `message` and a machine-readable `code`.

| Code | Meaning |
|---|---|
| `NOT_FOUND` | The id does not exist |
| `INVALID_NAME` | Empty, too long, or contains forbidden characters |
| `DUPLICATE_NAME` | Another item in that folder has the same name (ignoring case) |
| `PARENT_NOT_FOLDER` | Target parent is a file |
| `MOVE_INTO_DESCENDANT` | Folder moved into itself or its own subfolder |
| `CANNOT_MODIFY_ROOT` | Rename / move / delete on the root |
| `NO_CHANGE` | Rename to same name, or move to current folder |
| `INVALID_ARGUMENT` | Wrong kind of input (bad type, empty id list, non-function listener) |
| `INVALID_SEARCH_OPTIONS` | A search option has an invalid value |
| `TRANSACTION_CLOSED` | A `tx` object was used after its transaction finished |
| `TRANSACTION_ASYNC` | A transaction callback returned a promise |

```js
try {
  fs.move(folderId, ownChildId)
} catch (error) {
  if (error.code === ErrorCodes.MOVE_INTO_DESCENDANT) { /* ... */ }
}
```

### Search

```js
fs.search({
  query: 'report',        // string, case-insensitive substring of the name
  type: 'all',            // 'all' | 'file' | 'folder'
  sortBy: 'name',         // 'name' | 'type' | 'path'
  order: 'asc',           // 'asc' | 'desc'
  page: 1,                // integer >= 1
  pageSize: 10,           // integer 1..100
})
```

Returns a frozen object:

```js
{
  items: [{ id, name, type, path: 'My Files/Work/report.txt', location: 'My Files/Work' }],
  total, page, pageSize, totalPages, query
}
```

Behaviour:

- Searches the whole hierarchy, including nested items. The root folder itself is never a result.
- An empty or whitespace-only query returns an empty result (it does not list everything).
- A page beyond the last returns an empty `items` array, not an error.
- Invalid options throw `INVALID_SEARCH_OPTIONS`.
- Sorting is case-insensitive and numeric-aware (`file2` before `file10`). Ties are broken by path, then id,
  so pagination is stable.
- Search reads the current state each time, so results always reflect earlier changes.

### Subscriptions

```js
const unsubscribe = fs.subscribe((event) => {
  // event = { type, ids, label, version }
})
unsubscribe() // idempotent
```

- `type` is one of `create`, `rename`, `move`, `delete`, `transaction`, `undo`, `redo`.
- Listeners run only after a change fully succeeded. Failed operations never notify.
- Each `subscribe` call is its own registration, even for the same function.
- A listener that throws is logged with `console.error` and does not stop the others or the operation.

### Read-only data

Everything the SDK returns (tree, items, search results, snapshot, events) is deeply frozen, and the real
state lives in private class fields. Consumers cannot change the SDK's internal state through returned data.
In strict mode (ES modules) an attempted write throws; otherwise it is silently ignored.

## Undo / redo

History is a **linear stack of state pairs**.

```
undoStack: [ { before, after, change }, ... ]     redoStack: [ ... ]
```

- Because states are immutable and share unchanged nodes, keeping `before` and `after` is cheap.
- **New operation:** push an entry onto the undo stack and **clear the redo stack**.
- **Undo:** pop the latest entry, push it onto the redo stack, current state = `entry.before`.
- **Redo:** pop from the redo stack, push onto the undo stack, current state = `entry.after`.
- **Redo after a new action:** performing any new successful operation after an undo discards the redo
  history (standard linear history, same as most editors).
- **Failed operations** throw before the commit step, so they never create history entries.
- **Deleting a folder** is undone by restoring the previous state, which still contains the whole nested
  structure with the original ids.
- Undo and redo notify subscribers and add an `Undo: ...` / `Redo: ...` line to the activity log.
- History is capped at 100 entries; the oldest entry is dropped first.

The activity log (`getSnapshot().activity`, newest first, max 50) is separate from history:
undoing does not remove entries, it adds one.

## Transactions

Run several operations as one all-or-nothing, single-undo unit.

```js
fs.transaction((tx) => {
  const archive = tx.createFolder(rootId, 'Archive')
  tx.move(oldFileId, archive)
  tx.rename(draftId, 'final.txt')
})
```

`tx` offers `createFile`, `createFolder`, `rename`, `move`, `delete` with the same arguments as the
class methods. Create calls return the new id so later steps can use it.

How it works:

1. The callback's operations run against a private **draft** state, one after another.
   Later operations see the effects of earlier ones.
2. If the callback throws, or any operation fails validation, the draft is discarded.
   State, history and subscribers are completely untouched.
3. If it finishes, the draft is committed **once**: one state change, one history entry
   (so one `undo()` reverts the whole transaction), one notification of type `transaction`.
4. A transaction with no operations records nothing.

Rules: the callback must be synchronous (a returned promise throws `TRANSACTION_ASYNC`), and `tx` stops
working when the callback returns (`TRANSACTION_CLOSED`). Optional `{ label }` sets the activity text.

`deleteMany(ids)` is built on this: selecting a folder and one of its children deletes the folder once,
as a single undoable step.

## Design decisions

- **Pure functions + immutable state** instead of mutating a tree: this makes undo, transactions, and
  "failed operations leave no trace" simple and hard to get wrong.
- **Flat map instead of nested objects:** O(1) lookup and cheap moves with identity preserved.
- **Structural sharing in the tree view** so a UI can skip unchanged subtrees.
- **Error codes** so callers can branch without parsing messages.
- **`getItem` returns `null`** for unknown ids (it is a lookup), while mutating methods throw.
- **`NO_CHANGE` is an error** (rather than a silent no-op) so the caller knows nothing happened and
  history stays clean.

## Known limitations

- Data lives only in memory; nothing is persisted.
- Undo history is linear (no branching) and capped at 100 entries.
- Search is a linear scan with a path computed per match; fine for thousands of items, not for millions.
- Search is substring matching only (no fuzzy or regex search).
- Items have no content, size, or timestamps; only name, type and location.
- Names are compared with `toLowerCase()`, not full Unicode normalization.
- Transactions are synchronous only.
- The SDK is single-instance state with no cross-tab or multi-user synchronization.
