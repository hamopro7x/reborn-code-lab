-- Sender logo: a small image URL picked from the message body, shown next to the sender in the list.
alter table public.mail_messages add column if not exists sender_logo_url text;

-- Backfill existing messages: prefer a URL containing "logo", otherwise the first https image.
with logos as (
  select id,
    coalesce(
      (regexp_match(body_html, '<img[^>]*?src="(https://[^"<>[:space:]]*logo[^"<>[:space:]]*)"', 'i'))[1],
      (regexp_match(body_html, '<img[^>]*?src="(https://[^"<>[:space:]]+)"', 'i'))[1]
    ) as logo
  from public.mail_messages
  where sender_logo_url is null and body_html is not null
)
update public.mail_messages m
set sender_logo_url = l.logo
from logos l
where m.id = l.id and l.logo is not null and length(l.logo) <= 500;
