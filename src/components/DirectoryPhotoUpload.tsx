import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from './Avatar'
import { AvatarCropModal } from './AvatarCropModal'
import { validateAvatarFile } from '../lib/profileApi'
import { uploadDirectoryPhoto, type DirectoryPhotoScope } from '../lib/directoryPhotoApi'

// Admin-only photo control for staff/shareholder profile cards — same
// crop-then-upload flow as ProfilePage's own-avatar control, pointed at the
// staff-photos bucket instead. AvatarCropModal's fixed-size square export
// IS the stored image (no lightbox, no separate thumbnail asset — see
// directoryPhotoApi.ts).
export function DirectoryPhotoUpload({
  scope,
  id,
  fullName,
  photoUrl,
  onUploaded,
}: {
  scope: DirectoryPhotoScope
  id: string
  fullName: string
  photoUrl: string | null
  onUploaded: (photoPath: string) => void | Promise<void>
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const validationError = validateAvatarFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setCropFile(file)
  }

  async function handleCropConfirm(blob: Blob) {
    if (uploading) return
    setCropFile(null)
    setUploading(true)
    const { path, error } = await uploadDirectoryPhoto(scope, id, blob)
    if (error || !path) {
      setUploading(false)
      toast.error('Could not upload the photo. Please try again.')
      return
    }
    // uploading stays true through onUploaded (the caller's save into
    // staff_members/shareholdings) — clearing it right after the storage
    // upload would re-enable the camera button while that save is still in
    // flight, letting a fast second crop-confirm call onUploaded again
    // concurrently.
    await onUploaded(path)
    setUploading(false)
    toast.success('Photo updated')
  }

  return (
    <div className="relative inline-block">
      <Avatar fullName={fullName} avatarUrl={photoUrl} size="xl" />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        aria-label="Change photo"
        className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        <Camera className="h-4 w-4" aria-hidden="true" />
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      {cropFile && <AvatarCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />}
    </div>
  )
}
