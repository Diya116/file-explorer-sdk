import { useSyncExternalStore } from 'react'
import { fs } from '../fileExplorer'

export function useFileExplorer() {
  return useSyncExternalStore(fs.subscribe, fs.getSnapshot)
}