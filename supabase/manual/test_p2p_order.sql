-- طلب P2P تجريبي بقيمة 0 للتجربة — يظهر في قسم «طلبات P2P» عند الموظفين
INSERT INTO bybit_ledger (account_id, kind, ref_id, amount, currency, status, txn_time)
SELECT id, 'p2p_buy', 'TEST-P2P-' || floor(extract(epoch from now()))::text, 0, 'USDT', 'اكتملت', now()
FROM bybit_accounts
ORDER BY created_at
LIMIT 1;
