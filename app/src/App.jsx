import { useExplorerUI } from './hooks/useExplorerUI'
import { useFileExplorer } from './hooks/useFileExplorer'
import ActivityPanel from './components/ActivityPanel'
import DetailsPanel from './components/DetailsPanel'
import ErrorBanner from './components/ErrorBanner'
import FileTree from './components/FileTree'
import SearchPanel from './components/SearchPanel'
import Toolbar from './components/Toolbar'
import UndoRedoBar from './components/UndoRedoBar'
import './App.css'

export default function App() {
  const snap = useFileExplorer() // SDK data (source of truth)
  const ui = useExplorerUI() // UI-only state

  return (
    <div className="app">
      <header>
        <h1>File Explorer</h1>
        <UndoRedoBar canUndo={snap.canUndo} canRedo={snap.canRedo} pending={ui.pending} run={ui.run} />
      </header>
      <ErrorBanner message={ui.error} onDismiss={ui.dismissError} />
      <main>
        <section className="panel">
          <h3>Files</h3>
          <FileTree tree={snap.tree} ui={ui} />
        </section>
        <div className="column">
          <Toolbar
            tree={snap.tree}
            selectedId={ui.selectedId}
            checkedIds={[...ui.checked]}
            pending={ui.pending}
            run={ui.run}
            reveal={ui.reveal}
            clearChecked={ui.clearChecked}
          />
          <DetailsPanel selectedId={ui.selectedId} version={snap.version} />
          <SearchPanel version={snap.version} onPick={ui.reveal} />
        </div>
        <ActivityPanel activity={snap.activity} />
      </main>
    </div>
  )
}
