export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'teacher'
  | 'staff'
  | 'parent'
  | 'shareholder'

export interface Profile {
  id: string
  center_id: string
  full_name: string
  role: UserRole
  title: string | null
  avatar_url: string | null
  phone: string | null
  email: string | null
  active: boolean
  is_paid_employee: boolean
  in_duty_roster: boolean
  is_app_owner: boolean
  must_change_password: boolean
  created_at: string
}

export interface KudosValue {
  id: string
  center_id: string
  name: string
  description: string
  icon_key: string
  parent_label: string | null
  sort_order: number
  active: boolean
}

export interface Kudos {
  id: string
  center_id: string
  from_user_id: string
  to_user_id: string
  value_id: string
  message: string | null
  is_from_parent: boolean
  created_at: string
}

export type BoardItemType = 'task' | 'heads_up' | 'reminder'
export type BoardPriority = 'low' | 'normal' | 'high'
export type BoardStatus = 'open' | 'done'

export interface BoardItem {
  id: string
  center_id: string
  date: string
  author_id: string
  type: BoardItemType
  title: string
  body: string | null
  priority: BoardPriority
  status: BoardStatus
  assigned_to: string | null
  created_at: string
  updated_at: string
}
