import { supabase } from './supabaseClient'

// Private bucket for staff_members.photo_path / shareholdings.photo_path —
// shared by both scopes (staff/<id>/photo, shareholder/<id>/photo).
// NOTE: this bucket must exist in the Supabase project before uploads will
// work — it is not provisioned by any migration in this repo (buckets here
// are created out-of-band, same as `student-photos`/`avatars`).
const BUCKET = 'directory-photos'

export type DirectoryPhotoScope = 'staff' | 'shareholder'

// Fixed path per row (no extension — contentType carries the real MIME
// type) so re-uploading always overwrites the same object via upsert.
// Mirrors uploadStudentPhoto in billingApi.ts. The blob passed in is
// expected to already be resized/cropped (AvatarCropModal's fixed
// OUTPUT_SIZE square) — this is the only image ever stored, so it doubles
// as the pre-generated thumbnail; nothing is resized on read.
export async function uploadDirectoryPhoto(scope: DirectoryPhotoScope, id: string, blob: Blob) {
  const path = `${scope}/${id}/photo`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
  if (error) return { path: null, error }
  return { path, error: null }
}

export async function getDirectoryPhotoSignedUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(photoPath, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}
