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

interface RecordedClip {
  blob: Blob
  mime: string
  durationMs: number
}

interface ClipFlowState {
  recorded: RecordedClip | null
  setRecorded: (clip: RecordedClip | null) => void
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
  const urlRef = useRef<string | null>(null)

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
  }, [])

  const setRecorded = useCallback(
    (clip: RecordedClip | null) => {
      revokeUrl()
      setRecordedState(clip)
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
  }, [revokeUrl])

  // Clean up the dangling blob URL if the user closes the tab or navigates
  // outside /clips/new entirely. revokeUrl already runs on reset() and
  // setRecorded(null); this catches the bail-out paths.
  useEffect(() => {
    return () => {
      revokeUrl()
    }
  }, [revokeUrl])

  const value = useMemo<ClipFlowState>(
    () => ({ recorded, setRecorded, getVideoUrl, reset }),
    [recorded, setRecorded, getVideoUrl, reset],
  )

  return <ClipFlowContext.Provider value={value}>{children}</ClipFlowContext.Provider>
}

export function useClipFlow(): ClipFlowState {
  const ctx = useContext(ClipFlowContext)
  if (!ctx) throw new Error('useClipFlow must be used inside the /clips/new layout')
  return ctx
}
