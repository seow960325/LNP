import { supabase } from './supabaseClient'
import type { JobTitle } from '../types'

const JOB_TITLE_COLUMNS = 'id, center_id, name, sort_order, active, created_at'

export function fetchJobTitles(centerId: string) {
  return supabase
    .from('job_titles')
    .select(JOB_TITLE_COLUMNS)
    .eq('center_id', centerId)
    .order('sort_order', { ascending: true })
    .returns<JobTitle[]>()
}
