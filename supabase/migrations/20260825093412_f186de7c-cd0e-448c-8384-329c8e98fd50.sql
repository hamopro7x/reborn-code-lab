CREATE INDEX IF NOT EXISTS work_manual_txns_user_card_created_idx ON public.work_manual_txns (user_id, card, created_at DESC);
CREATE INDEX IF NOT EXISTS work_manual_txns_created_idx ON public.work_manual_txns (created_at);
CREATE INDEX IF NOT EXISTS work_manual_card_txns_user_shift_created_idx ON public.work_manual_card_txns (user_id, shift_id, created_at DESC);
CREATE INDEX IF NOT EXISTS work_manual_card_txns_created_idx ON public.work_manual_card_txns (created_at);
CREATE INDEX IF NOT EXISTS work_txn_assignments_assigned_at_idx ON public.work_txn_assignments (assigned_at);