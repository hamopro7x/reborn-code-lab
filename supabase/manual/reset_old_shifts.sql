-- Permanently delete ALL closed (old) employee shifts and their records.
-- Open shifts are kept. P2P links are detached (shift_id = NULL) so those
-- orders do not reappear as available. Run once in the SQL editor. NOT reversible.
BEGIN;

CREATE TEMP TABLE old_shifts ON COMMIT DROP AS
  SELECT id FROM public.work_shifts WHERE ended_at IS NOT NULL;

UPDATE public.work_txn_assignments SET shift_id = NULL
  WHERE shift_id IN (SELECT id FROM old_shifts) AND kind IN ('p2p_buy','p2p_sell');

DELETE FROM public.work_txn_assignments
  WHERE shift_id IN (SELECT id FROM old_shifts) AND kind NOT IN ('p2p_buy','p2p_sell');

DELETE FROM public.work_manual_card_txns WHERE shift_id IN (SELECT id FROM old_shifts);
DELETE FROM public.work_manual_txns WHERE shift_id IN (SELECT id FROM old_shifts);


DELETE FROM public.work_shifts WHERE id IN (SELECT id FROM old_shifts);

COMMIT;
