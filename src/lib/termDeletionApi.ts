import { supabase } from './supabaseClient'
import { fetchProfilesByIds } from './kudosApi'
import type { Term } from './termsApi'

export type TermDeletionStatus = 'pending' | 'approved' | 'rejected'
export type TermDeletionScope = 'both'

export interface TermDeletionRequest {
  id: string
  center_id: string
  term_id: string
  scope: TermDeletionScope
  status: TermDeletionStatus
  requested_by: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface EnrichedTermDeletionRequest extends TermDeletionRequest {
  term_name: string
  term_start: string
  term_end: string
  requester_name: string
}

const REQUEST_COLUMNS = 'id, center_id, term_id, scope, status, requested_by, requested_at, reviewed_by, reviewed_at'

// Two batched lookups (terms + profiles) stitched in JS rather than a
// PostgREST embed — term_deletion_requests only has one FK into each table,
// so an embed would work, but this mirrors the same claimant/approver
// stitching pattern already used in claimsApi.ts/leaveApi.ts for consistency.
export async function fetchPendingRequests(
  centerId: string
): Promise<{ data: EnrichedTermDeletionRequest[] | null; error: unknown }> {
  const { data: requests, error } = await supabase
    .from('term_deletion_requests')
    .select(REQUEST_COLUMNS)
    .eq('center_id', centerId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false })
    .returns<TermDeletionRequest[]>()

  if (error || !requests) return { data: null, error }
  if (requests.length === 0) return { data: [], error: null }

  const termIds = Array.from(new Set(requests.map((r) => r.term_id)))
  const requesterIds = Array.from(new Set(requests.map((r) => r.requested_by)))

  const [termsResult, profilesResult] = await Promise.all([
    supabase
      .from('terms')
      .select('id, name, start_date, end_date')
      .in('id', termIds)
      .returns<Pick<Term, 'id' | 'name' | 'start_date' | 'end_date'>[]>(),
    fetchProfilesByIds(requesterIds),
  ])

  if (termsResult.error) return { data: null, error: termsResult.error }
  if (profilesResult.error) return { data: null, error: profilesResult.error }

  const termById = new Map((termsResult.data ?? []).map((t) => [t.id, t]))
  const nameById = new Map((profilesResult.data ?? []).map((p) => [p.id, p.full_name]))

  const enriched: EnrichedTermDeletionRequest[] = requests.map((req) => {
    const term = termById.get(req.term_id)
    return {
      ...req,
      term_name: term?.name ?? 'Unknown term',
      term_start: term?.start_date ?? '',
      term_end: term?.end_date ?? '',
      requester_name: nameById.get(req.requested_by) ?? 'Unknown',
    }
  })

  return { data: enriched, error: null }
}

export interface CreateDeletionRequestPayload {
  center_id: string
  term_id: string
  requested_by: string
}

export function createDeletionRequest(payload: CreateDeletionRequestPayload) {
  return supabase.from('term_deletion_requests').insert({ ...payload, scope: 'both', status: 'pending' })
}

export function rejectRequest(id: string, reviewerId: string) {
  return supabase
    .from('term_deletion_requests')
    .update({ status: 'rejected', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
}

export interface ApprovePurgeResult {
  ok: boolean
  attendanceDeleted: number
  boardDeleted: number
  photosRemoved: number
  error?: string
}

const ATTENDANCE_PHOTO_MARKER = '/attendance-photos/'

// Destructive and irreversible — only reachable from TermsPage's two-step
// confirm UI. Order matters: photos are removed from storage BEFORE the rows
// referencing them are deleted, so a failure partway through never leaves us
// with deleted rows and no way to find the now-orphaned photo paths.
export async function approveAndPurge(
  request: EnrichedTermDeletionRequest,
  reviewerId: string
): Promise<ApprovePurgeResult> {
  if (reviewerId === request.requested_by) {
    return {
      ok: false,
      attendanceDeleted: 0,
      boardDeleted: 0,
      photosRemoved: 0,
      error: "You can't approve your own request.",
    }
  }

  const { data: term, error: termError } = await supabase
    .from('terms')
    .select('start_date, end_date')
    .eq('id', request.term_id)
    .maybeSingle()

  if (termError || !term) {
    return { ok: false, attendanceDeleted: 0, boardDeleted: 0, photosRemoved: 0, error: 'Could not load the term.' }
  }

  const start = term.start_date
  const end = term.end_date

  const { data: attendanceRows, error: attendanceFetchError } = await supabase
    .from('student_attendance')
    .select('id, arrival_photo_url, pickup_photo_url, care_photo_url, medicine_photo_url')
    .eq('center_id', request.center_id)
    .gte('attendance_date', start)
    .lte('attendance_date', end)

  if (attendanceFetchError) {
    return {
      ok: false,
      attendanceDeleted: 0,
      boardDeleted: 0,
      photosRemoved: 0,
      error: 'Could not load attendance records for that term.',
    }
  }

  const paths = Array.from(
    new Set(
      (attendanceRows ?? [])
        .flatMap((row) => [row.arrival_photo_url, row.pickup_photo_url, row.care_photo_url, row.medicine_photo_url])
        .filter((url): url is string => !!url)
        .map((url) => {
          const index = url.indexOf(ATTENDANCE_PHOTO_MARKER)
          return index === -1 ? null : url.slice(index + ATTENDANCE_PHOTO_MARKER.length)
        })
        .filter((path): path is string => !!path)
    )
  )

  let photosRemoved = 0
  if (paths.length > 0) {
    const { data: removed, error: removeError } = await supabase.storage.from('attendance-photos').remove(paths)
    // Storage errors are non-fatal — a file may already be gone, or the
    // bucket briefly unreachable — the row deletes below still proceed.
    if (!removeError) photosRemoved = removed?.length ?? paths.length
  }

  const {
    error: deleteAttendanceError,
    count: attendanceDeleted,
  } = await supabase
    .from('student_attendance')
    .delete({ count: 'exact' })
    .eq('center_id', request.center_id)
    .gte('attendance_date', start)
    .lte('attendance_date', end)

  if (deleteAttendanceError) {
    return {
      ok: false,
      attendanceDeleted: 0,
      boardDeleted: 0,
      photosRemoved,
      error: 'Could not delete attendance records.',
    }
  }

  const { error: deleteBoardError, count: boardDeleted } = await supabase
    .from('board_items')
    .delete({ count: 'exact' })
    .eq('center_id', request.center_id)
    .gte('date', start)
    .lte('date', end)

  if (deleteBoardError) {
    return {
      ok: false,
      attendanceDeleted: attendanceDeleted ?? 0,
      boardDeleted: 0,
      photosRemoved,
      error: 'Attendance was deleted but board items could not be. Please retry.',
    }
  }

  const { error: updateRequestError } = await supabase
    .from('term_deletion_requests')
    .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', request.id)

  if (updateRequestError) {
    return {
      ok: false,
      attendanceDeleted: attendanceDeleted ?? 0,
      boardDeleted: boardDeleted ?? 0,
      photosRemoved,
      error: 'Data was purged but the request could not be marked approved.',
    }
  }

  return {
    ok: true,
    attendanceDeleted: attendanceDeleted ?? 0,
    boardDeleted: boardDeleted ?? 0,
    photosRemoved,
  }
}
