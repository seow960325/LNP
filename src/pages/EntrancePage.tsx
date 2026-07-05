import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../contexts/AuthContext'
import { LoadingState, ErrorState, EmptyState } from '../components/AsyncState'
import { PageHeader } from '../components/PageHeader'
import { Avatar } from '../components/Avatar'
import { firstName, toKLDateISO, formatTimeKL } from '../lib/helpers'
import {
  fetchActiveClasses,
  fetchActiveConditions,
  fetchStudentsByClass,
  fetchTodayAttendance,
  uploadAttendancePhoto,
  upsertArrival,
  upsertDeparture,
} from '../lib/attendanceApi'
import type { ClassRow, AttendanceCondition, AttendanceStudent, StudentAttendance } from '../lib/attendanceApi'

type LoadState = 'loading' | 'ready' | 'error'
type AttendanceStatus = 'not_arrived' | 'arrived' | 'departed'

const FEVER_THRESHOLD = 37.5

function getStatus(row: StudentAttendance | undefined): AttendanceStatus {
  if (!row || !row.arrived_at) return 'not_arrived'
  if (!row.departed_at) return 'arrived'
  return 'departed'
}

// Ring color is the at-a-glance status signal on the check-in grid: gray =
// hasn't arrived, green = here, faded blue = already picked up.
const RING_CLASSES: Record<AttendanceStatus, string> = {
  not_arrived: 'ring-2 ring-line',
  arrived: 'ring-[3px] ring-success',
  departed: 'ring-[3px] ring-blue-300',
}

function gridInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

