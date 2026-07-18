create or replace function public.v2_jsonb_has_only(value jsonb, allowed_keys text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(value) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(value) key where not (key = any(allowed_keys))
    );
$$;

revoke all on function public.v2_jsonb_has_only(jsonb, text[]) from public, anon, authenticated;

create or replace function public.v2_jsonb_has_exact(value jsonb, expected_keys text[])
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(value) = 'object'
    and (
      select array_agg(actual_key order by actual_key)
      from jsonb_object_keys(value) actual_key
    ) = (
      select array_agg(expected_key order by expected_key)
      from unnest(expected_keys) expected_key
    );
$$;

revoke all on function public.v2_jsonb_has_exact(jsonb, text[]) from public, anon, authenticated;

create or replace function public.v2_assert_management_operation(p_payload jsonb)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  operation_kind text := p_payload ->> 'kind';
  target_ledger_text text := p_payload ->> 'ledgerId';
  record_json jsonb;
  entity_id_text text;
  base_version integer;
  record_version integer;
begin
  case operation_kind
    when 'account.create' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','account']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'account';
    when 'account.update' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','accountId','baseVersion','account']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'account';
      entity_id_text := p_payload ->> 'accountId';
    when 'account.archive' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','accountId','baseVersion','archivedAt']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      entity_id_text := p_payload ->> 'accountId';
    when 'category.create' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','category']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'category';
    when 'category.update' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','categoryId','baseVersion','category']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'category';
      entity_id_text := p_payload ->> 'categoryId';
    when 'category.archive' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','categoryId','baseVersion','archivedAt']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      entity_id_text := p_payload ->> 'categoryId';
    when 'budget.create' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','budget']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'budget';
    when 'budget.update' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','budgetId','baseVersion','budget']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'budget';
      entity_id_text := p_payload ->> 'budgetId';
    when 'budget.archive' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','budgetId','baseVersion','archivedAt']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      entity_id_text := p_payload ->> 'budgetId';
    when 'category-budget.create' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','categoryBudget']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'categoryBudget';
    when 'category-budget.update' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','categoryBudgetId','baseVersion','categoryBudget']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'categoryBudget';
      entity_id_text := p_payload ->> 'categoryBudgetId';
    when 'category-budget.archive' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','categoryBudgetId','baseVersion','archivedAt']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      entity_id_text := p_payload ->> 'categoryBudgetId';
    when 'reminder.create' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','reminder']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'reminder';
    when 'reminder.update' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','reminderId','baseVersion','reminder']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      record_json := p_payload -> 'reminder';
      entity_id_text := p_payload ->> 'reminderId';
    when 'reminder.archive' then
      if not public.v2_jsonb_has_exact(p_payload, array['schemaVersion','operationId','ledgerId','createdAt','kind','reminderId','baseVersion','archivedAt']) then
        raise exception 'UNKNOWN_OPERATION_FIELD';
      end if;
      entity_id_text := p_payload ->> 'reminderId';
    else
      raise exception 'UNKNOWN_OPERATION_KIND';
  end case;

  if operation_kind like '%.archive' then
    if coalesce(entity_id_text, '') = ''
      or coalesce(p_payload ->> 'baseVersion', '') !~ '^[1-9][0-9]*$'
      or coalesce(p_payload ->> 'archivedAt', '') = '' then
      raise exception 'INVALID_ARCHIVE_OPERATION';
    end if;
    perform entity_id_text::uuid;
    perform (p_payload ->> 'archivedAt')::timestamptz;
    return;
  end if;

  if operation_kind like 'account.%' then
    if not public.v2_jsonb_has_exact(record_json, array['id','ledgerId','name','kind','accountClass','currency','openingBalanceCents','sortOrder','version','archivedAt'])
      or length(btrim(coalesce(record_json ->> 'name', ''))) not between 1 and 50
      or coalesce(record_json ->> 'kind', '') not in ('cash','wechat','alipay','debit_card','credit_card','custom')
      or coalesce(record_json ->> 'accountClass', '') not in ('asset','liability')
      or coalesce(record_json ->> 'currency', '') <> 'CNY'
      or coalesce(record_json ->> 'openingBalanceCents', '') !~ '^-?[0-9]+$'
      or coalesce(record_json ->> 'sortOrder', '') !~ '^[0-9]+$' then
      raise exception 'INVALID_ACCOUNT';
    end if;
  elsif operation_kind like 'category.%' then
    if not public.v2_jsonb_has_exact(record_json, array['id','ledgerId','name','kind','iconKey','sortOrder','version','archivedAt'])
      or length(btrim(coalesce(record_json ->> 'name', ''))) not between 1 and 30
      or coalesce(record_json ->> 'kind', '') not in ('expense','income')
      or length(btrim(coalesce(record_json ->> 'iconKey', ''))) not between 1 and 50
      or coalesce(record_json ->> 'sortOrder', '') !~ '^[0-9]+$' then
      raise exception 'INVALID_CATEGORY';
    end if;
  elsif operation_kind like 'budget.%' then
    if not public.v2_jsonb_has_exact(record_json, array['id','ledgerId','month','amountCents','version','archivedAt'])
      or coalesce(record_json ->> 'month', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or coalesce(record_json ->> 'amountCents', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_BUDGET';
    end if;
  elsif operation_kind like 'category-budget.%' then
    if not public.v2_jsonb_has_exact(record_json, array['id','ledgerId','categoryId','month','amountCents','version','archivedAt'])
      or coalesce(record_json ->> 'categoryId', '') = ''
      or coalesce(record_json ->> 'month', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
      or coalesce(record_json ->> 'amountCents', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_CATEGORY_BUDGET';
    end if;
    perform (record_json ->> 'categoryId')::uuid;
  elsif operation_kind like 'reminder.%' then
    if not public.v2_jsonb_has_exact(record_json, array['id','ledgerId','name','amountCents','categoryId','accountId','recurrence','nextDueAt','version','archivedAt'])
      or length(btrim(coalesce(record_json ->> 'name', ''))) not between 1 and 50
      or (record_json ->> 'amountCents' is not null and record_json ->> 'amountCents' !~ '^[1-9][0-9]*$')
      or length(btrim(coalesce(record_json ->> 'recurrence', ''))) not between 1 and 100
      or coalesce(record_json ->> 'nextDueAt', '') = '' then
      raise exception 'INVALID_REMINDER';
    end if;
    if record_json ->> 'categoryId' is not null then perform (record_json ->> 'categoryId')::uuid; end if;
    if record_json ->> 'accountId' is not null then perform (record_json ->> 'accountId')::uuid; end if;
    perform (record_json ->> 'nextDueAt')::timestamptz;
  end if;

  if coalesce(record_json ->> 'id', '') = ''
    or coalesce(record_json ->> 'ledgerId', '') <> target_ledger_text
    or coalesce(record_json ->> 'version', '') !~ '^[1-9][0-9]*$' then
    raise exception 'INVALID_ENTITY_ID_OR_VERSION';
  end if;
  perform (record_json ->> 'id')::uuid;
  perform target_ledger_text::uuid;
  if record_json ->> 'archivedAt' is not null then perform (record_json ->> 'archivedAt')::timestamptz; end if;
  record_version := (record_json ->> 'version')::integer;

  if operation_kind like '%.create' then
    if record_version <> 1 or record_json ->> 'archivedAt' is not null then
      raise exception 'INVALID_INITIAL_VERSION';
    end if;
  else
    if coalesce(entity_id_text, '') = ''
      or coalesce(p_payload ->> 'baseVersion', '') !~ '^[1-9][0-9]*$' then
      raise exception 'INVALID_UPDATE_VERSION';
    end if;
    perform entity_id_text::uuid;
    base_version := (p_payload ->> 'baseVersion')::integer;
    if entity_id_text <> record_json ->> 'id' or record_version <> base_version + 1 then
      raise exception 'INVALID_UPDATE_VERSION';
    end if;
  end if;
end;
$$;

revoke all on function public.v2_assert_management_operation(jsonb) from public, anon, authenticated;

create or replace function public.v2_append_change(
  target_ledger uuid,
  target_type text,
  target_id uuid,
  target_version integer,
  is_tombstone boolean,
  target_record jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.v2_change_log(
    ledger_id, entity_type, entity_id, entity_version, tombstone, record
  ) values (
    target_ledger, target_type, target_id, target_version, is_tombstone, target_record
  );
$$;

revoke all on function public.v2_append_change(uuid, text, uuid, integer, boolean, jsonb) from public, anon, authenticated;

create or replace function public.v2_assert_transaction_posting(
  target_ledger uuid,
  target_transaction uuid,
  target_type text,
  target_amount bigint,
  target_original uuid,
  proposed_entries jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entry_count integer;
  first_entry jsonb;
  second_entry jsonb;
  first_account public.v2_accounts%rowtype;
  second_account public.v2_accounts%rowtype;
  first_delta bigint;
  second_delta bigint;
  original_transaction public.v2_transactions%rowtype;
  original_entry public.v2_transaction_entries%rowtype;
  already_refunded bigint;
begin
  if target_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if jsonb_typeof(proposed_entries) <> 'array' then
    raise exception 'INVALID_ENTRIES';
  end if;
  entry_count := jsonb_array_length(proposed_entries);
  if entry_count < 1 or entry_count > 2 then
    raise exception 'INVALID_ENTRIES';
  end if;

  first_entry := proposed_entries -> 0;
  if not public.v2_jsonb_has_exact(first_entry, array['accountId', 'deltaCents'])
    or coalesce(first_entry ->> 'accountId', '') = ''
    or coalesce(first_entry ->> 'deltaCents', '') !~ '^-?[0-9]+$' then
    raise exception 'INVALID_ENTRIES';
  end if;
  first_delta := (first_entry ->> 'deltaCents')::bigint;
  select * into first_account
  from public.v2_accounts
  where id = (first_entry ->> 'accountId')::uuid and ledger_id = target_ledger;
  if not found or first_account.archived_at is not null then
    raise exception 'ACCOUNT_NOT_AVAILABLE';
  end if;

  if entry_count = 2 then
    second_entry := proposed_entries -> 1;
    if not public.v2_jsonb_has_exact(second_entry, array['accountId', 'deltaCents'])
      or coalesce(second_entry ->> 'accountId', '') = ''
      or coalesce(second_entry ->> 'deltaCents', '') !~ '^-?[0-9]+$' then
      raise exception 'INVALID_ENTRIES';
    end if;
    second_delta := (second_entry ->> 'deltaCents')::bigint;
    select * into second_account
    from public.v2_accounts
    where id = (second_entry ->> 'accountId')::uuid and ledger_id = target_ledger;
    if not found or second_account.archived_at is not null then
      raise exception 'ACCOUNT_NOT_AVAILABLE';
    end if;
  end if;

  case target_type
    when 'expense' then
      if target_original is not null
        or entry_count <> 1
        or first_delta <> (case when first_account.account_class = 'asset' then -target_amount else target_amount end) then
        raise exception 'POSTING_MISMATCH';
      end if;
    when 'income' then
      if target_original is not null or entry_count <> 1 or first_account.account_class <> 'asset' or first_delta <> target_amount then
        raise exception 'POSTING_MISMATCH';
      end if;
    when 'transfer' then
      if target_original is not null
        or entry_count <> 2
        or first_account.account_class <> 'asset'
        or first_account.id = second_account.id
        or first_delta <> -target_amount
        or second_delta <> (case when second_account.account_class = 'asset' then target_amount else -target_amount end) then
        raise exception 'POSTING_MISMATCH';
      end if;
    when 'refund' then
      if entry_count <> 1 or target_original is null then
        raise exception 'REFUND_ORIGINAL_REQUIRED';
      end if;
      select * into original_transaction
      from public.v2_transactions
      where id = target_original and ledger_id = target_ledger and type = 'expense' and deleted_at is null
      for update;
      if not found then
        raise exception 'REFUND_ORIGINAL_NOT_FOUND';
      end if;
      select * into strict original_entry
      from public.v2_transaction_entries
      where transaction_id = original_transaction.id;
      select coalesce(sum(amount_cents), 0) into already_refunded
      from public.v2_transactions
      where ledger_id = target_ledger
        and type = 'refund'
        and original_transaction_id = original_transaction.id
        and id <> target_transaction
        and deleted_at is null;
      if already_refunded + target_amount > original_transaction.amount_cents
        or first_account.id <> original_entry.account_id
        or first_delta <> (case when original_entry.delta_cents < 0 then target_amount else -target_amount end) then
        raise exception 'REFUND_EXCEEDS_ORIGINAL_OR_POSTING_MISMATCH';
      end if;
    when 'adjustment' then
      if target_original is not null or entry_count <> 1 or first_delta = 0 or abs(first_delta) <> target_amount then
        raise exception 'POSTING_MISMATCH';
      end if;
    else
      raise exception 'UNKNOWN_TRANSACTION_TYPE';
  end case;
end;
$$;

revoke all on function public.v2_assert_transaction_posting(uuid, uuid, text, bigint, uuid, jsonb) from public, anon, authenticated;

create or replace function public.v2_apply_operation(p_operation_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger uuid;
  operation_kind text;
  recorded_user uuid;
  recorded_result jsonb;
  transaction_json jsonb;
  proposed_entries jsonb;
  target_transaction_id uuid;
  transaction_type text;
  target_amount_cents bigint;
  target_category_id uuid;
  target_original_transaction_id uuid;
  base_version integer;
  proposed_version integer;
  current_transaction public.v2_transactions%rowtype;
  committed_transaction public.v2_transactions%rowtype;
  entry_json jsonb;
  entry_index integer;
  inserted_entry public.v2_transaction_entries%rowtype;
  result jsonb;
  record_json jsonb;
  entity_id uuid;
  entity_version integer;
  current_record jsonb;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload ->> 'schemaVersion', '') <> '1'
    or coalesce(p_payload ->> 'operationId', '') <> p_operation_id::text
    or coalesce(p_payload ->> 'ledgerId', '') = ''
    or coalesce(p_payload ->> 'kind', '') = '' then
    raise exception 'INVALID_OPERATION';
  end if;

  target_ledger := (p_payload ->> 'ledgerId')::uuid;
  operation_kind := p_payload ->> 'kind';
  if not public.v2_is_ledger_member(target_ledger) then
    raise exception 'LEDGER_ACCESS_DENIED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  select user_id, sync.result into recorded_user, recorded_result
  from public.v2_sync_operations sync
  where sync.operation_id = p_operation_id;
  if found then
    if recorded_user <> current_user_id then
      raise exception 'OPERATION_ACCESS_DENIED' using errcode = '42501';
    end if;
    return recorded_result;
  end if;

  if operation_kind in ('transaction.create', 'transaction.update') then
    if not public.v2_jsonb_has_exact(
      p_payload,
      case when operation_kind = 'transaction.create'
        then array['schemaVersion', 'operationId', 'ledgerId', 'createdAt', 'kind', 'transaction', 'entries']
        else array['schemaVersion', 'operationId', 'ledgerId', 'createdAt', 'kind', 'transactionId', 'baseVersion', 'transaction', 'entries']
      end
    ) then
      raise exception 'UNKNOWN_OPERATION_FIELD';
    end if;
    transaction_json := p_payload -> 'transaction';
    proposed_entries := p_payload -> 'entries';

    if operation_kind = 'transaction.update' then
      target_transaction_id := (p_payload ->> 'transactionId')::uuid;
      if coalesce(p_payload ->> 'baseVersion', '') !~ '^[0-9]+$' then
        raise exception 'INVALID_BASE_VERSION';
      end if;
      base_version := (p_payload ->> 'baseVersion')::integer;
      select * into current_transaction
      from public.v2_transactions
      where id = target_transaction_id and ledger_id = target_ledger
      for update;
      if not found then
        raise exception 'TRANSACTION_NOT_FOUND';
      end if;
      if current_transaction.version <> base_version then
        result := jsonb_build_object(
          'status', 'conflict',
          'transactionId', target_transaction_id,
          'server', to_jsonb(current_transaction),
          'local', transaction_json
        );
        insert into public.v2_sync_operations(operation_id, ledger_id, user_id, operation_kind, result)
        values (p_operation_id, target_ledger, current_user_id, operation_kind, result);
        return result;
      end if;
    end if;

    if not public.v2_jsonb_has_exact(
      transaction_json,
      array['id', 'operationId', 'ledgerId', 'type', 'amountCents', 'categoryId', 'occurredAt',
        'note', 'originalTransactionId', 'version', 'deletedAt']
    )
      or coalesce(transaction_json ->> 'id', '') = ''
      or coalesce(transaction_json ->> 'operationId', '') <> p_operation_id::text
      or coalesce(transaction_json ->> 'ledgerId', '') <> target_ledger::text
      or coalesce(transaction_json ->> 'amountCents', '') !~ '^[0-9]+$'
      or coalesce(transaction_json ->> 'version', '') !~ '^[0-9]+$' then
      raise exception 'INVALID_TRANSACTION';
    end if;

    target_transaction_id := (transaction_json ->> 'id')::uuid;
    transaction_type := transaction_json ->> 'type';
    target_amount_cents := (transaction_json ->> 'amountCents')::bigint;
    proposed_version := (transaction_json ->> 'version')::integer;
    target_category_id := nullif(transaction_json ->> 'categoryId', '')::uuid;
    target_original_transaction_id := nullif(transaction_json ->> 'originalTransactionId', '')::uuid;

    if operation_kind = 'transaction.create' and proposed_version <> 1 then
      raise exception 'INVALID_INITIAL_VERSION';
    end if;
    if operation_kind = 'transaction.update'
      and (target_transaction_id <> (p_payload ->> 'transactionId')::uuid or proposed_version <> base_version + 1) then
      raise exception 'INVALID_UPDATE_VERSION';
    end if;
    if target_category_id is not null and not exists (
      select 1 from public.v2_categories
      where id = target_category_id and ledger_id = target_ledger and archived_at is null
    ) then
      raise exception 'CATEGORY_NOT_AVAILABLE';
    end if;

    perform public.v2_assert_transaction_posting(
      target_ledger, target_transaction_id, transaction_type, target_amount_cents,
      target_original_transaction_id, proposed_entries
    );

    if operation_kind = 'transaction.create' then
      insert into public.v2_transactions(
        id, operation_id, ledger_id, type, amount_cents, category_id, occurred_at,
        note, original_transaction_id, version, deleted_at
      ) values (
        target_transaction_id,
        p_operation_id,
        target_ledger,
        transaction_type,
        target_amount_cents,
        target_category_id,
        (transaction_json ->> 'occurredAt')::timestamptz,
        coalesce(transaction_json ->> 'note', ''),
        target_original_transaction_id,
        proposed_version,
        nullif(transaction_json ->> 'deletedAt', '')::timestamptz
      ) returning * into committed_transaction;
    else
      for inserted_entry in
        select * from public.v2_transaction_entries where transaction_id = current_transaction.id
      loop
        perform public.v2_append_change(
          target_ledger, 'entry', inserted_entry.id, current_transaction.version + 1, true, to_jsonb(inserted_entry)
        );
      end loop;
      delete from public.v2_transaction_entries where transaction_id = current_transaction.id;
      update public.v2_transactions set
        operation_id = p_operation_id,
        type = transaction_type,
        amount_cents = target_amount_cents,
        category_id = target_category_id,
        occurred_at = (transaction_json ->> 'occurredAt')::timestamptz,
        note = coalesce(transaction_json ->> 'note', ''),
        original_transaction_id = target_original_transaction_id,
        version = proposed_version,
        deleted_at = nullif(transaction_json ->> 'deletedAt', '')::timestamptz,
        updated_at = now()
      where id = target_transaction_id
      returning * into committed_transaction;
    end if;

    for entry_index in 0..jsonb_array_length(proposed_entries) - 1 loop
      entry_json := proposed_entries -> entry_index;
      insert into public.v2_transaction_entries(
        ledger_id, transaction_id, account_id, delta_cents, position
      ) values (
        target_ledger,
        target_transaction_id,
        (entry_json ->> 'accountId')::uuid,
        (entry_json ->> 'deltaCents')::bigint,
        entry_index
      ) returning * into inserted_entry;
      perform public.v2_append_change(
        target_ledger, 'entry', inserted_entry.id, proposed_version, false, to_jsonb(inserted_entry)
      );
    end loop;

    perform public.v2_append_change(
      target_ledger, 'transaction', target_transaction_id, proposed_version,
      committed_transaction.deleted_at is not null, to_jsonb(committed_transaction)
    );
    result := jsonb_build_object(
      'status', 'applied', 'transactionId', target_transaction_id, 'serverVersion', proposed_version
    );

  elsif operation_kind in ('transaction.delete', 'transaction.restore') then
    if not public.v2_jsonb_has_exact(
      p_payload,
      case when operation_kind = 'transaction.delete'
        then array['schemaVersion', 'operationId', 'ledgerId', 'createdAt', 'kind', 'transactionId', 'baseVersion', 'deletedAt']
        else array['schemaVersion', 'operationId', 'ledgerId', 'createdAt', 'kind', 'transactionId', 'baseVersion']
      end
    ) then
      raise exception 'UNKNOWN_OPERATION_FIELD';
    end if;
    target_transaction_id := (p_payload ->> 'transactionId')::uuid;
    base_version := (p_payload ->> 'baseVersion')::integer;
    select * into current_transaction
    from public.v2_transactions where id = target_transaction_id and ledger_id = target_ledger for update;
    if not found then raise exception 'TRANSACTION_NOT_FOUND'; end if;
    if current_transaction.version <> base_version then
      result := jsonb_build_object(
        'status', 'conflict', 'transactionId', target_transaction_id,
        'server', to_jsonb(current_transaction), 'local', p_payload
      );
    else
      update public.v2_transactions set
        operation_id = p_operation_id,
        version = version + 1,
        deleted_at = case when operation_kind = 'transaction.delete'
          then (p_payload ->> 'deletedAt')::timestamptz else null end,
        updated_at = now()
      where id = target_transaction_id
      returning * into committed_transaction;
      perform public.v2_append_change(
        target_ledger, 'transaction', target_transaction_id, committed_transaction.version,
        committed_transaction.deleted_at is not null, to_jsonb(committed_transaction)
      );
      result := jsonb_build_object(
        'status', 'applied', 'transactionId', target_transaction_id,
        'serverVersion', committed_transaction.version
      );
    end if;

  elsif operation_kind in ('account.create', 'account.update', 'account.archive') then
    perform public.v2_assert_management_operation(p_payload);
    if operation_kind = 'account.create' then
      record_json := p_payload -> 'account';
      insert into public.v2_accounts(
        id, ledger_id, name, kind, account_class, currency, opening_balance_cents,
        sort_order, version, archived_at
      ) values (
        (record_json->>'id')::uuid, target_ledger, record_json->>'name', record_json->>'kind',
        record_json->>'accountClass', record_json->>'currency', (record_json->>'openingBalanceCents')::bigint,
        (record_json->>'sortOrder')::integer, (record_json->>'version')::integer,
        nullif(record_json->>'archivedAt','')::timestamptz
      ) returning id, version, to_jsonb(public.v2_accounts.*) into entity_id, entity_version, current_record;
    else
      entity_id := (p_payload->>'accountId')::uuid;
      base_version := (p_payload->>'baseVersion')::integer;
      select to_jsonb(account), account.version into current_record, entity_version
      from public.v2_accounts account where account.id = entity_id and account.ledger_id = target_ledger for update;
      if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
      if entity_version <> base_version then
        result := jsonb_build_object('status','conflict','server',current_record,'local',coalesce(p_payload->'account',p_payload));
      elsif operation_kind = 'account.archive' then
        update public.v2_accounts set archived_at=(p_payload->>'archivedAt')::timestamptz, version=version+1, updated_at=now()
        where id=entity_id returning version, to_jsonb(public.v2_accounts.*) into entity_version, current_record;
      else
        record_json := p_payload->'account';
        update public.v2_accounts set
          name=record_json->>'name', kind=record_json->>'kind', account_class=record_json->>'accountClass',
          currency=record_json->>'currency', opening_balance_cents=(record_json->>'openingBalanceCents')::bigint,
          sort_order=(record_json->>'sortOrder')::integer, version=base_version+1,
          archived_at=nullif(record_json->>'archivedAt','')::timestamptz, updated_at=now()
        where id=entity_id returning version, to_jsonb(public.v2_accounts.*) into entity_version, current_record;
      end if;
    end if;
    if result is null then
      perform public.v2_append_change(target_ledger,'account',entity_id,entity_version,(current_record->>'archived_at') is not null,current_record);
      result := jsonb_build_object('status','applied','entityId',entity_id,'serverVersion',entity_version);
    end if;

  elsif operation_kind in ('category.create', 'category.update', 'category.archive') then
    perform public.v2_assert_management_operation(p_payload);
    if operation_kind = 'category.create' then
      record_json := p_payload -> 'category';
      insert into public.v2_categories(id,ledger_id,name,kind,icon_key,sort_order,version,archived_at)
      values ((record_json->>'id')::uuid,target_ledger,record_json->>'name',record_json->>'kind',record_json->>'iconKey',
        (record_json->>'sortOrder')::integer,(record_json->>'version')::integer,nullif(record_json->>'archivedAt','')::timestamptz)
      returning id,version,to_jsonb(public.v2_categories.*) into entity_id,entity_version,current_record;
    else
      entity_id := (p_payload->>'categoryId')::uuid;
      base_version := (p_payload->>'baseVersion')::integer;
      select to_jsonb(category),category.version into current_record,entity_version
      from public.v2_categories category where category.id=entity_id and category.ledger_id=target_ledger for update;
      if not found then raise exception 'CATEGORY_NOT_FOUND'; end if;
      if entity_version <> base_version then
        result := jsonb_build_object('status','conflict','server',current_record,'local',coalesce(p_payload->'category',p_payload));
      elsif operation_kind = 'category.archive' then
        update public.v2_categories set archived_at=(p_payload->>'archivedAt')::timestamptz,version=version+1,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_categories.*) into entity_version,current_record;
      else
        record_json := p_payload->'category';
        update public.v2_categories set name=record_json->>'name',kind=record_json->>'kind',icon_key=record_json->>'iconKey',
          sort_order=(record_json->>'sortOrder')::integer,version=base_version+1,
          archived_at=nullif(record_json->>'archivedAt','')::timestamptz,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_categories.*) into entity_version,current_record;
      end if;
    end if;
    if result is null then
      perform public.v2_append_change(target_ledger,'category',entity_id,entity_version,(current_record->>'archived_at') is not null,current_record);
      result := jsonb_build_object('status','applied','entityId',entity_id,'serverVersion',entity_version);
    end if;

  elsif operation_kind in ('budget.create', 'budget.update', 'budget.archive') then
    perform public.v2_assert_management_operation(p_payload);
    if operation_kind = 'budget.create' then
      record_json := p_payload->'budget';
      insert into public.v2_budgets(id,ledger_id,month,amount_cents,version,archived_at)
      values ((record_json->>'id')::uuid,target_ledger,((record_json->>'month')||'-01')::date,
        (record_json->>'amountCents')::bigint,(record_json->>'version')::integer,nullif(record_json->>'archivedAt','')::timestamptz)
      returning id,version,to_jsonb(public.v2_budgets.*) into entity_id,entity_version,current_record;
    else
      entity_id := (p_payload->>'budgetId')::uuid;
      base_version := (p_payload->>'baseVersion')::integer;
      select to_jsonb(budget),budget.version into current_record,entity_version
      from public.v2_budgets budget where budget.id=entity_id and budget.ledger_id=target_ledger for update;
      if not found then raise exception 'BUDGET_NOT_FOUND'; end if;
      if entity_version <> base_version then result:=jsonb_build_object('status','conflict','server',current_record,'local',coalesce(p_payload->'budget',p_payload));
      elsif operation_kind='budget.archive' then
        update public.v2_budgets set archived_at=(p_payload->>'archivedAt')::timestamptz,version=version+1,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_budgets.*) into entity_version,current_record;
      else
        record_json:=p_payload->'budget';
        update public.v2_budgets set month=((record_json->>'month')||'-01')::date,amount_cents=(record_json->>'amountCents')::bigint,
          version=base_version+1,archived_at=nullif(record_json->>'archivedAt','')::timestamptz,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_budgets.*) into entity_version,current_record;
      end if;
    end if;
    if result is null then
      perform public.v2_append_change(target_ledger,'budget',entity_id,entity_version,(current_record->>'archived_at') is not null,current_record);
      result:=jsonb_build_object('status','applied','entityId',entity_id,'serverVersion',entity_version);
    end if;

  elsif operation_kind in ('category-budget.create','category-budget.update','category-budget.archive') then
    perform public.v2_assert_management_operation(p_payload);
    if operation_kind='category-budget.create' then
      record_json:=p_payload->'categoryBudget';
      insert into public.v2_category_budgets(id,ledger_id,category_id,month,amount_cents,version,archived_at)
      values ((record_json->>'id')::uuid,target_ledger,(record_json->>'categoryId')::uuid,((record_json->>'month')||'-01')::date,
        (record_json->>'amountCents')::bigint,(record_json->>'version')::integer,nullif(record_json->>'archivedAt','')::timestamptz)
      returning id,version,to_jsonb(public.v2_category_budgets.*) into entity_id,entity_version,current_record;
    else
      entity_id:=(p_payload->>'categoryBudgetId')::uuid; base_version:=(p_payload->>'baseVersion')::integer;
      select to_jsonb(item),item.version into current_record,entity_version from public.v2_category_budgets item
      where item.id=entity_id and item.ledger_id=target_ledger for update;
      if not found then raise exception 'CATEGORY_BUDGET_NOT_FOUND'; end if;
      if entity_version<>base_version then result:=jsonb_build_object('status','conflict','server',current_record,'local',coalesce(p_payload->'categoryBudget',p_payload));
      elsif operation_kind='category-budget.archive' then
        update public.v2_category_budgets set archived_at=(p_payload->>'archivedAt')::timestamptz,version=version+1,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_category_budgets.*) into entity_version,current_record;
      else
        record_json:=p_payload->'categoryBudget';
        update public.v2_category_budgets set category_id=(record_json->>'categoryId')::uuid,month=((record_json->>'month')||'-01')::date,
          amount_cents=(record_json->>'amountCents')::bigint,version=base_version+1,
          archived_at=nullif(record_json->>'archivedAt','')::timestamptz,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_category_budgets.*) into entity_version,current_record;
      end if;
    end if;
    if result is null then
      perform public.v2_append_change(target_ledger,'categoryBudget',entity_id,entity_version,(current_record->>'archived_at') is not null,current_record);
      result:=jsonb_build_object('status','applied','entityId',entity_id,'serverVersion',entity_version);
    end if;

  elsif operation_kind in ('reminder.create','reminder.update','reminder.archive') then
    perform public.v2_assert_management_operation(p_payload);
    if operation_kind='reminder.create' then
      record_json:=p_payload->'reminder';
      insert into public.v2_reminders(id,ledger_id,name,amount_cents,category_id,account_id,recurrence,next_due_at,version,archived_at)
      values ((record_json->>'id')::uuid,target_ledger,record_json->>'name',nullif(record_json->>'amountCents','')::bigint,
        nullif(record_json->>'categoryId','')::uuid,nullif(record_json->>'accountId','')::uuid,record_json->>'recurrence',
        (record_json->>'nextDueAt')::timestamptz,(record_json->>'version')::integer,nullif(record_json->>'archivedAt','')::timestamptz)
      returning id,version,to_jsonb(public.v2_reminders.*) into entity_id,entity_version,current_record;
    else
      entity_id:=(p_payload->>'reminderId')::uuid; base_version:=(p_payload->>'baseVersion')::integer;
      select to_jsonb(item),item.version into current_record,entity_version from public.v2_reminders item
      where item.id=entity_id and item.ledger_id=target_ledger for update;
      if not found then raise exception 'REMINDER_NOT_FOUND'; end if;
      if entity_version<>base_version then result:=jsonb_build_object('status','conflict','server',current_record,'local',coalesce(p_payload->'reminder',p_payload));
      elsif operation_kind='reminder.archive' then
        update public.v2_reminders set archived_at=(p_payload->>'archivedAt')::timestamptz,version=version+1,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_reminders.*) into entity_version,current_record;
      else
        record_json:=p_payload->'reminder';
        update public.v2_reminders set name=record_json->>'name',amount_cents=nullif(record_json->>'amountCents','')::bigint,
          category_id=nullif(record_json->>'categoryId','')::uuid,account_id=nullif(record_json->>'accountId','')::uuid,
          recurrence=record_json->>'recurrence',next_due_at=(record_json->>'nextDueAt')::timestamptz,version=base_version+1,
          archived_at=nullif(record_json->>'archivedAt','')::timestamptz,updated_at=now()
        where id=entity_id returning version,to_jsonb(public.v2_reminders.*) into entity_version,current_record;
      end if;
    end if;
    if result is null then
      perform public.v2_append_change(target_ledger,'reminder',entity_id,entity_version,(current_record->>'archived_at') is not null,current_record);
      result:=jsonb_build_object('status','applied','entityId',entity_id,'serverVersion',entity_version);
    end if;
  else
    raise exception 'UNKNOWN_OPERATION_KIND';
  end if;

  insert into public.v2_sync_operations(operation_id, ledger_id, user_id, operation_kind, result)
  values (p_operation_id, target_ledger, current_user_id, operation_kind, result);
  return result;
end;
$$;

revoke all on function public.v2_apply_operation(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.v2_apply_operation(uuid, jsonb) to authenticated;

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
