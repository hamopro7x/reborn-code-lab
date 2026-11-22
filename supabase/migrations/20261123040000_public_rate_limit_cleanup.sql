-- Bound storage growth for durable public-order throttling.
-- Expired buckets are removed in small batches, not with an unbounded table scan.
BEGIN;

CREATE INDEX IF NOT EXISTS public_rate_limits_updated_at_idx
  ON public.public_rate_limits (updated_at);

CREATE OR REPLACE FUNCTION public.consume_public_rate_limit(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash text;
  v_now timestamptz := clock_timestamp();
  v_row public.public_rate_limits%ROWTYPE;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) < 3 OR length(p_bucket) > 300
     OR p_limit < 1 OR p_limit > 10000
     OR p_window_seconds < 1 OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'invalid rate limit parameters';
  END IF;

  v_hash := encode(extensions.digest(p_bucket, 'sha256'), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_hash, 0));

  -- One in 128 calls performs bounded cleanup. The index keeps this independent
  -- of the total table size; stale rows cannot accumulate indefinitely.
  IF (hashtextextended(v_hash, 1) & 127) = 0 THEN
    DELETE FROM public.public_rate_limits
    WHERE ctid IN (
      SELECT ctid
      FROM public.public_rate_limits
      WHERE updated_at < v_now - interval '2 days'
      ORDER BY updated_at
      LIMIT 200
    );
  END IF;

  SELECT * INTO v_row FROM public.public_rate_limits WHERE bucket_hash = v_hash FOR UPDATE;
  IF NOT FOUND OR v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) THEN
    INSERT INTO public.public_rate_limits(bucket_hash, window_started_at, hits, updated_at)
    VALUES (v_hash, v_now, 1, v_now)
    ON CONFLICT (bucket_hash) DO UPDATE
      SET window_started_at = EXCLUDED.window_started_at, hits = 1, updated_at = EXCLUDED.updated_at;
    RETURN true;
  END IF;

  IF v_row.hits >= p_limit THEN RETURN false; END IF;
  UPDATE public.public_rate_limits SET hits = hits + 1, updated_at = v_now WHERE bucket_hash = v_hash;
  RETURN true;
END;
$$;

COMMIT;
