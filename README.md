# File Explorer — SDK + React App

VideoSDK assignment. An in-memory file explorer made of two parts:

- **SDK** — a standalone JavaScript library that manages files and folders (create, rename, move,
  delete, search, undo/redo, subscriptions, transactions). No React, no dependencies.
- **App** — a Vite + React interface that uses the SDK for every file operation.

## What is where

```
videosdk-assignment/
├── SDK/            the JavaScript SDK
│   ├── src/          source code
│   ├── tests/        SDK tests (44)
│   └── docs/         all SDK documentation: API, data model, undo/redo, decisions, limitations
├── app/            the React app
│   ├── src/          components and hooks
│   └── tests/        React tests (20)
├── requirement.txt   the assignment
└── package.json      shortcut scripts (setup, dev, test)
```

Each folder has its own README: [SDK/README.md](SDK/README.md) and [app/README.md](app/README.md).

## Quick start

Requires Node 20.19+ or 22.12+.

```bash
npm run setup     # installs SDK/ first, then app/
npm run dev       # app at http://localhost:5173
npm test          # SDK tests, then app tests
npm run lint      # lint the app
```

## Documentation

| Topic | File |
|---|---|
| SDK methods, parameters, return values, examples | [SDK/docs/documentation.md](SDK/docs/documentation.md) |
| SDK guide: rules, errors, search, undo/redo, transactions | [SDK/docs/sdk-guide.md](SDK/docs/sdk-guide.md) |
| Data model and architecture | [SDK/docs/data-modeling-and-architecture.md](SDK/docs/data-modeling-and-architecture.md) |
| Undo/redo implementation and tradeoffs | [SDK/docs/undo-redo-design.md](SDK/docs/undo-redo-design.md) |
| Design decisions | [SDK/docs/decisions.md](SDK/docs/decisions.md) |
| Known limitations and future scope | [SDK/docs/limitations-and-future-scope.md](SDK/docs/limitations-and-future-scope.md) |
| React state, re-render behaviour and optimizations | [app/README.md](app/README.md) |

## Completed

- All required SDK features, validation, search, undo/redo and subscriptions.
- Full React UI: recursive tree, toolbar, search, details, activity, undo/redo, error messages.
- **Bonus 6.1 — atomic transactions:** `fs.transaction(fn)`; all-or-nothing, one notification, one undo step.
- **Bonus 6.2 — multi-selection and bulk delete:** checkboxes, selected count, one-transaction delete.
- Automated tests for the SDK and the app (Vitest).
