revoke all on function public.v2_is_ledger_member(uuid) from public, anon, authenticated;
revoke all on function public.v2_bootstrap_personal_ledger() from public, anon, authenticated;
revoke all on function public.v2_jsonb_has_only(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.v2_jsonb_has_exact(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.v2_assert_management_operation(jsonb) from public, anon, authenticated;
revoke all on function public.v2_append_change(uuid, text, uuid, integer, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.v2_assert_transaction_posting(uuid, uuid, text, bigint, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.v2_apply_operation(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.v2_pull_changes(uuid, bigint) from public, anon, authenticated;

grant execute on function public.v2_is_ledger_member(uuid) to authenticated;
grant execute on function public.v2_bootstrap_personal_ledger() to authenticated;
grant execute on function public.v2_apply_operation(uuid, jsonb) to authenticated;
grant execute on function public.v2_pull_changes(uuid, bigint) to authenticated;
