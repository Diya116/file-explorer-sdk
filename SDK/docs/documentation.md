# File Explorer SDK — Method Reference

```js
import { FileExplorer } from 'sdk'
```

Every method that changes data throws an error with a `code` property when the input is invalid.
When that happens nothing is changed.

All examples below use this setup:

```js
const fs = new FileExplorer()
const rootId = fs.getTree().id
```

## Methods

| Reading | Changing | History | Events |
|---|---|---|---|
| [`new FileExplorer()`](#new-fileexploreroptions) | [`createFile`](#createfileparentid-name) | [`undo`](#undo) | [`subscribe`](#subscribelistener) |
| [`getTree`](#gettree) | [`createFolder`](#createfolderparentid-name) | [`redo`](#redo) | [`listenerCount`](#listenercount) |
| [`getItem`](#getitemid) | [`rename`](#renameid-newname) | [`canUndo`](#canundo) | |
| [`getPath`](#getpathid) | [`move`](#moveid-newparentid) | [`canRedo`](#canredo) | |
| [`getSnapshot`](#getsnapshot) | [`delete`](#deleteid) | | |
| [`search`](#searchoptions) | [`deleteMany`](#deletemanyids) | | |
| | [`transaction`](#transactionfn-options) | | |

---

## new FileExplorer(options?)

Creates a file explorer.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `options.initialData` | `{ name, children? }` | No | Starting tree. An entry with a `children` array is a folder; any other entry is a file. Default: an example tree (`My Files` with `Documents`, `Images`, `Notes.txt`). |
| `options.generateId` | `() => string` | No | Your own id generator. |
| `options.now` | `() => number` | No | Your own clock (milliseconds) for activity timestamps. |

**Returns:** a `FileExplorer` instance.

```js
const fs = new FileExplorer({
  initialData: {
    name: 'Project',
    children: [
      { name: 'src', children: [{ name: 'index.js' }] },
      { name: 'README.md' },
    ],
  },
})
```

---

## getTree()

Returns the complete hierarchy.

**Parameters:** none

**Returns:** the root node. Each node is `{ id, name, type, parentId, children? }`.
`type` is `'file'` or `'folder'`. Only folders have `children`. Folders are listed before files, then A–Z.

```js
const tree = fs.getTree()
console.log(tree.name)                       // 'My Files'
console.log(tree.children.map((c) => c.name)) // ['Documents', 'Images', 'Notes.txt']
```

---

## getItem(id)

Finds one file or folder.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Id of the item. |

**Returns:** `{ id, name, type, parentId, childIds }`, or `null` if no item has that id.
`childIds` is the list of ids inside a folder (empty for files).

```js
const docs = fs.getTree().children.find((c) => c.name === 'Documents')
const item = fs.getItem(docs.id)
console.log(item.name, item.type)            // 'Documents' 'folder'
console.log(fs.getItem('unknown'))           // null
```

---

## getPath(id)

Gets the location of an item.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Id of the item. |

**Returns:** `string[]` — names from the root down to the item.

**Throws:** `NOT_FOUND`

```js
const fileId = fs.createFile(rootId, 'a.txt')
console.log(fs.getPath(fileId))              // ['My Files', 'a.txt']
```

---

## getSnapshot()

Returns the current state in one object. It is the same object until something changes, which makes it
suitable for React's `useSyncExternalStore`.

**Parameters:** none

**Returns:**

| Field | Type | Description |
|---|---|---|
| `version` | `number` | Increases by 1 after every change, including undo and redo. |
| `tree` | node | Same as `getTree()`. |
| `canUndo` | `boolean` | Whether `undo()` will do something. |
| `canRedo` | `boolean` | Whether `redo()` will do something. |
| `activity` | `{ id, type, label, timestamp }[]` | Recent changes, newest first (up to 50). |

```js
const { version, canUndo, activity } = fs.getSnapshot()
console.log(version, canUndo, activity[0]?.label)
```

---

## search(options)

Finds files and folders anywhere in the hierarchy.

| Option | Type | Default | Description |
|---|---|---|---|
| `query` | `string` | — | Text to look for in names. Not case-sensitive. |
| `type` | `'all' \| 'file' \| 'folder'` | `'all'` | Filter by type. |
| `sortBy` | `'name' \| 'type' \| 'path'` | `'name'` | Sort field. |
| `order` | `'asc' \| 'desc'` | `'asc'` | Sort direction. |
| `page` | integer ≥ 1 | `1` | Page number. |
| `pageSize` | integer 1–100 | `10` | Results per page. |

**Returns:**

```js
{
  items: [{ id, name, type, path, location }],   // path: 'My Files/Documents/Resume.pdf'
                                                  // location: 'My Files/Documents'
  total,        // all matches
  page,
  pageSize,
  totalPages,
  query
}
```

An empty query returns an empty `items` array. A page past the end also returns an empty `items` array.
The root folder is never returned.

**Throws:** `INVALID_SEARCH_OPTIONS`

```js
const result = fs.search({ query: 'resume', type: 'file', sortBy: 'name', page: 1, pageSize: 5 })
console.log(result.total)                    // 1
console.log(result.items[0].path)            // 'My Files/Documents/Resume.pdf'
```

---

## createFile(parentId, name)

Adds a file inside a folder.

| Parameter | Type | Description |
|---|---|---|
| `parentId` | `string` | Id of the folder to add it to. |
| `name` | `string` | Name of the file. |

**Returns:** `string` — the id of the new file.

**Throws:** `NOT_FOUND`, `PARENT_NOT_FOLDER`, `INVALID_NAME`, `DUPLICATE_NAME`

```js
const id = fs.createFile(rootId, 'report.txt')
```

Names are trimmed, 1–255 characters, cannot contain `/` or `\`, cannot be `.` or `..`, and must be unique in
the folder ignoring letter case.

---

## createFolder(parentId, name)

Adds a folder inside a folder.

| Parameter | Type | Description |
|---|---|---|
| `parentId` | `string` | Id of the folder to add it to. |
| `name` | `string` | Name of the folder. |

**Returns:** `string` — the id of the new folder.

**Throws:** `NOT_FOUND`, `PARENT_NOT_FOLDER`, `INVALID_NAME`, `DUPLICATE_NAME`

```js
const workId = fs.createFolder(rootId, 'Work')
fs.createFile(workId, 'notes.txt')
```

---

## rename(id, newName)

Changes the name of a file or folder. Its id does not change.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Id of the item. |
| `newName` | `string` | The new name. |

**Returns:** nothing.

**Throws:** `NOT_FOUND`, `CANNOT_MODIFY_ROOT`, `INVALID_NAME`, `DUPLICATE_NAME`, `NO_CHANGE`

```js
const id = fs.createFile(rootId, 'draft.txt')
fs.rename(id, 'final.txt')
console.log(fs.getItem(id).name)             // 'final.txt'
```

---

## move(id, newParentId)

Moves a file or folder into another folder. Its id does not change.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Id of the item to move. |
| `newParentId` | `string` | Id of the destination folder. |

**Returns:** nothing.

**Throws:** `NOT_FOUND`, `CANNOT_MODIFY_ROOT`, `PARENT_NOT_FOLDER`, `MOVE_INTO_DESCENDANT`, `DUPLICATE_NAME`, `NO_CHANGE`

```js
const workId = fs.createFolder(rootId, 'Work')
const fileId = fs.createFile(rootId, 'report.txt')
fs.move(fileId, workId)
console.log(fs.getPath(fileId))              // ['My Files', 'Work', 'report.txt']
```

A folder cannot be moved into itself or into one of its own subfolders.

---

## delete(id)

Removes a file, or a folder together with everything inside it.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Id of the item. |

**Returns:** nothing.

**Throws:** `NOT_FOUND`, `CANNOT_MODIFY_ROOT`

```js
const folderId = fs.createFolder(rootId, 'Temp')
fs.createFile(folderId, 'a.txt')
fs.delete(folderId)                          // removes the folder and a.txt
fs.undo()                                    // brings both back
```

---

## deleteMany(ids)

Deletes several items as a single operation, so one `undo()` brings them all back. If an item is inside
another selected folder, it is deleted together with that folder.

| Parameter | Type | Description |
|---|---|---|
| `ids` | `string[]` | Ids of the items to delete. Must not be empty. |

**Returns:** nothing.

**Throws:** `INVALID_ARGUMENT`, `NOT_FOUND`, `CANNOT_MODIFY_ROOT`

```js
const a = fs.createFile(rootId, 'a.txt')
const b = fs.createFile(rootId, 'b.txt')
fs.deleteMany([a, b])
fs.undo()                                    // both files return
```

---

## transaction(fn, options?)

Runs several operations as one unit. Either all of them are applied or none. The whole transaction is one
undo step and sends one notification.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `fn` | `(tx) => any` | Yes | A **synchronous** function that receives `tx`. |
| `options.label` | `string` | No | Text shown in the activity list. |

`tx` has these methods, with the same parameters as the methods of the same name above:
`tx.createFile(parentId, name)`, `tx.createFolder(parentId, name)`, `tx.rename(id, newName)`,
`tx.move(id, newParentId)`, `tx.delete(id)`. The two `create` methods return the new id, so later steps can use it.

**Returns:** whatever `fn` returns.

**Throws:** `INVALID_ARGUMENT` if `fn` is not a function, `TRANSACTION_ASYNC` if `fn` returns a promise, and any
error from the operations inside it. If anything throws, nothing is applied.

```js
const fileId = fs.createFile(rootId, 'old.txt')

fs.transaction((tx) => {
  const archive = tx.createFolder(rootId, 'Archive')
  tx.move(fileId, archive)
  tx.rename(fileId, 'archived.txt')
}, { label: 'Archive old.txt' })

fs.undo()                                    // reverts all three steps at once
```

Use `tx` only while `fn` is running. Do any async work before calling `transaction`.

---

## undo()

Reverts the most recent change. A transaction or `deleteMany` counts as one change.

**Parameters:** none

**Returns:** `boolean` — `true` if something was undone, `false` if there was nothing to undo.

```js
const id = fs.createFile(rootId, 'a.txt')
fs.undo()                                    // true — the file is gone
console.log(fs.getItem(id))                  // null
console.log(fs.undo())                       // false if there is nothing left to undo
```

History keeps the last 100 changes.

---

## redo()

Re-applies the change that was just undone.

**Parameters:** none

**Returns:** `boolean` — `true` if something was redone, `false` if there was nothing to redo.

```js
const id = fs.createFile(rootId, 'a.txt')
fs.undo()
fs.redo()                                    // true — the file is back with the same id
console.log(fs.getItem(id).name)             // 'a.txt'
```

Making a new change after an undo clears what could have been redone.

---

## canUndo()

**Parameters:** none

**Returns:** `boolean` — whether `undo()` will do something.

```js
undoButton.disabled = !fs.canUndo()
```

---

## canRedo()

**Parameters:** none

**Returns:** `boolean` — whether `redo()` will do something.

```js
redoButton.disabled = !fs.canRedo()
```

---

## subscribe(listener)

Calls your function after every successful change, including undo and redo. It is never called when an
operation fails.

| Parameter | Type | Description |
|---|---|---|
| `listener` | `(event) => void` | Function to call. |

The `event` passed to your function:

| Field | Description |
|---|---|
| `type` | `'create'`, `'rename'`, `'move'`, `'delete'`, `'transaction'`, `'undo'` or `'redo'` |
| `ids` | Ids of the items that changed. |
| `label` | A readable description, e.g. `Undo: Created report.txt`. |
| `version` | Same number as `getSnapshot().version`. |

**Returns:** `unsubscribe()` — call it to stop receiving events. Calling it more than once is safe.

**Throws:** `INVALID_ARGUMENT` if `listener` is not a function.

```js
const unsubscribe = fs.subscribe((event) => {
  console.log(event.type, event.label)
})

fs.createFile(rootId, 'a.txt')               // logs: create ...
unsubscribe()
fs.createFile(rootId, 'b.txt')               // nothing is logged
```

---

## listenerCount

A property (not a method) with the number of active subscriptions.

```js
const unsubscribe = fs.subscribe(() => {})
console.log(fs.listenerCount)                // 1
unsubscribe()
console.log(fs.listenerCount)                // 0
```

---

## Handling errors

```js
import { FileExplorerError } from 'sdk'

try {
  fs.createFile(rootId, 'A.txt')
  fs.createFile(rootId, 'a.TXT')             // same name ignoring case
} catch (error) {
  if (error instanceof FileExplorerError) {
    console.log(error.code)                  // 'DUPLICATE_NAME'
    console.log(error.message)               // readable explanation
  }
}
```

| Code | Meaning |
|---|---|
| `NOT_FOUND` | The id does not exist. |
| `INVALID_NAME` | Empty, too long, or contains forbidden characters. |
| `DUPLICATE_NAME` | The folder already has an item with that name. |
| `PARENT_NOT_FOLDER` | The target parent is a file. |
| `MOVE_INTO_DESCENDANT` | A folder was moved into itself or one of its subfolders. |
| `CANNOT_MODIFY_ROOT` | Rename, move or delete was attempted on the root. |
| `NO_CHANGE` | The new name or folder is the same as the current one. |
| `INVALID_ARGUMENT` | An argument has the wrong type. |
| `INVALID_SEARCH_OPTIONS` | A search option has an invalid value. |
| `TRANSACTION_CLOSED` | `tx` was used after its transaction finished. |
| `TRANSACTION_ASYNC` | The transaction function returned a promise. |
