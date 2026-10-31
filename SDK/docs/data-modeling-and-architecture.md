# Data Modeling and Architecture

A short tour of how the File Explorer is built. For the method reference see [documentation.md](documentation.md);
for the reasoning behind each choice see [decisions.md](decisions.md).

## 1. The big picture

```
┌──────────────────────── app/ (React + Vite) ────────────────────────┐
│  Components ── hooks ──► useSyncExternalStore ──┐                   │
│  (UI state only: selection, expanded, pending)  │ subscribe/        │
└─────────────────────────────────────────────────┼─ getSnapshot ────┘
                                                  ▼
┌──────────────────────── SDK/ (plain JavaScript) ────────────────────┐
│  FileExplorer  ── the only public class                             │
│    ├─ state.js    pure operations: create / rename / move / delete  │
│    ├─ search.js   filter + sort + paginate                          │
│    ├─ tree.js     builds the nested tree for display                │
│    └─ error.js    FileExplorerError + error codes                   │
└─────────────────────────────────────────────────────────────────────┘
```

Two rules shape everything:

1. **The SDK is the source of truth.** It has no React, no DOM and no dependencies, so it also runs in Node.
2. **React only holds UI state.** File data is never copied into React state; the UI reads it from the SDK.

## 2. Data model

The file system is one immutable value:

```js
state = { nodes: Map<id, node>, rootId }

node  = { id, name, type: 'file' | 'folder', parentId, childIds: [id, ...] }
```

Example, for `My Files → Documents → Resume.pdf`:

| id | name | type | parentId | childIds |
|---|---|---|---|---|
| a1 | My Files | folder | `null` | `[b2]` |
| b2 | Documents | folder | a1 | `[c3]` |
| c3 | Resume.pdf | file | b2 | `[]` |

Why this shape:

- **Flat map + ids, not nested objects.** Finding an item by id is one lookup, and rename or move touches only a few nodes instead of rebuilding a deep tree.
- **Both `parentId` and `childIds`.** Going up (path, descendant check) and going down (delete, render) are both cheap.
- **Stable ids.** Rename and move change `name` or `parentId` only, so identity never changes.
- **Frozen.** Nodes and states are `Object.freeze`d, so consumers cannot change SDK data by accident.

For display, `getTree()` builds a nested view (`{ id, name, type, children: [...] }`) from the map. Unchanged subtrees are reused between snapshots (same object), which lets React skip re-rendering them.

## 3. How a change flows

```
fs.rename(id, 'New')
   │
   ▼
renameNode(state, id, name)      pure function: validate, return NEW state or throw
   │  throws?  ─► nothing changes: no history, no notification
   ▼
#commit                          push { before, after, change } to undo stack,
   │                             clear redo stack, replace state
   ▼
#publish                         log activity, build new snapshot, notify listeners
   │
   ▼
React re-renders via useSyncExternalStore
```

Validation lives in the pure functions, so a failed operation can never leave the structure half-changed.

Rules enforced: unique names per folder (case-insensitive), files cannot have children, a folder cannot move into itself or its descendants, the root cannot be renamed, moved or deleted, and names must be valid. Each failure throws a `FileExplorerError` with a code such as `DUPLICATE_NAME` or `MOVE_INTO_DESCENDANT`.

## 4. Undo / redo and transactions

- **History** is a linear stack of `{ before, after, change }`. States are immutable and share unchanged nodes, so keeping both is cheap.
- **Undo** restores `before`; **redo** restores `after`. A deleted folder comes back whole, with its original ids, because the old state still contains the subtree.
- A **new successful action clears redo**. A **failed action adds nothing** to history. History is capped at 100 entries.
- **Transactions** (`fs.transaction(fn)`) run several operations on a private draft. If any step fails, nothing is applied. On success there is one state change, one undo entry and one notification. `deleteMany` uses this for bulk delete.

## 5. Search

`fs.search({ query, type, sortBy, order, page, pageSize })` scans the map, filters by case-insensitive name and optional type, sorts, and paginates. Each result has `name`, `type`, `path` and `location`. It is read-only and invalid options throw a clear error.

## 6. React side

| Piece | Role |
|---|---|
| `useFileExplorer` | `useSyncExternalStore(fs.subscribe, fs.getSnapshot)`; subscribes on mount, unsubscribes on unmount |
| `useExplorerUI` | UI-only state: expanded folders, selected item, checked items, error, pending flag. One subscription drops ids of deleted items |
| `FileTree` / `TreeNode` | Recursive tree. `TreeNode` is `memo`ized with a custom comparison and logs each render |
| `Toolbar` | Create, rename, move, delete, bulk delete |
| `SearchPanel` | Search controls and results; query state is local, so typing never re-renders the tree |
| `DetailsPanel`, `ActivityPanel`, `UndoRedoBar`, `ErrorBanner` | Details, recent changes, undo/redo buttons, errors |

Every SDK call from the UI goes through `run()`, which sets the pending flag, clears the old error, and shows any error the SDK throws.

## 7. Where things are

```
SDK/src/    FileExplorer.js  state.js  search.js  tree.js  error.js  index.js
SDK/tests/  SDK tests (44)
app/src/    App.jsx  components/  hooks/  fileExplorer.js (the shared SDK instance)
app/tests/  React tests (20)
```
