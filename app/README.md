# File Explorer — React App

A Vite + React interface for the [File Explorer SDK](../SDK/README.md). The app holds **no file data**:
every operation goes through the SDK, and the UI re-renders when the SDK notifies it.

## Run it

Requires Node 20.19+ or 22.12+. Install the SDK's folder first, because the app links to it.

```bash
cd ../SDK && npm install      # once
cd ../app && npm install
npm run dev                   # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | start the dev server |
| `npm run build` | production build into `dist/` |
| `npm run preview` | serve the production build |
| `npm run lint` | ESLint |
| `npm test` | run the tests once (Vitest + Testing Library, jsdom) |
| `npm run test:watch` | re-run tests on every save |

## How the SDK is installed

The SDK is not on npm. `package.json` points at the local folder:

```json
"dependencies": { "sdk": "file:../SDK" }
```

`npm install` links `node_modules/sdk` to `../SDK`, so SDK changes show up without reinstalling.
To set it up in a fresh project: `npm install ../SDK`.
The single SDK instance is created in `src/fileExplorer.js`:

```js
import { FileExplorer } from 'sdk'
export const fs = new FileExplorer()
```

Dev dependencies used for testing: `vitest`, `jsdom`, `@testing-library/react`,
`@testing-library/user-event`, `@testing-library/jest-dom`. Test config is in `vite.config.js`
(`environment: 'jsdom'`, `setupFiles: ./tests/setup.js`).

## Folder structure

```
app/
├── src/
│   ├── main.jsx              entry point
│   ├── App.jsx               layout: wires the SDK snapshot and UI state into the panels
│   ├── fileExplorer.js       the shared SDK instance
│   ├── hooks/
│   │   ├── useFileExplorer.js  subscribes to the SDK (useSyncExternalStore)
│   │   └── useExplorerUI.js    UI-only state: expanded, selected, checked, error, pending
│   └── components/
│       ├── FileTree.jsx        tree wrapper
│       ├── TreeNode.jsx        recursive node (memoized, logs every render)
│       ├── Toolbar.jsx         create / rename / move / delete / delete selected
│       ├── SearchPanel.jsx     search, filter, sort, pagination
│       ├── DetailsPanel.jsx    info about the selected item
│       ├── ActivityPanel.jsx   recent changes
│       ├── UndoRedoBar.jsx     undo / redo buttons
│       └── ErrorBanner.jsx     SDK error messages
├── tests/
│   ├── App.test.jsx          20 tests
│   └── setup.js              jest-dom matchers + cleanup
└── vite.config.js
```

## State: who owns what

| Data | Owner |
|---|---|
| Files, folders, history, activity | **SDK** (read via `useSyncExternalStore(fs.subscribe, fs.getSnapshot)`) |
| Expanded folders, selected item, checked items, error, pending | **React**, in `useExplorerUI` |
| Search query and filters | **React**, local to `SearchPanel` |
| Name and "move to" inputs | **React**, local to `Toolbar` |

- The subscription is removed on unmount. One subscription in `useExplorerUI` drops deleted ids from
  selection, expanded and checked sets, so state stays consistent after deletes and undo/redo.
- Every SDK call goes through `run()`, which sets the pending flag, clears the old error, awaits the
  action and shows any error. The SDK itself is synchronous.

## Re-render behaviour and optimizations

`TreeNode` logs `render TreeNode: <name>` on every render. Open the browser console to watch it.

1. **Structural sharing in the SDK.** `getTree()` reuses the same object for every subtree that did not
   change, so `node` props stay referentially equal.
2. **`React.memo` with a custom comparison** on `TreeNode`. The `expanded`/`checked` Sets and
   `selectedId` are new on every change, so plain `memo` would re-render the whole tree. The comparison
   re-renders a node only when its `node` changed, or when a changed id lives in its own subtree.
3. **Stable callbacks** (`useCallback` with functional `setState`), so handlers never change identity.
4. **State placement.** Search and input state are local to their panels, so typing never re-renders the tree.

| Action | Nodes that re-render |
|---|---|
| Expand / collapse a folder | that folder and its ancestors; siblings do not |
| Select a file | previous and new selection and their ancestors only |
| Create / rename / move | the changed item and its ancestor chain |
| Delete a folder | its ancestor chain; the removed subtree unmounts |
| Type in the search box | none |

React StrictMode double-renders on first mount in development; that is expected.

## Bonus: multi-selection

Checkboxes select several items; the toolbar shows "N selected". **Delete selected** calls
`fs.deleteMany(ids)`, one atomic transaction and one undo step. On success the selection clears;
on failure it stays and the error is shown.

## Tests

`npm test` runs `tests/App.test.jsx` (20 tests):

- SDK subscription is created on mount, removed on unmount, and not duplicated on re-render
- UI updates for SDK changes made inside and outside React
- toolbar: create, rename, move, delete; move into a descendant shows an error
- error banner for invalid operations; selection cleanup after delete
- undo / redo restoring a deleted folder
- search results updating after changes
- bulk delete success and failure
- re-render behaviour (siblings do not re-render on collapse or select)

Each test gets a fresh SDK instance through a mock of `src/fileExplorer.js`.
