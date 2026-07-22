-- Phase 1B schema: roster_shifts, attendance, requests
-- Enums + tables + FKs + indexes + RLS enabled (deny-all until Phase 1B policy spec)

-- ============ ENUMS ============
create type attendance_source as enum ('app', 'manual');
create type request_type as enum ('annual_leave', 'medical_leave', 'ot', 'claim');
create type request_status as enum ('pending', 'approved', 'rejected');

-- ============ roster_shifts ============
create table roster_shifts (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  shift_start time not null,
  shift_end time not null,
  note text,
  created_at timestamptz not null default now()
);

-- ============ attendance ============
create table attendance (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  source attendance_source not null default 'app',
  note text
);

-- ============ requests ============
create table requests (
  id uuid primary key default gen_random_uuid(),
  center_id uuid not null references centers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  type request_type not null,
  start_date date not null,
  end_date date,
  hours numeric,
  amount numeric,
  reason text,
  attachment_url text,
  status request_status not null default 'pending',
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ INDEXES ============
create index idx_roster_shifts_center on roster_shifts(center_id);
create index idx_roster_shifts_user_date on roster_shifts(user_id, date);
create index idx_attendance_center on attendance(center_id);
create index idx_attendance_user_date on attendance(user_id, date);
create index idx_requests_center on requests(center_id);
create index idx_requests_user on requests(user_id);
create index idx_requests_status on requests(status);

-- ============ RLS (enabled, deny-all until Phase 1B policy spec) ============
alter table roster_shifts enable row level security;
alter table attendance enable row level security;
alter table requests enable row level security;
