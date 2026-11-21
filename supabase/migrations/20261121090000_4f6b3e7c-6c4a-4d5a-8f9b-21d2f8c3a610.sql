-- Restrict direct employee reads of global Bybit data.
-- Employee work sheets continue to read their scoped rows through trusted server
-- functions using the service role; service_role bypasses these RLS policies.
BEGIN;

-- A separate mandatory-chat policy existed on these tables. PostgreSQL combines
-- permissive SELECT policies with OR, so that policy could reopen global reads
-- for employees who had no unread mandatory message. Remove it from raw Bybit
-- tables: employees must use the scoped server work-sheet functions instead.
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.bybit_ledger;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.bybit_accounts;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.bybit_cards;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.bybit_account_info;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.bybit_card_txns;

-- The ledger contains every account's financial movements. Employees must not
-- be able to query it directly or receive its rows through Postgres Changes.
DROP POLICY IF EXISTS "bybit ledger staff read" ON public.bybit_ledger;
DROP POLICY IF EXISTS "bybit ledger admin read" ON public.bybit_ledger;
CREATE POLICY "bybit ledger admin read" ON public.bybit_ledger
  FOR SELECT TO authenticated
  USING ((select private.is_admin((select auth.uid()))));

-- Account metadata is also available to the employee UI only as server-shaped
-- work-sheet fields, not as direct access to every account.
DROP POLICY IF EXISTS "bybit accounts employee read" ON public.bybit_accounts;

-- bybit_cards contains full_number, cvv, and expiry. A table-level SELECT policy
-- cannot hide those columns, so direct reads are admin-only.
DROP POLICY IF EXISTS "Employees can view bybit cards" ON public.bybit_cards;

-- Account information contains credentials and MFA fields.
DROP POLICY IF EXISTS "bybit account info employee read" ON public.bybit_account_info;

-- Raw card transactions are an admin data source, not an employee work-sheet API.
DROP POLICY IF EXISTS "bybit card txns employee read" ON public.bybit_card_txns;

-- Supporting account documents may contain sensitive account material.
DROP POLICY IF EXISTS "bybit docs staff read" ON storage.objects;
DROP POLICY IF EXISTS "bybit docs admin read" ON storage.objects;
CREATE POLICY "bybit docs admin read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'bybit-docs' AND (select private.is_admin((select auth.uid()))));

-- Employees can read only their own shift and assignment metadata. Admins retain
-- cross-employee visibility. Preserve the mandatory-chat gate inside the scoped
-- policies; do not leave it as a separate permissive policy (which ORs with scope).
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.work_shifts;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.work_txn_assignments;
DROP POLICY IF EXISTS "chat_mandatory_read_guard" ON public.work_transfer_notes;

DROP POLICY IF EXISTS "staff read shifts" ON public.work_shifts;
DROP POLICY IF EXISTS "own or admin read shifts" ON public.work_shifts;
CREATE POLICY "own or admin read shifts" ON public.work_shifts
  FOR SELECT TO authenticated
  USING (
    (user_id = (select auth.uid()) OR (select private.is_admin((select auth.uid()))))
    AND (select public.staff_chat_can_read_work())
  );

DROP POLICY IF EXISTS "staff read assignments" ON public.work_txn_assignments;
DROP POLICY IF EXISTS "own or admin read assignments" ON public.work_txn_assignments;
CREATE POLICY "own or admin read assignments" ON public.work_txn_assignments
  FOR SELECT TO authenticated
  USING (
    (user_id = (select auth.uid()) OR (select private.is_admin((select auth.uid()))))
    AND (select public.staff_chat_can_read_work())
  );

-- Transfer notes are tied to an employee-owned withdrawal. The former staff-wide
-- policy exposed every employee's notes to every other employee.
DROP POLICY IF EXISTS "staff read transfer notes" ON public.work_transfer_notes;
DROP POLICY IF EXISTS "own or admin read transfer notes" ON public.work_transfer_notes;
CREATE POLICY "own or admin read transfer notes" ON public.work_transfer_notes
  FOR SELECT TO authenticated
  USING (
    (user_id = (select auth.uid()) OR (select private.is_admin((select auth.uid()))))
    AND (select public.staff_chat_can_read_work())
  );

COMMIT;
