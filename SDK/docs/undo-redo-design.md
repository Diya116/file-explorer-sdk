# Undo / Redo Design

How undo and redo work today (snapshot based), what it costs, and how a command based version
would differ. Code: [src/FileExplorer.js](../src/FileExplorer.js) and [src/state.js](../src/state.js).

## 1. Current design: snapshot based

### Idea

The file system is an **immutable state**. Every operation is a pure function that returns a *new* state
and never edits the old one. So "the file system before" and "the file system after" are both just
values we can keep.

```js
// one history entry
{ before: State, after: State, change: { type, ids, label } }
```

```
undoStack: [ e1, e2, e3 ]      redoStack: [ ]
```

### How it works

| Action | What happens |
|---|---|
| **Operation succeeds** | push `{ before, after, change }` on `undoStack`, **clear `redoStack`**, current state = `after` |
| **Operation fails** | the pure function throws first, so nothing is pushed, nothing changes, nobody is notified |
| **Undo** | pop the entry, push it on `redoStack`, current state = `entry.before` |
| **Redo** | pop the entry, push it on `undoStack`, current state = `entry.after` |
| **Transaction** | many operations run on a private draft; on success they become **one** entry |
| **Limit** | at most 100 entries; the oldest is dropped |

Undo and redo do no real work: they only swap which saved state is current. Nothing is computed or
re-validated, so they cannot fail halfway or leave the tree inconsistent.

### Example: undoing a folder delete

```
Before delete:  Images ─ Photo.png, Logo.svg           (state S1)
delete(Images)  → S2 has no Images, no Photo, no Logo
undo()          → current state = S1
```

The whole subtree comes back with its **original ids**, because S1 still contains it. There is no
special "restore children" logic to write or get wrong.

### Why it stays cheap: structural sharing

Creating a new state copies the `Map` but **reuses every node object that did not change**. A rename
creates one new node; the other nodes are the same objects in both `before` and `after`. The
`getTree()` snapshot is shared the same way, which also lets React skip unchanged subtrees.

### Redo rule

Doing a new successful operation after an undo **clears redo history**. The redo entries describe a
future that no longer follows from the current state, so they are discarded (same as most editors).

## 2. Tradeoffs of the current design

**Strengths**

- **Simple and hard to break.** Undo/redo is two assignments. No inverse logic per operation.
- **Always consistent.** You only ever land on a state that was valid when it was created.
- **Automatically complete.** A new operation type works with undo/redo with no extra code.
- **Nested restore is free.** Deleted subtrees return exactly as they were, ids included.
- **Transactions fit naturally.** A transaction is just one before/after pair.
- **Easy to test.** Compare states; no need to verify that an inverse really inverts.

**Weaknesses**

- **Memory grows with tree size.** Each entry holds two full `Map`s. Nodes are shared, but the Map
  itself (one slot per item) is copied, so memory is roughly `entries × items` for map slots.
  With the 100 entry cap and a small tree this is fine; with 100,000 items it is not.
- **Each operation costs O(n).** Copying the Map is linear in the number of items, even to rename one file.
- **No selective or partial history.** You cannot undo operation 3 while keeping 4, and history
  cannot be serialized as a small log (it holds whole states).
- **Hard to sync or persist.** There is no compact "what happened" record to send to a server or
  store; the `change` object is only a label for the activity log.
- **Whole-state undo.** Undo restores the entire state, so if the SDK ever allowed overlapping edits
  (e.g. collaboration), undo would overwrite someone else's changes.
- **Cap drops old history.** The 100 entry limit exists because entries are not free.

## 3. Alternative: command based

### Idea

Instead of saving states, save **what was done and how to reverse it**. Each entry is a small command
with `do` and `undo` data.

```js
// examples
{ type: 'rename', id, from: 'Notes.txt', to: 'Todo.txt' }
{ type: 'move',   id, fromParent: 'a1', toParent: 'b2' }
{ type: 'create', node }                                   // undo = delete node
{ type: 'delete', removed: [ ...every node in the subtree ], parentId }   // undo = re-insert them
```

Undo applies the inverse command to the **current** state; redo applies the command again.

### What it would look like here

```js
undo() {
  const cmd = this.#undoStack.pop()
  this.#state = applyInverse(this.#state, cmd)   // e.g. rename back, re-insert deleted subtree
  this.#redoStack.push(cmd)
}
```

Because the SDK's operations are already pure functions `(state, args) → { state, change }`, the
change is partly there already. Each operation would also need to return enough data to invert
itself (the old name, the old parent, the removed nodes).

### Tradeoffs of command based

| | Snapshot (current) | Command based |
|---|---|---|
| Memory per entry | Map copy, O(n) | O(size of the change) |
| Time per operation | O(n) Map copy | O(change) if the state is edited efficiently |
| Undo/redo logic | trivial (swap) | needs a correct inverse for **every** operation |
| Risk of bugs | very low | inverse mistakes, ordering bugs, stale state |
| New operation type | works automatically | must write `do` and `undo` |
| Delete undo | free | must store the whole removed subtree |
| Transactions | one before/after pair | a list of commands, undone in reverse order |
| Serializable log / sync | no | yes, small JSON |
| History length | capped (100) | can be much larger |
| Partial/selective undo | no | possible (with conflict checks) |

### Command pitfalls to plan for

- **Inverse must match the current state.** If the state drifted, applying an inverse can fail
  (for example, undoing a rename when the name is now taken). Strict ordering keeps this safe, but it
  must be enforced.
- **Delete is the hard case.** The command must keep every removed node (with ids and child
  links) and the position to re-insert at.
- **Two code paths to keep in sync.** Forward operation and inverse must stay equivalent; this needs
  property tests such as `apply → undo → state equals original`.

## 4. Options to improve without a full rewrite

1. **Persistent data structure (best next step).** Replace `new Map(state.nodes)` with a persistent
   map (HAMT / immutable trie). Then each new state shares most of its structure, so an operation
   costs O(log n) in time and memory while keeping the simple before/after history. Same design,
   far less memory.
2. **Patch based history (hybrid).** Keep snapshots as the model, but store only a *diff* per entry:
   `{ added: [...], removed: [...], changed: [{ id, before, after }] }`. Undo applies the diff in
   reverse. Memory becomes O(change) and the diff can double as the activity record and as a sync
   message. Because the diff is computed from the two states, it avoids writing a hand-made inverse
   per operation.
3. **Periodic checkpoints.** Store a full snapshot every N entries and commands in between.
   Undo replays from the nearest checkpoint. Trades a little undo time for much less memory.
4. **Memory based cap.** Limit history by size instead of a fixed 100 entries.

## 5. Recommendation

For this project (in-memory, small trees, 100 entry cap) **snapshot based is the right choice**:
fewer bugs, nested restore for free, and atomic transactions with no extra work. Move to a
**patch/command based** history if trees grow large, history must be long, or the log needs to be
saved or synced. The smallest upgrade is option 1 or 2 above, which keeps the same public API
(`undo()`, `redo()`, `canUndo()`, `canRedo()`).