export function EntrancePage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'super_admin'
  const today = useMemo(() => toKLDateISO(new Date()), [])

  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [conditions, setConditions] = useState<AttendanceCondition[]>([])
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [attendanceByStudent, setAttendanceByStudent] = useState<Map<string, StudentAttendance>>(new Map())

  const [studentsLoadState, setStudentsLoadState] = useState<LoadState>('loading')
  const [students, setStudents] = useState<AttendanceStudent[]>([])

  const [activeStudent, setActiveStudent] = useState<AttendanceStudent | null>(null)

  useEffect(() => {
    if (!profile) return
    setLoadState('loading')

    Promise.all([fetchActiveClasses(), fetchActiveConditions(), fetchTodayAttendance(profile.center_id, today)]).then(
      ([classesRes, conditionsRes, attendanceRes]) => {
        if (classesRes.error || !classesRes.data || conditionsRes.error || !conditionsRes.data) {
          setLoadError('Could not load Entrance. Please try again.')
          setLoadState('error')
          return
        }
        if (attendanceRes.error || !attendanceRes.data) {
          setLoadError('Could not load today’s attendance. Please try again.')
          setLoadState('error')
          return
        }

        setClasses(classesRes.data)
        setConditions(conditionsRes.data)
        setAttendanceByStudent(attendanceRes.data)
        setSelectedClassId((current) => current ?? classesRes.data[0]?.id ?? null)
        setLoadState('ready')
      }
    )
  }, [profile, today])

  useEffect(() => {
    if (!profile || !selectedClassId) {
      setStudents([])
      return
    }
    setStudentsLoadState('loading')
    fetchStudentsByClass(profile.center_id, selectedClassId).then(({ data, error }) => {
      if (error || !data) {
        setStudentsLoadState('error')
        return
      }
      setStudents(data)
      setStudentsLoadState('ready')
    })
  }, [profile, selectedClassId])

  function handleSaved(row: StudentAttendance) {
    setAttendanceByStudent((current) => {
      const next = new Map(current)
      next.set(row.student_id, row)
      return next
    })
    setActiveStudent(null)
  }

  if (!profile) return null

  return (
    <div className="min-h-screen bg-cream p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <PageHeader title="Entrance" fallback="/">
          {isAdmin && (
            <>
              <Link to="/classes" className="text-xs text-accent hover:underline">
                Classes
              </Link>
              <Link to="/attendance/conditions" className="text-xs text-accent hover:underline">
                Conditions
              </Link>
            </>
          )}
        </PageHeader>

        {loadState === 'loading' && <LoadingState label="Loading Entrance…" />}
        {loadState === 'error' && <ErrorState message={loadError ?? 'Something went wrong.'} />}

        {loadState === 'ready' && classes.length === 0 && (
          <EmptyState message="No classes set up yet. Ask an admin to add one." />
        )}

        {loadState === 'ready' && classes.length > 0 && (
          <>
            <div className="sticky top-[105px] z-10 -mx-6 flex gap-2 overflow-x-auto bg-cream/95 px-6 py-2 backdrop-blur">
              {classes.map((cls) => (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => setSelectedClassId(cls.id)}
                  className={`min-h-tap whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
                    selectedClassId === cls.id
                      ? 'bg-accent text-white shadow-card'
                      : 'bg-white text-muted shadow-card hover:bg-accent-soft/40'
                  }`}
                >
                  {cls.name}
                </button>
              ))}
            </div>

            {studentsLoadState === 'loading' && <LoadingState label="Loading students…" />}
            {studentsLoadState === 'error' && <ErrorState message="Could not load students for this class." />}

            {studentsLoadState === 'ready' && students.length === 0 && (
              <EmptyState message="No students in this class yet." />
            )}

            {studentsLoadState === 'ready' && students.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3">
                {students.map((student) => {
                  const status = getStatus(attendanceByStudent.get(student.id))
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => setActiveStudent(student)}
                      className="flex flex-col items-center gap-1 rounded-xl p-1 hover:bg-white/60"
                    >
                      <span className={`block w-full rounded-full ${RING_CLASSES[status]}`}>
                        {student.photo_url ? (
                          <img
                            src={student.photo_url}
                            alt={student.name}
                            className="w-full aspect-square rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex w-full aspect-square items-center justify-center rounded-full bg-accent-soft font-bold text-accent-hover text-xl">
                            {gridInitials(student.name)}
                          </div>
                        )}
                      </span>
                      <span className="max-w-full truncate text-xs text-ink">{firstName(student.name)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {activeStudent && (
        <CheckInModal
          student={activeStudent}
          attendanceRow={attendanceByStudent.get(activeStudent.id)}
          conditions={conditions}
          centerId={profile.center_id}
          userId={profile.id}
          date={today}
          onClose={() => setActiveStudent(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

interface CheckInModalProps {
  student: AttendanceStudent
  attendanceRow: StudentAttendance | undefined
  conditions: AttendanceCondition[]
  centerId: string
  userId: string
  date: string
  onClose: () => void
  onSaved: (row: StudentAttendance) => void
}

function CheckInModal({ student, attendanceRow, conditions, centerId, userId, date, onClose, onSaved }: CheckInModalProps) {
  const status = getStatus(attendanceRow)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-modal-title"
        className="max-h-[85vh] w-full space-y-4 overflow-y-auto rounded-t-2xl bg-white p-6 shadow-card-lg animate-slide-up sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <Avatar fullName={student.name} avatarUrl={student.photo_url} size="lg" />
          <div>
            <h2 id="checkin-modal-title" className="font-bold text-lg text-ink">
              {student.name}
            </h2>
            <p className="text-xs text-muted">
              {status === 'not_arrived' && 'Not arrived yet'}
              {status === 'arrived' && 'Checked in'}
              {status === 'departed' && 'Checked out'}
            </p>
          </div>
        </div>

        {status === 'not_arrived' && (
          <ArrivalForm
            student={student}
            conditions={conditions}
            centerId={centerId}
            userId={userId}
            date={date}
            onSaved={onSaved}
          />
        )}
        {status === 'arrived' && (
          <DepartureForm student={student} conditions={conditions} userId={userId} date={date} onSaved={onSaved} />
        )}
        {status === 'departed' && attendanceRow && <DepartedSummary row={attendanceRow} conditions={conditions} />}

        <button
          type="button"
          onClick={onClose}
          className="min-h-tap w-full rounded-xl border border-line font-semibold text-sm text-muted hover:bg-cream"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function ConditionChips({
  conditions,
  selectedIds,
  onToggle,
  disabled,
}: {
  conditions: AttendanceCondition[]
  selectedIds: string[]
  onToggle: (id: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {conditions.map((condition) => {
        const selected = selectedIds.includes(condition.id)
        return (
          <button
            key={condition.id}
            type="button"
            onClick={() => onToggle(condition.id)}
            disabled={disabled}
            className={`min-h-tap rounded-full border px-3 text-sm font-semibold disabled:opacity-60 ${
              selected
                ? 'border-accent bg-accent-soft text-accent-hover'
                : 'border-line bg-white text-muted hover:bg-cream'
            }`}
          >
            {condition.name}
          </button>
        )
      })}
    </div>
  )
}

interface ArrivalFormProps {
  student: AttendanceStudent
  conditions: AttendanceCondition[]
  centerId: string
  userId: string
  date: string
  onSaved: (row: StudentAttendance) => void
}

function ArrivalForm({ student, conditions, centerId, userId, date, onSaved }: ArrivalFormProps) {
  const [temp, setTemp] = useState('')
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [careNote, setCareNote] = useState('')
  const [carePhotoFile, setCarePhotoFile] = useState<File | null>(null)
  const [hasMedicine, setHasMedicine] = useState(false)
  const [medUnit, setMedUnit] = useState<'pill' | 'ml'>('pill')
  const [medAmount, setMedAmount] = useState<number | null>(null)
  const [medInstruction, setMedInstruction] = useState('')
  const [medPhotoFile, setMedPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleCondition(id: string) {
    setSelectedConditionIds((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
  }

  const tempValue = Number(temp)
  const isTempValid = temp.trim() !== '' && !Number.isNaN(tempValue)
  const isFever = isTempValid && tempValue >= FEVER_THRESHOLD
  const canSave =
    isTempValid &&
    selectedConditionIds.length > 0 &&
    !!photoFile &&
    (!hasMedicine || (medAmount !== null && medPhotoFile !== null)) &&
    !submitting

  async function handleSave() {
    if (!canSave || !photoFile) return
    setSubmitting(true)
    try {
      const { publicUrl: arrivalPhotoUrl, error: photoError } = await uploadAttendancePhoto(
        student.id,
        'arrival',
        photoFile
      )
      if (photoError || !arrivalPhotoUrl) {
        toast.error('Could not upload the arrival photo. Please try again.')
        return
      }

      let carePhotoUrl: string | undefined
      if (carePhotoFile) {
        const { publicUrl, error } = await uploadAttendancePhoto(student.id, 'care', carePhotoFile)
        if (error || !publicUrl) {
          toast.error('Could not upload the care photo. Please try again.')
          return
        }
        carePhotoUrl = publicUrl
      }

      let medicinePhotoUrl: string | null = null
      if (hasMedicine && medPhotoFile) {
        const { publicUrl, error } = await uploadAttendancePhoto(student.id, 'medicine', medPhotoFile)
        if (error || !publicUrl) {
          toast.error('Could not upload the medicine photo. Please try again.')
          return
        }
        medicinePhotoUrl = publicUrl
      }

      const { data, error } = await upsertArrival(centerId, student.id, date, userId, {
        arrival_temp: tempValue,
        arrival_condition_ids: selectedConditionIds,
        arrival_photo_url: arrivalPhotoUrl,
        care_note: careNote.trim() || undefined,
        care_photo_url: carePhotoUrl,
        has_medicine: hasMedicine,
        medicine_photo_url: hasMedicine ? medicinePhotoUrl : null,
        medicine_dose_amount: hasMedicine ? medAmount : null,
        medicine_dose_unit: hasMedicine ? medUnit : null,
        medicine_instruction: hasMedicine ? medInstruction.trim() || null : null,
      })
      if (error || !data) {
        toast.error('Could not save arrival. Please try again.')
        return
      }
      toast.success(`${student.name} checked in`)
      onSaved(data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted">Body temperature (°C) *</label>
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          disabled={submitting}
          placeholder="e.g. 36.5"
          className={`mt-1 min-h-tap w-full rounded-xl border px-3 text-sm disabled:opacity-60 ${
            isFever ? 'border-danger bg-danger/5 text-danger' : 'border-line'
          }`}
        />
        {isFever && <p className="mt-1 text-2xs font-semibold text-danger">Fever — 37.5°C or above</p>}
      </div>

      <div>
        <label className="text-xs text-muted">Condition *</label>
        <div className="mt-1">
          <ConditionChips
            conditions={conditions}
            selectedIds={selectedConditionIds}
            onToggle={toggleCondition}
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-muted">Arrival photo *</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
          className="mt-1 block w-full text-sm text-muted disabled:opacity-60"
        />
        {photoFile && <p className="mt-1 text-2xs text-success">Photo selected: {photoFile.name}</p>}
      </div>

      <div>
        <label className="text-xs text-muted">Care note (optional)</label>
        <textarea
          value={careNote}
          onChange={(e) => setCareNote(e.target.value)}
          disabled={submitting}
          placeholder="e.g. Applied plaster to left knee"
          className="mt-1 min-h-16 w-full rounded-xl border border-line px-3 py-2 text-sm placeholder:text-muted/70 disabled:opacity-60"
        />
      </div>

      <div>
        <label className="text-xs text-muted">Care photo (optional)</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setCarePhotoFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
          className="mt-1 block w-full text-sm text-muted disabled:opacity-60"
        />
        {carePhotoFile && <p className="mt-1 text-2xs text-success">Photo selected: {carePhotoFile.name}</p>}
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-cream/50 p-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-muted">Medicine</label>
          <button
            type="button"
            onClick={() => setHasMedicine((current) => !current)}
            disabled={submitting}
            className={`min-h-tap rounded-full border px-4 text-sm font-semibold disabled:opacity-60 ${
              hasMedicine
                ? 'border-accent bg-accent-soft text-accent-hover'
                : 'border-line bg-white text-muted hover:bg-cream'
            }`}
          >
            {hasMedicine ? 'On' : 'Off'}
          </button>
        </div>

        {hasMedicine && (
          <>
            <div>
              <label className="text-xs text-muted">Unit</label>
              <div className="mt-1 flex gap-2">
                {(['pill', 'ml'] as const).map((unit) => (
                  <button
                    key={unit}
                    type="button"
                    onClick={() => {
                      setMedUnit(unit)
                      setMedAmount(null)
                    }}
                    disabled={submitting}
                    className={`min-h-tap flex-1 rounded-full border text-sm font-semibold disabled:opacity-60 ${
                      medUnit === unit
                        ? 'border-accent bg-accent-soft text-accent-hover'
                        : 'border-line bg-white text-muted hover:bg-cream'
                    }`}
                  >
                    {unit === 'pill' ? 'Pill' : 'ml'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted">Amount *</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {(medUnit === 'pill' ? [1, 2, 3, 4] : [2.5, 5, 10]).map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setMedAmount(amount)}
                    disabled={submitting}
                    className={`min-h-tap rounded-full border px-4 text-sm font-semibold disabled:opacity-60 ${
                      medAmount === amount
                        ? 'border-accent bg-accent-soft text-accent-hover'
                        : 'border-line bg-white text-muted hover:bg-cream'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted">Medicine photo *</label>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setMedPhotoFile(e.target.files?.[0] ?? null)}
                disabled={submitting}
                className="mt-1 block w-full text-sm text-muted disabled:opacity-60"
              />
              {medPhotoFile && <p className="mt-1 text-2xs text-success">Photo selected: {medPhotoFile.name}</p>}
            </div>

            <div>
              <label className="text-xs text-muted">Instruction (optional)</label>
              <input
                type="text"
                value={medInstruction}
                onChange={(e) => setMedInstruction(e.target.value)}
                disabled={submitting}
                placeholder="e.g. After lunch, once"
                className="mt-1 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
              />
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Check in'}
      </button>
    </div>
  )
}

interface DepartureFormProps {
  student: AttendanceStudent
  conditions: AttendanceCondition[]
  userId: string
  date: string
  onSaved: (row: StudentAttendance) => void
}

const PICKUP_RELATIONSHIPS = ['Parent', 'Cousin', 'Friend', 'Other'] as const
type PickupRelationship = (typeof PICKUP_RELATIONSHIPS)[number]

function DepartureForm({ student, conditions, userId, date, onSaved }: DepartureFormProps) {
  const [relationship, setRelationship] = useState<PickupRelationship>('Parent')
  const [otherName, setOtherName] = useState('')
  const [selectedConditionIds, setSelectedConditionIds] = useState<string[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleCondition(id: string) {
    setSelectedConditionIds((current) => (current.includes(id) ? current.filter((c) => c !== id) : [...current, id]))
  }

  const parentOnFile = relationship === 'Parent' && !!student.parent_name

  const pickupByName =
    relationship === 'Parent' && student.parent_name
      ? student.parent_name
      : otherName.trim()
        ? `${relationship}: ${otherName.trim()}`
        : ''

  const photoRequired = !(relationship === 'Parent' && student.parent_name)
  const canSave = pickupByName.length > 0 && (!photoRequired || photoFile !== null) && !submitting

  async function handleSave() {
    if (!canSave) return
    setSubmitting(true)
    try {
      let pickupPhotoUrl: string | undefined
      if (photoFile) {
        const { publicUrl, error } = await uploadAttendancePhoto(student.id, 'pickup', photoFile)
        if (error || !publicUrl) {
          toast.error('Could not upload the pickup photo. Please try again.')
          return
        }
        pickupPhotoUrl = publicUrl
      }

      const { data, error } = await upsertDeparture(student.id, date, userId, {
        pickup_by_name: pickupByName,
        pickup_photo_url: pickupPhotoUrl,
        departure_condition_ids: selectedConditionIds.length > 0 ? selectedConditionIds : undefined,
      })
      if (error || !data) {
        toast.error('Could not save departure. Please try again.')
        return
      }
      toast.success(`${student.name} checked out`)
      onSaved(data)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-muted">Picked up by *</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {PICKUP_RELATIONSHIPS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRelationship(option)}
              disabled={submitting}
              className={`min-h-tap rounded-full border px-3 text-sm font-semibold disabled:opacity-60 ${
                relationship === option
                  ? 'border-accent bg-accent-soft text-accent-hover'
                  : 'border-line bg-white text-muted hover:bg-cream'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {parentOnFile ? (
          <p className="mt-2 min-h-tap rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink">
            {student.parent_name}
          </p>
        ) : (
          <>
            {relationship === 'Parent' && (
              <p className="mt-2 text-2xs text-muted">No parent name on file — enter who's picking up below.</p>
            )}
            <input
              type="text"
              value={otherName}
              onChange={(e) => setOtherName(e.target.value)}
              disabled={submitting}
              placeholder="e.g. Tan Kok Keong"
              className="mt-2 min-h-tap w-full rounded-xl border border-line px-3 text-sm placeholder:text-muted/70 disabled:opacity-60"
            />
          </>
        )}
      </div>

      <div>
        <label className="text-xs text-muted">Pickup photo {photoRequired ? '*' : '(optional)'}</label>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
          disabled={submitting}
          className="mt-1 block w-full text-sm text-muted disabled:opacity-60"
        />
        {photoFile && <p className="mt-1 text-2xs text-success">Photo selected: {photoFile.name}</p>}
      </div>

      <div>
        <label className="text-xs text-muted">Condition on departure (optional)</label>
        <div className="mt-1">
          <ConditionChips
            conditions={conditions}
            selectedIds={selectedConditionIds}
            onToggle={toggleCondition}
            disabled={submitting}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={!canSave}
        className="min-h-tap w-full rounded-xl bg-accent font-semibold text-sm text-white shadow-card hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Check out'}
      </button>
    </div>
  )
}

function DepartedSummary({ row, conditions }: { row: StudentAttendance; conditions: AttendanceCondition[] }) {
  const isFever = row.arrival_temp !== null && row.arrival_temp >= FEVER_THRESHOLD

  function conditionNames(ids: string[] | null): string {
    if (!ids || ids.length === 0) return '—'
    return ids.map((id) => conditions.find((c) => c.id === id)?.name ?? 'Unknown').join(', ')
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between rounded-xl bg-cream px-3 py-2">
        <span className="text-muted">Arrived</span>
        <span className="font-semibold text-ink">{row.arrived_at ? formatTimeKL(row.arrived_at) : '—'}</span>
      </div>
      <div className="flex justify-between rounded-xl bg-cream px-3 py-2">
        <span className="text-muted">Temperature</span>
        <span className={`font-semibold ${isFever ? 'text-danger' : 'text-ink'}`}>
          {row.arrival_temp !== null ? `${row.arrival_temp}°C` : '—'}
          {isFever ? ' (fever)' : ''}
        </span>
      </div>
      <div className="rounded-xl bg-cream px-3 py-2">
        <p className="text-muted">Arrival condition</p>
        <p className="font-semibold text-ink">{conditionNames(row.arrival_condition_ids)}</p>
      </div>
      {row.arrival_photo_url && (
        <img src={row.arrival_photo_url} alt="Arrival" className="h-32 w-full rounded-xl object-cover" />
      )}
      {row.care_note && (
        <div className="rounded-xl bg-cream px-3 py-2">
          <p className="text-muted">Care note</p>
          <p className="font-semibold text-ink">{row.care_note}</p>
        </div>
      )}
      {row.care_photo_url && (
        <img src={row.care_photo_url} alt="Care" className="h-32 w-full rounded-xl object-cover" />
      )}
      {row.has_medicine && (
        <div className="rounded-xl bg-cream px-3 py-2">
          <p className="text-muted">Medicine given</p>
          <p className="font-semibold text-ink">
            {row.medicine_dose_amount !== null ? `${row.medicine_dose_amount} ${row.medicine_dose_unit ?? ''}`.trim() : '—'}
          </p>
          {row.medicine_instruction && <p className="mt-1 text-xs text-muted">{row.medicine_instruction}</p>}
        </div>
      )}
      {row.has_medicine && row.medicine_photo_url && (
        <img src={row.medicine_photo_url} alt="Medicine" className="h-32 w-full rounded-xl object-cover" />
      )}
      <div className="flex justify-between rounded-xl bg-cream px-3 py-2">
        <span className="text-muted">Departed</span>
        <span className="font-semibold text-ink">{row.departed_at ? formatTimeKL(row.departed_at) : '—'}</span>
      </div>
      <div className="rounded-xl bg-cream px-3 py-2">
        <p className="text-muted">Departure condition</p>
        <p className="font-semibold text-ink">{conditionNames(row.departure_condition_ids)}</p>
      </div>
      <div className="flex justify-between rounded-xl bg-cream px-3 py-2">
        <span className="text-muted">Picked up by</span>
        <span className="font-semibold text-ink">{row.pickup_by_name ?? '—'}</span>
      </div>
      {row.pickup_photo_url && (
        <img src={row.pickup_photo_url} alt="Pickup" className="h-32 w-full rounded-xl object-cover" />
      )}
    </div>
  )
}
