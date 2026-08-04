create or replace function public.v2_pull_changes(p_ledger_id uuid, p_after_seq bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  changes jsonb;
  next_cursor bigint;
begin
  if auth.uid() is null or not public.v2_is_ledger_member(p_ledger_id) then
    raise exception 'LEDGER_ACCESS_DENIED' using errcode = '42501';
  end if;
  if p_after_seq < 0 then raise exception 'INVALID_CURSOR'; end if;

  with page as (
    select * from public.v2_change_log
    where ledger_id = p_ledger_id and change_seq > p_after_seq
    order by change_seq
    limit 500
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'changeSeq', change_seq::text,
      'entityType', entity_type,
      'entityId', entity_id,
      'version', entity_version,
      'tombstone', tombstone,
      'record', record
    ) order by change_seq), '[]'::jsonb),
    coalesce(max(change_seq), p_after_seq)
  into changes, next_cursor
  from page;

  return jsonb_build_object('changes', changes, 'nextCursor', next_cursor::text);
end;
$$;

revoke all on function public.v2_pull_changes(uuid, bigint) from public, anon, authenticated;
grant execute on function public.v2_pull_changes(uuid, bigint) to authenticated;
