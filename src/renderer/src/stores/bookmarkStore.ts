import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { useMapStore, type MapProvider } from './mapStore'

export interface Bookmark {
  id: string
  name: string
  center: [number, number]
  zoom: number
  provider: MapProvider
  createdAt: number
}

export const MAX_BOOKMARKS = 50

interface BookmarkState {
  bookmarks: Bookmark[]
  /** Load persisted bookmarks on startup (no config write-back). */
  setAll: (bookmarks: Bookmark[]) => void
  /** Snapshot the current camera. Returns null when the cap is reached. */
  add: (name: string) => Bookmark | null
  remove: (id: string) => void
  jumpTo: (id: string) => void
}

function persist(bookmarks: Bookmark[]): void {
  window.electronAPI.updateConfig({ bookmarks }).catch(console.error)
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],
  setAll: (bookmarks) => set({ bookmarks }),
  add: (name) => {
    if (get().bookmarks.length >= MAX_BOOKMARKS) return null
    const { center, zoom, provider } = useMapStore.getState()
    const bookmark: Bookmark = {
      id: nanoid(),
      name: name.trim() || `书签 ${get().bookmarks.length + 1}`,
      center,
      zoom,
      provider,
      createdAt: Date.now(),
    }
    const bookmarks = [bookmark, ...get().bookmarks]
    set({ bookmarks })
    persist(bookmarks)
    return bookmark
  },
  remove: (id) => {
    const bookmarks = get().bookmarks.filter((b) => b.id !== id)
    set({ bookmarks })
    persist(bookmarks)
  },
  jumpTo: (id) => {
    const bookmark = get().bookmarks.find((b) => b.id === id)
    if (!bookmark) return
    const mapStore = useMapStore.getState()
    if (bookmark.provider !== mapStore.provider) mapStore.setProvider(bookmark.provider)
    mapStore.requestJumpTo(bookmark.center, bookmark.zoom)
  },
}))
