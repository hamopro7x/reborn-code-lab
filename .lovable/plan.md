# تصحيح انتقائي لمعاملات 2.79 (31/10) — جاهز، لم يُنفّذ

## الحقائق
- `mvx04xfn` = 1793487476291 = **2026-10-31T22:57:56Z** (حسابك صح، وكلامي اللي قبله كان غلط). الـcommit `cd2082a1` اتعمل 22:53:25Z، فالنسخة اللي شغالة على الأرجح فيها PR #1. **تنبيه:** `main` دلوقتي فيه commit أحدث (23:03:49Z)، يعني أحدث من البناء الشغال.
- إثبات إن commit معين منشور: مش ممكن. معرّف النسخة بيتعمل من وقت البناء بس، ومش مربوط بأي commit.
- البيانات دلوقتي:
  - 23:33:47 (…626441): المحفوظ success في المكانين، `side` 1، `tradeStatus` 1.
  - 23:33:50 (…626471): الأرشيف failed و`linkedReversal=1`، والسجل المركزي reversed. `side` 1، `tradeStatus` 0.
  - 23:55:06 (…640474): `side` 2، الأرشيف failed، والسجل المركزي reversed.
  - التلاتة متسندين لشفت `82da1da4` تلقائيًا.
- الكود الحالي **مش هيرجّع** 23:33:50 لحالة ناجحة لوحده. السبب إن علامة `linkedReversal` بتفضل ثابتة في الأرشيف (سطر 1200 في `bybit.server.ts`)، وفي السجل المركزي (سطر 2200)، وفي العرض (`mapStoredRow`، سطر 1352).
- `tradeStatus=1` على 23:33:47 مش بيثبت ولا بينفي العكس. وسجل side 2 ملوش أي ID مشترك مع المعاملتين، فمفيش ربط تلقائي. التصحيح هيبقى **يدوي لمرة واحدة** معتمد على صورة Bybit، ومن غير ما نعممه على أي حالة تانية.

## SQL جاهز (ميتنفذش غير بموافقتك)
```sql
begin;
-- نسخة احتياطية
create table if not exists public.bybit_fix_backup_20261031 as
  select 'card' src, to_jsonb(c) row from bybit_card_txns c where false;
insert into public.bybit_fix_backup_20261031
  select 'card', to_jsonb(c) from bybit_card_txns c
   where txn_id in ('3000000683626441','3000000683626471','3000000683640474')
  union all
  select 'ledger', to_jsonb(l) from bybit_ledger l
   where ref_id in ('3000000683626441','3000000683626471','3000000683640474');

-- شروط مسبقة: لو أي حاجة اتغيرت، يتلغي كل حاجة
do $$ begin
  if (select count(*) from bybit_card_txns where
        (txn_id='3000000683626441' and status='success' and detail->>'tradeStatus'='1' and detail->>'linkedReversal' is null) or
        (txn_id='3000000683626471' and status='failed'  and detail->>'tradeStatus'='0' and detail->>'linkedReversal'='1') or
        (txn_id='3000000683640474' and detail->>'side'='2')) <> 3
  then raise exception 'precondition failed: archive changed'; end if;
  if (select count(*) from bybit_ledger where
        (ref_id='3000000683626441' and status='success') or
        (ref_id='3000000683626471' and status='reversed')) <> 2
  then raise exception 'precondition failed: ledger changed'; end if;
end $$;

-- 23:33:50 ترجع حسب Bybit (قيد التنفيذ = ناجحة)
update bybit_card_txns set status='success', detail = detail - 'linkedReversal'
 where txn_id='3000000683626471';
update bybit_ledger set status='success', detail = detail - 'linkedReversal'
 where ref_id='3000000683626471' and kind='card';

-- 23:33:47 معكوسة (تأكيد يدوي من صورة Bybit، لمرة واحدة)
update bybit_card_txns set status='failed',
       detail = detail || '{"linkedReversal":1,"linkedBy":"manual-20261031"}'
 where txn_id='3000000683626441';
update bybit_ledger set status='reversed',
       detail = detail || '{"linkedReversal":1,"linkedBy":"manual-20261031"}'
 where ref_id='3000000683626441' and kind='card';
commit;
```
- مش هيلمس أي سجل غير التلات سجلات دول. سجل 23:55:06 هيفضل زي ما هو، والكود بيمنع إنه يظهر كشراء.
- الخطأ مش هيرجع بعد المزامنة: نفس العلامة الثابتة اللي كانت مسببة المشكلة هي اللي هتحمي 23:33:47 كمعكوسة. ومعاملة 23:33:50 مفيهاش العلامة دي ولا عكس صريح، فهتمشي على `tradeStatus=0`، يعني ناجحة.
- الرجوع للحالة القديمة: نرجّع الصفوف من `bybit_fix_backup_20261031`.

## بعد التنفيذ
قراءة بس للصفوف التلاتة في الأرشيف والسجل المركزي. وبعد المزامنة الجاية نقراها تاني ونتأكد إن 23:33:47 فاشلة و23:33:50 ناجحة.
