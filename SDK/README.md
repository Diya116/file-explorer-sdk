# File Explorer SDK

A framework-independent JavaScript SDK that manages an in-memory tree of files and folders.
No React, no DOM, no runtime dependencies, so it runs in the browser, in Node, or in a test.

**Features:** create / rename / move / delete, validation, search (filter, sort, pagination),
undo / redo, change subscriptions, and atomic transactions.

## Folder structure

```
SDK/
├── src/                 SDK source code
│   ├── index.js           public exports (FileExplorer, FileExplorerError, ErrorCodes)
│   ├── FileExplorer.js    the public class: state, undo/redo history, listeners, transactions
│   ├── state.js           pure operations: create / rename / move / delete + validation
│   ├── tree.js            builds the nested read-only tree (reuses unchanged subtrees)
│   ├── search.js          filter, sort and paginate
│   └── error.js           FileExplorerError and ErrorCodes
├── tests/               Vitest tests (one file per source file)
├── docs/                all SDK documentation (see below)
├── package.json
└── vitest.config.js
```

## Getting started

Requires Node 20.19+ or 22.12+.

```bash
cd SDK
npm install
npm test              # run all tests once
npm run test:watch    # re-run tests on every save
```

## Quick example

```js
import { FileExplorer } from './src/index.js'

const fs = new FileExplorer()                 // starts with the "My Files" example tree
const rootId = fs.getTree().id

const unsubscribe = fs.subscribe((event) => console.log(event.label))

const folder = fs.createFolder(rootId, 'Work')
const file = fs.createFile(folder, 'report.txt')
fs.rename(file, 'final.txt')
fs.move(file, rootId)
console.log(fs.search({ query: 'final' }).items)

fs.undo()                                     // file goes back into "Work"
unsubscribe()
```

In the React app the SDK is imported as `import { FileExplorer } from 'sdk'`
(the app lists it as `"sdk": "file:../SDK"` in its `package.json`).

## Running the tests

| Test file | What it checks |
|---|---|
| `tests/state.test.js` | create / rename / move / delete, duplicate names, invalid operations, move into descendants |
| `tests/FileExplorer.test.js` | public class: undo/redo, nested restore, subscriptions, read-only data, activity log, transactions |
| `tests/search.test.js` | case-insensitive nested search, filter, sort, pagination, invalid options, results after changes |
| `tests/tree.test.js` | nested tree shape, frozen objects, structural sharing |
| `tests/error.test.js` | `FileExplorerError` and `ErrorCodes` |

Run one file: `npx vitest run tests/search.test.js`

## Documentation for developers

Everything lives in [docs/](docs/). Start with the first row that matches what you need:

| I want to... | Read |
|---|---|
| See every method, its parameters, return value and an example | [docs/documentation.md](docs/documentation.md) |
| Understand rules, errors, search options, undo/redo and transactions in one place | [docs/sdk-guide.md](docs/sdk-guide.md) |
| Understand the data model and how the pieces fit together | [docs/data-modeling-and-architecture.md](docs/data-modeling-and-architecture.md) |
| Understand how undo/redo works, its tradeoffs and the command-based alternative | [docs/undo-redo-design.md](docs/undo-redo-design.md) |
| Know why each design choice was made | [docs/decisions.md](docs/decisions.md) |
| See current limitations and future ideas | [docs/limitations-and-future-scope.md](docs/limitations-and-future-scope.md) |

## Where each thing comes from

| You need | Look in |
|---|---|
| The public API (`createFile`, `move`, `undo`, `subscribe`, ...) | `src/FileExplorer.js` |
| Validation rules (duplicate names, move into descendants, ...) | `src/state.js` |
| The nested tree returned by `getTree()` | `src/tree.js` |
| Search behaviour and options | `src/search.js` |
| Error codes such as `DUPLICATE_NAME` | `src/error.js` |
| The example "My Files" tree | `DEFAULT_SEED` in `src/FileExplorer.js` |
