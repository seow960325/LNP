alter table public.students add column if not exists zoho_contact_id text;
create unique index if not exists students_zoho_contact_id_key
  on public.students (zoho_contact_id) where zoho_contact_id is not null;
