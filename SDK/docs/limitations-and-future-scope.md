# Limitations and Future Scope

What the current implementation does not do, why, and what could come next.
No requirement from the assignment is missing; these are known boundaries and ideas for improvement.

## 1. Current limitations

### Data and storage
- **In-memory only.** Refreshing the page resets everything, including undo history and the activity log.
- **Items are names only.** Files have no content, size, type metadata or timestamps.
- **One shared SDK instance in the app.** `app/src/fileExplorer.js` exports a single `fs`, so the app shows one file system at a time (tests swap it with a mock).
- **The root folder is fixed.** It cannot be renamed, moved or deleted.

### SDK
- **Snapshot-based undo/redo.** Simple and safe, but every operation copies the node `Map`, so time and memory grow with the number of items. See [undo-redo-design.md](undo-redo-design.md).
- **History is capped at 100 entries** and the activity log at 50. Older entries are dropped.
- **Linear history.** No branching, no selective undo (you cannot undo step 3 and keep step 4).
- **Transactions must be synchronous.** An async callback is rejected, and `tx` stops working after the callback returns. Nested transactions are not supported.
- **Search is a plain substring match** on the name (case-insensitive). No fuzzy search, regex, wildcards or search inside paths. Every search scans the whole tree.
- **Listener errors are swallowed.** A throwing subscriber is logged with `console.error` so others still run, but the caller gets no error.
- **No bulk move, rename or copy.** Only bulk delete is atomic out of the box (other bulk actions can be built with `transaction()`).
- **No copy, paste or duplicate.**
- **Single-user.** No conflict handling if several clients edit the same data.

### React app
- **Move uses a dropdown,** not drag and drop.
- **Selection is checkbox only.** No shift or ctrl range selection, and no select-all.
- **Rename and create share one input** in the toolbar, so there is no inline rename in the tree.
- **The pending state is very short.** The SDK is synchronous, so the pending flag and disabled buttons are mostly visible only in theory (the plumbing is there for async actions).
- **Re-render optimization has a cost.** The custom `memo` comparison walks a node's subtree, which is fine for small and medium trees but not for very large ones.
- **No virtualization.** Every expanded node is rendered in the DOM.
- **Fixed search page size** (5) and no persistence of search or expanded state.
- **Minimal styling and limited accessibility.** Basic labels and roles exist, but there is no keyboard navigation of the tree (arrow keys) and no full screen-reader testing.

### Testing and tooling
- Tests run in jsdom, not a real browser. There are no end-to-end tests.
- Re-render behaviour is tested by counting renders, not measured with a profiler.
- There is no CI pipeline and no TypeScript types (JSDoc comments only).
- Needs Node 20.19+ or 22.12+ because of Vite 8 and Vitest 5.

## 2. Future scope

Grouped by value for the effort, roughly in the order worth doing.

### Quick wins
| Idea | Why |
|---|---|
| Drag and drop to move items | Natural interaction; the SDK `move()` already validates it |
| Shift/ctrl multi-select and select all | Completes the multi-selection bonus |
| Inline rename (double click or F2) | Faster than the toolbar input |
| Keyboard navigation and ARIA tree roles | Accessibility |
| Bulk move through `transaction()` | Same pattern as `deleteMany` |
| Keyboard shortcuts (Ctrl+Z / Ctrl+Y, Delete) | Expected in file managers |

### SDK improvements
| Idea | Why |
|---|---|
| Copy, paste and duplicate (with automatic "copy of" naming) | Common file operations; fits in a transaction |
| Persistence (`toJSON()` / `fromJSON()`, then `localStorage` or IndexedDB) | Survive refresh; the flat `Map` serializes easily |
| Persistent map (HAMT) or diff-based history | Cheaper operations and memory for large trees, same public API |
| Memory-based history limit and optional history export | Long sessions without unbounded growth |
| Richer search: fuzzy, regex, path search, search ranking | Better results on big trees |
| Search index maintained on change | Avoid scanning the whole tree on every query |
| Typed API (`.d.ts` or TypeScript) | Better editor support for SDK users |
| Async-aware transactions or an "unit of work" API | Allow I/O before commit without breaking atomicity |
| Event types per change (`created`, `moved`, ...) with filtering | Let subscribers listen only for what they need |
| Metadata: size, timestamps, file content | Move toward a real file manager |

### Scaling the UI
| Idea | Why |
|---|---|
| Virtualized tree (render only visible rows) | Needed for thousands of items |
| Per-node subscriptions or selectors instead of the subtree-walking `memo` | Less work per update on large trees |
| Debounced search and a result list that updates incrementally | Smoother typing on big data |
| Persist UI state (expanded folders, selection) | Restore the view after reload |

### Bigger directions
- **Backend sync.** Send the change log to a server. A command or diff-based history (see [undo-redo-design.md](undo-redo-design.md)) makes this practical.
- **Collaboration.** Needs per-user history and conflict handling; whole-state undo would have to be replaced.
- **Real browser tests.** Add Playwright for end-to-end flows, and CI to run `npm run setup && npm test` on every push.
- **Publish the SDK** as its own npm package with a stable versioned API.

## 3. Summary

The project meets the assignment and both bonus items. The main trade-offs are chosen on purpose:
simple and safe over fast at huge scale (snapshot history, subtree-aware `memo`), and in-memory over
persistent. The first things to improve, if this continues, are persistence, drag and drop, and a
cheaper history for large trees.
