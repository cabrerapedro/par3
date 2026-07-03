import { supabase } from './supabase'

// Upload an image to a public bucket and return its public URL. Used for journey
// template / recommendation illustrations (journey-images bucket).
export async function uploadImage(bucket: string, file: File): Promise<string | null> {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (error) return null
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
