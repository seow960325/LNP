import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from './Avatar'
import { AvatarCropModal } from './AvatarCropModal'
import { validateAvatarFile } from '../lib/profileApi'
import { createStudent, updateStudent, uploadStudentPhoto } from '../lib/billingApi'
import type { StudentWithPackage, FeePackage } from '../lib/billingApi'
import type { ClassRow } from '../lib/attendanceApi'
import { getUserErrorMessage } from '../lib/errorMessages'

const PRESET_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']

function splitEmail(email: string): { user: string; domain: string; isPreset: boolean } {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return { user: '', domain: 'gmail.com', isPreset: true }
  const user = email.slice(0, atIndex)
  const domain = email.slice(atIndex + 1)
  return { user, domain, isPreset: PRESET_EMAIL_DOMAINS.includes(domain) }
}

// Shared add/edit form — used standalone (create mode, "+ Add student") and
// per-row (edit mode). Render with a `key` that changes whenever the target
// switches (e.g. key={editingStudent?.id ?? 'new'}) so this component remounts
// and its lazy useState initializers re-run instead of carrying over stale
// field values from a previous student.
export function StudentForm({
  centerId,
  packages,
  classes,
  editingStudent,
  editingPhotoUrl,
  defaultClassId,
  onSaved,
  onCancel,
  onPhotoUpdated,
}: {
  centerId: string
  packages: FeePackage[]
  classes: ClassRow[]
  editingStudent: StudentWithPackage | null
  editingPhotoUrl: string | null
  defaultClassId?: string | null
  onSaved: () => void
  onCancel: () => void
  onPhotoUpdated: (studentId: string, photoUrl: string) => void
}) {
  const initialEmail = splitEmail(editingStudent?.parent_email ?? '')

  const [formName, setFormName] = useState(editingStudent?.name ?? '')
  const [formParentName, setFormParentName] = useState(editingStudent?.parent_name ?? '')
  const [formParentPhone, setFormParentPhone] = useState(editingStudent?.parent_phone ?? '')
  const [emailUser, setEmailUser] = useState(initialEmail.user)
  const [emailDomain, setEmailDomain] = useState(initialEmail.isPreset ? initialEmail.domain : 'custom')
  const [emailCustomDomain, setEmailCustomDomain] = useState(initialEmail.isPreset ? '' : initialEmail.domain)
  const [formPackageId, setFormPackageId] = useState(editingStudent?.package_id ?? '')
  const [formClassId, setFormClassId] = useState(editingStudent?.class_id ?? defaultClassId ?? '')
  const [formEnrolledAt, setFormEnrolledAt] = useState(editingStudent?.enrolled_at ?? '')
  const [formDob, setFormDob] = useState(editingStudent?.dob ?? '')
  const [formAddress, setFormAddress] = useState(editingStudent?.address ?? '')
  const [formNotes, setFormNotes] = useState(editingStudent?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)

  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const formParentEmail = (() => {
    const domain = emailDomain === 'custom' ? emailCustomDomain.trim() : emailDomain
    return emailUser.trim() && domain ? `${emailUser.trim()}@${domain}` : ''
  })()

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formName.trim()) {
      toast.error('Student name is required')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        name: formName.trim(),
        parent_name: formParentName.trim() || undefined,
        parent_phone: formParentPhone.trim() || undefined,
        parent_email: formParentEmail.trim() || undefined,
        package_id: formPackageId || undefined,
        class_id: formClassId || null,
        enrolled_at: formEnrolledAt || undefined,
        dob: formDob || undefined,
        address: formAddress.trim() || undefined,
        notes: formNotes.trim() || undefined,
      }

      if (editingStudent) {
        const { error } = await updateStudent(editingStudent.id, payload)
        if (error) {
          toast.error('Failed to update student')
          return
        }
        toast.success('Student updated')
      } else {
        const { error } = await createStudent(centerId, payload)
        if (error) {
          toast.error('Failed to add student')
          return
        }
        toast.success('Student added')
      }

      onSaved()
    } catch (err) {
      toast.error(getUserErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  function handlePhotoFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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

  async function handlePhotoCropConfirm(blob: Blob) {
    setCropFile(null)
    if (!editingStudent) return

    setUploadingPhoto(true)

    const croppedFile = new File([blob], 'photo.jpg', { type: blob.type })
    const { signedUrl, error } = await uploadStudentPhoto(editingStudent.id, croppedFile)
    if (error || !signedUrl) {
      setUploadingPhoto(false)
      toast.error('Could not upload the photo. Please try again.')
      return
    }

    const { error: saveError } = await updateStudent(editingStudent.id, { photo_url: signedUrl })
    setUploadingPhoto(false)
    if (saveError) {
      toast.error('Photo uploaded but could not be saved. Please try again.')
      return
    }

    onPhotoUpdated(editingStudent.id, signedUrl)
    toast.success('Photo updated')
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3 rounded-xl bg-white p-5 shadow-card">
        <p className="font-semibold text-sm text-ink">{editingStudent ? 'Edit student' : 'Add new student'}</p>

        {editingStudent ? (
          <div className="flex flex-col items-center gap-2 pb-1">
            <div className="relative inline-block">
              <Avatar fullName={formName || 'Student'} avatarUrl={editingPhotoUrl} size="xl" />
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploadingPhoto}
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
              >
                <Camera className="h-4 w-4" aria-hidden="true" />
              </button>
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoFileChange} />
            </div>
            <p className="text-xs text-muted">{uploadingPhoto ? 'Uploading…' : 'Tap the camera to change photo'}</p>
          </div>
        ) : (
          <p className="text-xs text-muted">You can add a photo after saving this student.</p>
        )}

        <div>
          <label className="text-xs text-muted">Student name *</label>
          <input
            type="text"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            disabled={submitting}
            required
            placeholder="e.g. Tan Chi Ming"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Parent/Guardian name</label>
          <input
            type="text"
            value={formParentName}
            onChange={(e) => setFormParentName(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Tan Kok Keong"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Parent phone</label>
          <input
            type="tel"
            value={formParentPhone}
            onChange={(e) => setFormParentPhone(e.target.value)}
            disabled={submitting}
            placeholder="e.g. 012-3456789"
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Parent email</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={emailUser}
              onChange={(e) => setEmailUser(e.target.value)}
              disabled={submitting}
              placeholder="e.g. siti"
              className="min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
            />
            <span className="text-sm text-muted">@</span>
            <select
              value={emailDomain}
              onChange={(e) => setEmailDomain(e.target.value)}
              disabled={submitting}
              className="min-h-tap rounded-xl border border-line px-3 text-sm disabled:opacity-60"
            >
              {PRESET_EMAIL_DOMAINS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </div>
          {emailDomain === 'custom' && (
            <input
              type="text"
              value={emailCustomDomain}
              onChange={(e) => setEmailCustomDomain(e.target.value)}
              disabled={submitting}
              placeholder="e.g. example.com"
              className="mt-2 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
            />
          )}
        </div>

        <div>
          <label className="text-xs text-muted">Fee package</label>
          <select
            value={formPackageId}
            onChange={(e) => setFormPackageId(e.target.value)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="">Select a package</option>
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} (RM {pkg.default_price.toFixed(2)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted">Class</label>
          <select
            value={formClassId}
            onChange={(e) => setFormClassId(e.target.value)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm disabled:opacity-60"
          >
            <option value="">No class</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-muted">Enrollment date</label>
          <input
            type="date"
            value={formEnrolledAt}
            onChange={(e) => setFormEnrolledAt(e.target.value)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Date of birth</label>
          <input
            type="date"
            value={formDob}
            onChange={(e) => setFormDob(e.target.value)}
            disabled={submitting}
            className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 py-2 text-sm text-left appearance-none disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Address</label>
          <textarea
            value={formAddress}
            onChange={(e) => setFormAddress(e.target.value)}
            disabled={submitting}
            placeholder="Street address, unit, city, postal code"
            className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div>
          <label className="text-xs text-muted">Notes</label>
          <textarea
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            disabled={submitting}
            placeholder="e.g. Dietary restrictions, allergies, etc."
            className="mt-1 min-h-20 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="min-h-tap flex-1 rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
          >
            {editingStudent ? 'Update' : 'Add'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-tap flex-1 rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>

      {cropFile && <AvatarCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handlePhotoCropConfirm} />}
    </>
  )
}
