ALTER TABLE public.user_devices ADD COLUMN IF NOT EXISTS hw_signature text;
CREATE INDEX IF NOT EXISTS user_devices_hw_signature_idx ON public.user_devices (hw_signature);