import { fs } from '../fileExplorer'

export default function UndoRedoBar({ canUndo, canRedo, pending, run }) {
  return (
    <div className="undo-redo">
      <button disabled={!canUndo || pending} onClick={() => run(() => fs.undo())}>↶ Undo</button>
      <button disabled={!canRedo || pending} onClick={() => run(() => fs.redo())}>↷ Redo</button>
    </div>
  )
}
