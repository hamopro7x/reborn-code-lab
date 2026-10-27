-- Sender logo: a small image URL picked from the message body, shown next to the sender in the list.
alter table public.mail_messages add column if not exists sender_logo_url text;

-- Backfill existing messages: prefer a URL containing "logo", otherwise the first https image.
update public.mail_messages
set sender_logo_url = coalesce(
  (regexp_match(body_html, '<img[^>]{0,600}?src="(https://[^"<>\s]*logo[^"<>\s]{1,500})"'))[1],
  (regexp_match(body_html, '<img[^>]{0,600}?src="(https://[^"<>\s]{10,500})"'))[1]
)
where sender_logo_url is null
  and body_html is not null
  and coalesce(
    (regexp_match(body_html, '<img[^>]{0,600}?src="(https://[^"<>\s]*logo[^"<>\s]{1,500})"'))[1],
    (regexp_match(body_html, '<img[^>]{0,600}?src="(https://[^"<>\s]{10,500})"'))[1]
  ) is not null;
