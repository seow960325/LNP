-- The Kudos Wall is a shared center-wide feed by design (fetchKudosFeed pulls
-- every kudos row for the center, no from/to filter) — but the previous
-- kudos_select policy limited non-admins to rows where they were sender or
-- recipient, which silently emptied the Wall for teachers and staff: they'd
-- load the page and only ever see their own kudos activity, never anyone
-- else's. This replaces that policy so any active, non-parent center member
-- can read the full center feed. Parent is deliberately excluded — internal
-- peer recognition is not parent-facing. Per-person kudos COUNTS remain
-- private (only the top-1 is ever shown publicly, via kudos_top_recipient());
-- this policy governs individual kudos messages, not counts.

drop policy if exists kudos_select on public.kudos;

create policy kudos_select on public.kudos
for select
using (
  is_super_admin()
  or from_user_id = auth.uid()
  or to_user_id = auth.uid()
  or (
    current_user_is_active()
    and center_id = current_user_center_id()
    and (
      select p.role from public.profiles p where p.id = auth.uid()
    ) in ('admin','teacher','staff','shareholder')
  )
);
