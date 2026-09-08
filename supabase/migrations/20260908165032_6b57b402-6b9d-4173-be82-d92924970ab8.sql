CREATE TABLE public.work_pins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  set_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.work_pins TO service_role;

ALTER TABLE public.work_pins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.work_pins_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_work_pins_updated_at
BEFORE UPDATE ON public.work_pins
FOR EACH ROW EXECUTE FUNCTION public.work_pins_touch_updated_at();