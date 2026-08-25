DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bybit_ledger','work_txn_assignments','work_txn_entries','work_transfer_notes',
    'work_manual_card_txns','work_manual_txns','work_shifts','bybit_card_txns',
    'bybit_accounts','bybit_account_info','bybit_cards','card_transactions',
    'agent_devices','remote_access','products','product_prices','categories',
    'orders','order_items','payment_methods','currencies','exchange_rates',
    'countdown_timers','site_settings','reviews','admin_notifications',
    'courses','course_lessons','course_access','course_progress','user_roles','profiles'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;