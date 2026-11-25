-- Public checkout and tracking use server functions with service_role.
-- Anonymous clients do not need direct table privileges on orders or order_items.
BEGIN;

REVOKE ALL ON TABLE public.orders FROM anon;
REVOKE ALL ON TABLE public.order_items FROM anon;

COMMIT;
