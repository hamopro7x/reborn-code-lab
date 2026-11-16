-- REVIEW ONLY. Do not run from the application or on production without owner review/backup.
-- Additive schema. Reuses user_roles, profiles, the private site-assets bucket, and existing Realtime.
-- No existing row, role, shift, transaction, P2P link, or mail data is modified.
BEGIN;

CREATE TABLE public.staff_chat_group (
  id boolean PRIMARY KEY DEFAULT true CHECK (id), owner_id uuid NOT NULL,
  is_open boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_chat_group TO authenticated;
GRANT ALL ON public.staff_chat_group TO service_role;
ALTER TABLE public.staff_chat_group ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_group_staff_read ON public.staff_chat_group FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

-- Bootstrap only after proving there is exactly one existing admin. Fail, never choose the first/newest.
DO $$ DECLARE owner uuid; BEGIN
  IF (SELECT count(DISTINCT user_id) FROM public.user_roles WHERE role::text='admin') <> 1 THEN
    RAISE EXCEPTION 'Group owner must be explicitly reviewed: exactly one current admin required';
  END IF;
  SELECT user_id INTO owner FROM public.user_roles WHERE role::text='admin';
  INSERT INTO public.staff_chat_group(id,owner_id) VALUES(true,owner);
END $$;

CREATE TABLE public.staff_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL, sender_name text NOT NULL,
  body text NOT NULL DEFAULT '', mandatory boolean NOT NULL DEFAULT false,
  poll jsonb, mentions uuid[] NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz, deleted_at timestamptz
);
GRANT SELECT ON public.staff_chat_messages TO authenticated;
GRANT ALL ON public.staff_chat_messages TO service_role;
ALTER TABLE public.staff_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_messages_staff_read ON public.staff_chat_messages FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE INDEX chat_messages_cursor ON public.staff_chat_messages(created_at DESC,id DESC);

CREATE TABLE public.staff_chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploader_id uuid NOT NULL, message_id uuid REFERENCES public.staff_chat_messages(id),
  path text NOT NULL UNIQUE, name text NOT NULL, mime text NOT NULL, size integer NOT NULL,
  ready boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_chat_attachments TO authenticated;
GRANT ALL ON public.staff_chat_attachments TO service_role;
ALTER TABLE public.staff_chat_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_attachment_metadata_read ON public.staff_chat_attachments FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()) AND (uploader_id=auth.uid() OR message_id IS NOT NULL));
CREATE INDEX chat_attachments_message ON public.staff_chat_attachments(message_id);

CREATE TABLE public.staff_chat_receipts (
  message_id uuid NOT NULL REFERENCES public.staff_chat_messages(id), user_id uuid NOT NULL,
  read_at timestamptz, PRIMARY KEY(message_id,user_id)
);
GRANT SELECT ON public.staff_chat_receipts TO authenticated;
GRANT ALL ON public.staff_chat_receipts TO service_role;
ALTER TABLE public.staff_chat_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_receipts_read ON public.staff_chat_receipts FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR private.is_admin(auth.uid()));
CREATE INDEX chat_receipts_pending ON public.staff_chat_receipts(user_id,message_id) WHERE read_at IS NULL;

CREATE TABLE public.staff_chat_notifications (
  message_id uuid NOT NULL REFERENCES public.staff_chat_messages(id), user_id uuid NOT NULL,
  seen_at timestamptz, PRIMARY KEY(message_id,user_id)
);
GRANT SELECT ON public.staff_chat_notifications TO authenticated;
GRANT ALL ON public.staff_chat_notifications TO service_role;
ALTER TABLE public.staff_chat_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_mentions_own_read ON public.staff_chat_notifications FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.staff_chat_hidden (
  message_id uuid NOT NULL REFERENCES public.staff_chat_messages(id), user_id uuid NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,user_id)
);
GRANT SELECT ON public.staff_chat_hidden TO authenticated;
GRANT ALL ON public.staff_chat_hidden TO service_role;
ALTER TABLE public.staff_chat_hidden ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_hidden_own_read ON public.staff_chat_hidden FOR SELECT TO authenticated USING (user_id=auth.uid());

CREATE TABLE public.staff_chat_votes (
  message_id uuid NOT NULL REFERENCES public.staff_chat_messages(id), user_id uuid NOT NULL,
  choices integer[] NOT NULL, voted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(message_id,user_id)
);
GRANT SELECT ON public.staff_chat_votes TO authenticated;
GRANT ALL ON public.staff_chat_votes TO service_role;
ALTER TABLE public.staff_chat_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_votes_staff_read ON public.staff_chat_votes FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));

