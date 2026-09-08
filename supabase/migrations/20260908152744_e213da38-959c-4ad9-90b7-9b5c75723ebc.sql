ALTER TABLE public.work_txn_assignments DROP CONSTRAINT IF EXISTS work_txn_assignments_assign_mode_check;
ALTER TABLE public.work_txn_assignments ADD CONSTRAINT work_txn_assignments_assign_mode_check CHECK (assign_mode = ANY (ARRAY['auto'::text, 'manual'::text, 'previously_assigned'::text]));
ALTER TABLE public.work_txn_assignments DROP CONSTRAINT IF EXISTS work_txn_assignments_shift_id_fkey;
ALTER TABLE public.work_txn_assignments ADD CONSTRAINT work_txn_assignments_shift_id_fkey FOREIGN KEY (shift_id) REFERENCES public.work_shifts(id) ON DELETE SET NULL;