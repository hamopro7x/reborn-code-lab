ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DROP POLICY IF EXISTS "reviews public insert" ON public.reviews;

CREATE POLICY "reviews authenticated insert own"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (approved = false AND user_id = auth.uid());

CREATE POLICY "reviews read own pending"
ON public.reviews
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

REVOKE INSERT ON public.reviews FROM anon;