'use client'

// Shared state for the new clip flow: record → annotate → save.
//
// The recorded video Blob lives here, in a React context held by this
// layout, so it survives navigation between /record and /annotate
// without us having to stuff a 30 MB blob into the URL or IndexedDB.
//
// The layout component mounts once and stays mounted as long as the
// user is anywhere under /clips/new — Next.js App Router preserves
// layouts across child route changes. If the user navigates away
// (back to the student profile, or anywhere else), the layout
// unmounts and the blob is dropped, which is exactly what we want.
//
// If the user lands on /annotate directly (refresh, bookmark) the
// context is empty and the annotate page guards by redirecting to
// /record.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getHandoff, putHandoff, clearHandoff, type HandoffClip } from '@/lib/clipHandoff'

type RecordedClip = HandoffClip

interface ClipFlowState {
  recorded: RecordedClip | null
  /**
   * True once we've attempted to rehydrate from IndexedDB. Consumers (annotate)
   * must wait for this before deciding "no recording → bounce", otherwise they
   * bounce during the async rehydrate.
   */
  hydrated: boolean
  /** Persist the recording (IndexedDB + memory) before navigating to annotate. */
  commitRecorded: (clip: RecordedClip) => Promise<void>
  /**
   * One-shot object URL for the recorded blob, suitable for <video src>.
   * Created lazily on first access and revoked when reset() runs (or the
   * layout unmounts), so consumers don't have to manage URL.createObjectURL
   * themselves.
   */
  getVideoUrl: () => string | null
  reset: () => void
}

const ClipFlowContext = createContext<ClipFlowState | null>(null)

export default function ClipFlowLayout({ children }: { children: ReactNode }) {
  const [recorded, setRecordedState] = useState<RecordedClip | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const urlRef = useRef<string | null>(null)

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  // Rehydrate from IndexedDB on mount. On iPadOS the layout re-mounts across the
  // record → annotate navigation and drops the in-memory blob; reading it back
  // from IndexedDB is what makes the handoff survive.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const stored = await getHandoff()
        if (!cancelled && stored) setRecordedState(stored)
      } catch {
        /* ignore — hydrated still flips so the guard can decide */
      }
      if (!cancelled) setHydrated(true)
    })()
    return () => { cancelled = true }
  }, [])

  const commitRecorded = useCallback(
    async (clip: RecordedClip) => {
      revokeUrl()
      setRecordedState(clip)
      try {
        await putHandoff(clip)
      } catch {
        /* in-memory state still set; soft-nav path works without IDB */
      }
    },
    [revokeUrl],
  )

  const getVideoUrl = useCallback(() => {
    if (!recorded) return null
    if (!urlRef.current) urlRef.current = URL.createObjectURL(recorded.blob)
    return urlRef.current
  }, [recorded])

  const reset = useCallback(() => {
    revokeUrl()
    setRecordedState(null)
    void clearHandoff()
  }, [revokeUrl])

  // Clean up the dangling blob URL if the user closes the tab or navigates
  // outside /clips/new entirely. revokeUrl already runs on reset(); this
  // catches the bail-out paths.
  useEffect(() => {
    return () => {
      revokeUrl()
    }
  }, [revokeUrl])

  const value = useMemo<ClipFlowState>(
    () => ({ recorded, hydrated, commitRecorded, getVideoUrl, reset }),
    [recorded, hydrated, commitRecorded, getVideoUrl, reset],
  )

  return <ClipFlowContext.Provider value={value}>{children}</ClipFlowContext.Provider>
}

export function useClipFlow(): ClipFlowState {
  const ctx = useContext(ClipFlowContext)
  if (!ctx) throw new Error('useClipFlow must be used inside the /clips/new layout')
  return ctx
}
