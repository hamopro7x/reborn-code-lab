-- عمود الجهاز لبنرات الصفحة الرئيسية: بانرات الموبايل منفصلة عن الديسكتوب.
alter table public.hero_banners
  add column if not exists device text not null default 'desktop';

alter table public.hero_banners
  drop constraint if exists hero_banners_device_check;

alter table public.hero_banners
  add constraint hero_banners_device_check check (device in ('desktop', 'mobile'));

create index if not exists hero_banners_device_idx on public.hero_banners (device, sort_order);

notify pgrst, 'reload schema';
