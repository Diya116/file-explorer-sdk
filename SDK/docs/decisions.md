# Design decisions and trade-offs

Each section gives the decision, why it was made, and a short **Trade-off / limitation**.
`n` is the total number of items, `d` is how deep the tree goes, `k` is the number of children in one folder.

---

## 1. Storage: Map + `parentId` + `childIds`

Three ways to store `My Files` → `Docs` → `a.txt` were compared.

### Option A: Nested objects

```js
{ name: 'My Files', children: [
    { name: 'Docs', children: [ { name: 'a.txt' } ] }
]}
```

| Task | Cost |
|---|---|
| Find an item by id | O(n), you search from the top |
| Find its parent | O(n), the item doesn't know its parent |
| Move | O(n) to find both folders, then rebuild every ancestor |
| List a folder | O(1) |

Good: looks like the real tree, easy to render.
Bad: everything starts with a search, and a deep edit rebuilds the path to the root.

### Option B: Flat list of rows

```js
[
  { id: 1, name: 'My Files', parentId: null },
  { id: 2, name: 'Docs',     parentId: 1 },
  { id: 3, name: 'a.txt',    parentId: 2 },
]
```

| Task | Cost |
|---|---|
| Find by id | O(n) |
| Find parent | O(n) |
| List a folder | O(n) |
| Move | O(n), find the row and change its `parentId` |

Good: simple, and a move is one field change.
Bad: every lookup is a loop, and child order isn't stored.

### Option C: Map + links (chosen)

```js
Map {
  1 => { name: 'My Files', parentId: null, childIds: [2] },
  2 => { name: 'Docs',     parentId: 1,    childIds: [3] },
  3 => { name: 'a.txt',    parentId: 2,    childIds: []  },
}
```

| Task | Cost |
|---|---|
| Find by id | O(1) |
| Find parent | O(1) |
| List a folder | O(k) |
| Path to root | O(d) |
| Move | edit 3 items only |

| | Nested | Flat list | Map + links |
|---|---|---|---|
| Find by id | O(n) | O(n) | **O(1)** |
| Find parent | O(n) | O(n) | **O(1)** |
| List folder | O(1) | O(n) | O(k) |
| Move | rebuild ancestors | O(n) | **3 edits** |
| Easy to render | **yes** | no | needs `tree.js` |
| Easy to keep correct | **yes** | **yes** | must sync 2 links |

**Why:** almost every operation starts with "find this item by id" (create, rename, move, delete, select). The "no move into a descendant" rule also needs to walk up through `parentId`.

**Trade-off / limitation:**
- `parentId` and `childIds` store the same link twice, so every change must update both. A missed update corrupts the tree. All edits go through small functions in `state.js` for this reason.
- The UI needs `tree.js` to build a nested view.
- The O(1) and O(n) figures come from how these structures normally behave. They have not been benchmarked on this code.

---

## 2. Immutable state

Nodes and state are frozen. An action copies the Map (`changeState`) and returns a new state. The old state is never touched.

**Why:** a failed action cannot corrupt the tree, and old states are safe to keep for undo.

**Trade-off / limitation:**
- Each action copies the Map, which is O(n) in pointers. The items themselves are shared, not copied.
- More short-lived objects are created than with in-place edits.

---

## 3. Stable unique ids

Ids come from `crypto.randomUUID()`, with a timestamp + counter fallback. `createNode` retries if an id already exists. Rename and move never change the id.

**Why:** selection, expanded folders and undo all refer to items by id, and the requirements ask for stable identity.

**Trade-off / limitation:**
- The fallback id format is only unique within one running page, not globally.
- `generateId` and `now` can be injected for tests. A bad custom generator is guarded only by the retry loop.

---

## 4. Names unique per folder, ignoring case, across files and folders

One check compares the new name with every child of the folder, ignoring case and item type.

**Why:** matches the requirement, and also matches Windows and macOS.

**Trade-off / limitation:**
- `Notes` and `notes` cannot sit together, which would be legal on Linux.
- The check scans the folder's children, so it is O(k).
- No file extension is required, so `hello` is a valid file name.

---

## 5. Returned data cannot change the SDK

Consumers get a separate frozen tree (`tree.js`), frozen search results and frozen activity entries, not the internal Map.

**Why:** requirement 3.2 #8. Writes to returned data must not bypass validation, undo or subscribers.

**Trade-off / limitation:**
- `Object.freeze` is shallow, so each layer returned must be frozen by hand. A forgotten layer would leak a mutable object.
- Two shapes of the same data exist (internal Map and view tree).

---

## 6. View tree with structural sharing

`tree.js` caches by node in a `WeakMap`. If a node and its children are unchanged, the same tree object is returned.

**Why:** React `memo` can skip unchanged subtrees, which is the point of the re-render requirement.

**Trade-off / limitation:**
- The cache logic is more subtle than a plain rebuild.
- The tree is rebuilt recursively on each change, but unchanged parts are only compared by reference.

---

## 7. Undo/redo: two stacks of `before` / `after` states

**Data structure:** two plain arrays used as stacks (`#undoStack`, `#redoStack`). Each entry is `{ before, after, change }`, where `before` and `after` are immutable states (see section 2).

**How it works:**
- **Action:** push `{ before: current, after: new, change }` on the undo stack, clear the redo stack, make `after` current.
- **Undo:** pop the undo stack, push the entry on the redo stack, make `entry.before` current.
- **Redo:** pop the redo stack, push the entry on the undo stack, make `entry.after` current.
- Undo and redo only switch between saved states. They never edit the tree, so the tree cannot end up half-changed.

**Cases:**
- **Failed or no-op action** (duplicate name, move into a descendant, rename to the same name): throws before the commit, so no history entry is created.
- **Folder delete:** `before` still holds the whole subtree, so undo restores every descendant with the original ids. No special restore code.
- **Transaction / `deleteMany`:** all steps run on a private draft and are committed once. One history entry, one notification, one undo. If any step fails, nothing is applied.
- **New action after undo:** the redo stack is cleared. The undone future is dropped.
- **Nothing to undo/redo:** returns `false`, nothing changes.

**Why:** no inverse operations to write or get wrong, and undo/redo are the same code path for every operation type.

**Trade-off / limitation:**
- Each entry holds two full states. Most nodes are shared between states, so only changed nodes cost memory, but it still grows with history.
- History is capped at `MAX_HISTORY = 100`. The oldest steps cannot be undone.
- No branching history: redo steps are lost after a new action.
- Trimming uses `shift()`, which is O(n) on the stack. Fine at a cap of 100.
- The activity log is not rewound. Undo adds an "Undo: ..." line instead.
- For very large trees, storing only the changed nodes (a diff) would use less memory.

---

## 8. Root folder is protected

The root cannot be renamed, moved or deleted.

**Why:** every item always has a valid path to the root.

**Trade-off / limitation:** users cannot rename "My Files".

---

## 9. Activity log is capped

The activity log keeps the latest `MAX_ACTIVITY = 50` entries.

**Why:** bounded memory.

**Trade-off / limitation:** older activity is dropped.

---

## Overall

Immutability, the Map layout and the before/after history work together: simple and safe, at the price of a copy per action and some memory per history entry. This is fine for an in-memory explorer with hundreds or a few thousand items. Nothing here has been benchmarked at larger sizes.