CREATE TABLE public.staff_chat_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), message_id uuid REFERENCES public.staff_chat_messages(id),
  actor_id uuid NOT NULL, action text NOT NULL, previous jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.staff_chat_audit TO authenticated;
GRANT ALL ON public.staff_chat_audit TO service_role;
ALTER TABLE public.staff_chat_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_audit_owner_read ON public.staff_chat_audit FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) AND EXISTS(SELECT 1 FROM public.staff_chat_group WHERE owner_id=auth.uid()));

CREATE FUNCTION public.staff_chat_blocked(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public AS $$
  SELECT private.has_role(p_user,'employee'::public.app_role) AND NOT private.is_admin(p_user)
    AND EXISTS(SELECT 1 FROM public.staff_chat_receipts r JOIN public.staff_chat_messages m ON m.id=r.message_id
      WHERE r.user_id=p_user AND r.read_at IS NULL AND m.deleted_at IS NULL AND m.mandatory)
$$;
REVOKE ALL ON FUNCTION public.staff_chat_blocked(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_chat_blocked(uuid) TO service_role;

CREATE FUNCTION public.staff_chat_mutate(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); grp public.staff_chat_group; msg public.staff_chat_messages;
  mid uuid; ids uuid[]; options jsonb; choice_ids integer[]; admin boolean; owner boolean; display_name text;
BEGIN
  IF uid IS NULL OR NOT private.is_staff(uid) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  admin:=private.is_admin(uid);
  SELECT * INTO grp FROM public.staff_chat_group WHERE id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الجروب غير مهيأ'; END IF;
  owner:=admin AND grp.owner_id=uid;
  IF p_action='state' THEN
    IF NOT owner OR jsonb_typeof(p_data->'open') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'للمالك الرئيسي فقط'; END IF;
    INSERT INTO public.staff_chat_audit(actor_id,action,previous) VALUES(uid,'group_state',to_jsonb(grp));
    UPDATE public.staff_chat_group SET is_open=(p_data->>'open')::boolean WHERE id;
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF p_action IN ('send','reserve') THEN
    IF NOT grp.is_open AND NOT admin THEN RAISE EXCEPTION 'الجروب مغلق للإرسال'; END IF;
    IF public.staff_chat_blocked(uid) THEN RAISE EXCEPTION 'أكد قراءة الرسائل الإجبارية أولًا'; END IF;
  END IF;
  IF p_action='reserve' THEN
    IF jsonb_typeof(p_data->'size') IS DISTINCT FROM 'number' OR jsonb_typeof(p_data->'name') IS DISTINCT FROM 'string'
      OR jsonb_typeof(p_data->'mime') IS DISTINCT FROM 'string'
      OR (p_data->>'size')::integer NOT BETWEEN 1 AND 26214400 OR length(p_data->>'name') NOT BETWEEN 1 AND 240
      OR (p_data->>'mime') NOT IN ('image/jpeg','image/png','image/gif','image/webp','video/mp4','video/webm','video/quicktime',
      'audio/webm','audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/mp4','audio/x-m4a','application/pdf','text/plain','text/csv',
      'application/zip','application/x-zip-compressed','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')
      THEN RAISE EXCEPTION 'ملف غير صالح'; END IF;
    mid:=gen_random_uuid();
    INSERT INTO public.staff_chat_attachments(id,uploader_id,path,name,mime,size)
      VALUES(mid,uid,'staff-chat/'||uid::text||'/'||mid::text,p_data->>'name',p_data->>'mime',(p_data->>'size')::integer);
    RETURN jsonb_build_object('id',mid,'path','staff-chat/'||uid::text||'/'||mid::text);
  END IF;
  IF p_action='send' THEN
    IF length(coalesce(p_data->>'body',''))>10000 THEN RAISE EXCEPTION 'الرسالة طويلة'; END IF;
    IF coalesce((p_data->>'mandatory')::boolean,false) AND NOT admin THEN RAISE EXCEPTION 'لأدمن فقط'; END IF;
    IF coalesce((p_data->>'everyone')::boolean,false) AND NOT admin THEN RAISE EXCEPTION 'المنشن للجميع للأدمن فقط'; END IF;
    IF coalesce(p_data->>'body','') ~* '(^|\s)@everyone(\s|$)' AND NOT admin THEN RAISE EXCEPTION 'المنشن للجميع للأدمن فقط'; END IF;
    SELECT coalesce(array_agg(DISTINCT value::uuid),'{}') INTO ids FROM jsonb_array_elements_text(coalesce(p_data->'mentions','[]'));
    IF cardinality(ids)>100 OR EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT private.has_role(x,'employee'::public.app_role)) THEN
      RAISE EXCEPTION 'موظف المنشن غير صالح'; END IF;
    IF coalesce((p_data->>'everyone')::boolean,false) THEN
      SELECT coalesce(array_agg(DISTINCT user_id),'{}') INTO ids FROM public.user_roles WHERE role::text='employee';
    END IF;
    options:=p_data->'poll';
    IF options IS NOT NULL AND options<>'null'::jsonb THEN
      IF jsonb_typeof(options)<>'object' OR length(trim(coalesce(options->>'question',''))) NOT BETWEEN 1 AND 500
        OR jsonb_typeof(options->'options') IS DISTINCT FROM 'array' OR jsonb_array_length(options->'options') NOT BETWEEN 2 AND 20
        OR jsonb_typeof(options->'multiple') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'استطلاع غير صالح'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements(options->'options') x WHERE jsonb_typeof(x)<>'string' OR length(trim(x#>>'{}')) NOT BETWEEN 1 AND 200)
        OR (SELECT count(DISTINCT lower(trim(value))) FROM jsonb_array_elements_text(options->'options'))<>jsonb_array_length(options->'options')
        THEN RAISE EXCEPTION 'اختيارات الاستطلاع غير صالحة'; END IF;
    ELSE options:=NULL; END IF;
    IF jsonb_array_length(coalesce(p_data->'attachments','[]'))>10 THEN RAISE EXCEPTION 'الحد الأقصى 10 مرفقات'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(p_data->'attachments','[]')) x
      WHERE NOT EXISTS(SELECT 1 FROM public.staff_chat_attachments a WHERE a.id=x::uuid AND a.uploader_id=uid AND a.ready AND a.message_id IS NULL))
      THEN RAISE EXCEPTION 'مرفق غير جاهز أو لا يخصك'; END IF;
    IF trim(coalesce(p_data->>'body',''))='' AND options IS NULL AND jsonb_array_length(coalesce(p_data->'attachments','[]'))=0
      THEN RAISE EXCEPTION 'الرسالة فارغة'; END IF;
    SELECT coalesce(nullif(full_name,''),'عضو MG Pro') INTO display_name FROM public.profiles WHERE id=uid;
    INSERT INTO public.staff_chat_messages(sender_id,sender_name,body,mandatory,poll,mentions)
      VALUES(uid,coalesce(display_name,'عضو MG Pro'),coalesce(p_data->>'body',''),coalesce((p_data->>'mandatory')::boolean,false),options,ids) RETURNING id INTO mid;
    UPDATE public.staff_chat_attachments SET message_id=mid WHERE id IN
      (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_data->'attachments','[]')));
    INSERT INTO public.staff_chat_notifications(message_id,user_id) SELECT mid,x FROM unnest(ids) x WHERE x<>uid ON CONFLICT DO NOTHING;
    IF coalesce((p_data->>'mandatory')::boolean,false) THEN
      INSERT INTO public.staff_chat_receipts(message_id,user_id)
        SELECT mid,user_id FROM public.user_roles WHERE role::text='employee' AND user_id<>uid ON CONFLICT DO NOTHING;
    END IF;
    RETURN jsonb_build_object('ok',true,'id',mid);
  END IF;
  mid:=(p_data->>'id')::uuid;
  SELECT * INTO msg FROM public.staff_chat_messages WHERE id=mid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الرسالة غير موجودة'; END IF;
  IF p_action='ack' THEN
    IF msg.deleted_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true); END IF;
    UPDATE public.staff_chat_receipts SET read_at=clock_timestamp() WHERE message_id=mid AND user_id=uid AND read_at IS NULL;
    UPDATE public.staff_chat_notifications SET seen_at=coalesce(seen_at,clock_timestamp()) WHERE message_id=mid AND user_id=uid;
  ELSIF p_action='seen' THEN
    UPDATE public.staff_chat_notifications SET seen_at=coalesce(seen_at,clock_timestamp()) WHERE message_id=mid AND user_id=uid;
  ELSIF p_action='edit' THEN
    IF msg.deleted_at IS NOT NULL OR msg.sender_id<>uid OR clock_timestamp()>msg.created_at+interval '1 hour'
      THEN RAISE EXCEPTION 'التعديل لصاحب الرسالة خلال ساعة فقط'; END IF;
    IF public.staff_chat_blocked(uid) THEN RAISE EXCEPTION 'أكد القراءة أولًا'; END IF;
    IF length(trim(coalesce(p_data->>'body',''))) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'نص غير صالح'; END IF;
    IF coalesce(p_data->>'body','') ~* '(^|\s)@everyone(\s|$)' AND NOT admin THEN RAISE EXCEPTION 'للأدمن فقط'; END IF;
    INSERT INTO public.staff_chat_audit(message_id,actor_id,action,previous) VALUES(mid,uid,'edit',to_jsonb(msg));
    UPDATE public.staff_chat_messages SET body=p_data->>'body',edited_at=clock_timestamp() WHERE id=mid;
  ELSIF p_action IN ('hide','delete') THEN
    IF NOT owner THEN RAISE EXCEPTION 'الحذف للمالك الرئيسي فقط'; END IF;
    INSERT INTO public.staff_chat_audit(message_id,actor_id,action,previous) VALUES(mid,uid,p_action,to_jsonb(msg));
    IF p_action='hide' THEN INSERT INTO public.staff_chat_hidden(message_id,user_id) VALUES(mid,uid) ON CONFLICT DO NOTHING;
    ELSE UPDATE public.staff_chat_messages SET deleted_at=coalesce(deleted_at,clock_timestamp()) WHERE id=mid; END IF;
  ELSIF p_action='vote' THEN
    IF msg.deleted_at IS NOT NULL OR msg.poll IS NULL OR public.staff_chat_blocked(uid) THEN RAISE EXCEPTION 'التصويت غير متاح'; END IF;
    SELECT array_agg(DISTINCT value::integer ORDER BY value::integer) INTO choice_ids FROM jsonb_array_elements_text(p_data->'choices');
    IF cardinality(choice_ids) IS NULL OR cardinality(choice_ids)<1 OR (NOT (msg.poll->>'multiple')::boolean AND cardinality(choice_ids)<>1)
      OR EXISTS(SELECT 1 FROM unnest(choice_ids) x WHERE x<0 OR x>=jsonb_array_length(msg.poll->'options')) THEN RAISE EXCEPTION 'اختيارات غير صالحة'; END IF;
    INSERT INTO public.staff_chat_votes(message_id,user_id,choices) VALUES(mid,uid,choice_ids);
  ELSE RAISE EXCEPTION 'إجراء غير صالح'; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_mutate(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_mutate(text,jsonb) TO authenticated;

-- Only the verified server file upload may mark an attachment ready, after checking actual bytes and storage result.
CREATE FUNCTION public.staff_chat_upload_ready(p_id uuid,p_user uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.staff_chat_attachments SET ready=true WHERE id=p_id AND uploader_id=p_user AND message_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'attachment missing'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_upload_ready(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.staff_chat_upload_ready(uuid,uuid) TO service_role;

-- Read pending receipts durably; this polling read performs no writes or background-job changes.
CREATE FUNCTION public.staff_chat_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); grp public.staff_chat_group; employee boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT private.is_staff(uid) THEN RETURN jsonb_build_object('enabled',false); END IF;
  SELECT * INTO grp FROM public.staff_chat_group WHERE id;
  employee:=NOT private.is_admin(uid);
  RETURN jsonb_build_object('enabled',true,'userId',uid,'role',CASE WHEN employee THEN 'employee' ELSE 'admin' END,
    'owner',NOT employee AND grp.owner_id=uid,'open',grp.is_open,
    'members',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT DISTINCT r.user_id AS id,coalesce(nullif(p.full_name,''),'عضو MG Pro') AS name,r.role::text AS role
      FROM public.user_roles r LEFT JOIN public.profiles p ON p.id=r.user_id WHERE r.role::text IN ('admin','employee')) x),
    'pending',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.created_at,m.id),'[]') FROM public.staff_chat_messages m
      JOIN public.staff_chat_receipts r ON r.message_id=m.id WHERE r.user_id=uid AND r.read_at IS NULL AND m.deleted_at IS NULL AND m.mandatory),
    'notifications',(SELECT coalesce(jsonb_agg(jsonb_build_object('message_id',m.id,'body',left(m.body,160))),'[]')
      FROM public.staff_chat_notifications n JOIN public.staff_chat_messages m ON m.id=n.message_id
      WHERE n.user_id=uid AND n.seen_at IS NULL AND m.deleted_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_status() TO authenticated;

-- Never expose historical body versions to normal readers; deleted rows contain only tombstones in read DTOs.
-- Application reads via authenticated RPC projection, not the raw message table.
REVOKE SELECT ON public.staff_chat_messages FROM authenticated;
CREATE FUNCTION public.staff_chat_read(p_before timestamptz DEFAULT NULL,p_id uuid DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR NOT private.is_staff(uid) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') INTO result FROM (
    SELECT m.id,m.sender_id,m.sender_name,CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,m.mandatory,m.created_at,m.edited_at,m.deleted_at,
      CASE WHEN m.deleted_at IS NULL THEN m.poll END AS poll,CASE WHEN m.deleted_at IS NULL THEN m.mentions ELSE '{}'::uuid[] END AS mentions,
      CASE WHEN m.deleted_at IS NULL THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'mime',a.mime,'size',a.size)),'[]') FROM public.staff_chat_attachments a WHERE a.message_id=m.id AND a.ready) ELSE '[]'::jsonb END AS attachments,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',v.user_id,'name',coalesce(p.full_name,'عضو MG Pro'),'choices',v.choices,'voted_at',v.voted_at)),'[]')
        FROM public.staff_chat_votes v LEFT JOIN public.profiles p ON p.id=v.user_id WHERE v.message_id=m.id) AS votes
    FROM public.staff_chat_messages m WHERE (p_before IS NULL OR m.created_at<p_before OR (m.created_at=p_before AND p_before_id IS NOT NULL AND m.id<p_before_id)) AND (p_id IS NULL OR m.id=p_id)
      AND NOT EXISTS(SELECT 1 FROM public.staff_chat_hidden h WHERE h.message_id=m.id AND h.user_id=uid)
    ORDER BY m.created_at DESC,m.id DESC LIMIT 50
  ) x;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_read(timestamptz,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_read(timestamptz,uuid,uuid) TO authenticated;

-- A small staff-readable change signal supports Realtime without granting raw deleted content access.
CREATE TABLE public.staff_chat_events (id boolean PRIMARY KEY DEFAULT true CHECK(id),version bigint NOT NULL DEFAULT 0);
GRANT SELECT ON public.staff_chat_events TO authenticated;
GRANT ALL ON public.staff_chat_events TO service_role;
ALTER TABLE public.staff_chat_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_events_staff_read ON public.staff_chat_events FOR SELECT TO authenticated USING(private.is_staff(auth.uid()));
INSERT INTO public.staff_chat_events VALUES(true,0);
CREATE FUNCTION public.staff_chat_signal() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
  UPDATE public.staff_chat_events SET version=version+1 WHERE id; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.staff_chat_signal() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER chat_message_changed AFTER INSERT OR UPDATE ON public.staff_chat_messages FOR EACH STATEMENT EXECUTE FUNCTION public.staff_chat_signal();
CREATE TRIGGER chat_group_changed AFTER UPDATE ON public.staff_chat_group FOR EACH STATEMENT EXECUTE FUNCTION public.staff_chat_signal();
CREATE TRIGGER chat_receipt_changed AFTER INSERT OR UPDATE ON public.staff_chat_receipts FOR EACH ROW EXECUTE FUNCTION public.staff_chat_signal();
CREATE TRIGGER chat_vote_changed AFTER INSERT ON public.staff_chat_votes FOR EACH STATEMENT EXECUTE FUNCTION public.staff_chat_signal();
CREATE TRIGGER chat_hide_changed AFTER INSERT ON public.staff_chat_hidden FOR EACH STATEMENT EXECUTE FUNCTION public.staff_chat_signal();

-- Guard direct browser Data API reads too, not just the site server functions.
-- Identity, group, and receipt reads remain available; service-role processing/assignment is unchanged.
CREATE FUNCTION public.staff_chat_can_read_work() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT NOT public.staff_chat_blocked(auth.uid())
$$;
REVOKE ALL ON FUNCTION public.staff_chat_can_read_work() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.staff_chat_can_read_work() TO authenticated;
DO $$ DECLARE target text; BEGIN
  FOREACH target IN ARRAY ARRAY['orders','order_items','work_shifts','work_txn_assignments','work_txn_entries','work_manual_txns',
    'work_manual_card_txns','work_transfer_notes','work_p2p_shift_links','work_p2p_hidden_shifts','bybit_ledger','bybit_card_txns',
    'bybit_accounts','bybit_cards','bybit_account_info','card_transactions','mail_messages','mail_accounts','mail_drafts',
    'mail_attachments','mail_labels','mail_notifications','courses','course_lessons','course_access','course_progress','remote_access'] LOOP
    IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=target AND c.relrowsecurity) THEN
      EXECUTE format('CREATE POLICY chat_mandatory_read_guard ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.staff_chat_can_read_work())',target);
    END IF;
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_chat_events;
  END IF;
END $$;
COMMIT;