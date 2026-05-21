'use client'

// Robust handoff of the recorded clip between /record and /annotate.
//
// The clips/new layout used to hold the recorded Blob in a React context and
// assumed the layout instance survives navigation between its children. On
// iPadOS that assumption breaks: the layout re-mounts across the
// record → annotate navigation, the in-memory blob is lost, and annotate
// bounces straight back to /record.
//
// IndexedDB survives a component re-mount AND a full hard navigation, and it
// can store a Blob directly. We keep a single "pending" entry; the layout
// rehydrates from it on mount, and it's cleared on save/discard.

import type { CameraAngle } from '@/lib/types'

const DB_NAME = 'parell'
const STORE = 'clip-handoff'
const KEY = 'pending'

export interface HandoffClip {
  blob: Blob
  mime: string
  durationMs: number
  angle: CameraAngle
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putHandoff(clip: HandoffClip): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(clip, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function getHandoff(): Promise<HandoffClip | null> {
  const db = await openDb()
  try {
    return await new Promise<HandoffClip | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const r = tx.objectStore(STORE).get(KEY)
      r.onsuccess = () => resolve((r.result as HandoffClip) ?? null)
      r.onerror = () => reject(r.error)
    })
  } finally {
    db.close()
  }
}

export async function clearHandoff(): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    })
  } finally {
    db.close()
  }
}
