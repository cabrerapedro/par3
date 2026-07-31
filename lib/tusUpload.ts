'use client'

// Resumable upload to Supabase Storage via the TUS protocol.
//
// Why not supabase.storage.upload(): that is ONE plain fetch POST — no
// progress, no chunking, no resume. On a range hotspot a 10-30 MB clip video
// stalls forever if the connection hiccups mid-body. TUS uploads in 6 MB
// chunks (the size Supabase requires), reports progress, retries with
// backoff, and — because the upload URL is fingerprinted per clip — resumes
// from the last confirmed chunk even after an app relaunch.

import * as tus from 'tus-js-client'
import { supabase } from './supabase'

// Supabase Storage requires exactly 6 MB chunks for resumable uploads.
const CHUNK_SIZE = 6 * 1024 * 1024

export interface ResumableUploadOptions {
  bucket: string
  path: string
  blob: Blob
  contentType: string
  /** Stable key (e.g. the clip id) so a relaunched app resumes the same upload. */
  fingerprintKey: string
  /** Progress 0..1. */
  onProgress?: (fraction: number) => void
}

export async function uploadResumable(opts: ResumableUploadOptions): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('No authenticated session for resumable upload')

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!projectUrl || !anonKey) throw new Error('Supabase env vars missing')

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(opts.blob, {
      endpoint: `${projectUrl}/storage/v1/upload/resumable`,
      // ~1 minute of in-protocol retries before we surface the error to the
      // queue (which has its own retry button / auto-resume on relaunch).
      retryDelays: [0, 2000, 5000, 10000, 20000, 30000],
      headers: {
        authorization: `Bearer ${token}`,
        apikey: anonKey,
        // Upsert: a previous attempt may have finished server-side without the
        // client hearing the confirmation; retrying must not 409.
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      fingerprint: async () => `forat/${opts.fingerprintKey}`,
      metadata: {
        bucketName: opts.bucket,
        objectName: opts.path,
        contentType: opts.contentType,
        cacheControl: '3600',
      },
      onProgress: (sent, total) => opts.onProgress?.(total > 0 ? sent / total : 0),
      onError: (err) => reject(err),
      onSuccess: () => resolve(),
    })

    // Resume a previous attempt of this same clip when one exists.
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0])
        upload.start()
      })
      .catch(() => upload.start())
  })
}
