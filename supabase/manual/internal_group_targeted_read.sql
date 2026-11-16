-- REVIEW ONLY: apply after the existing internal_group.sql installation and owner review/backup.
-- Do NOT rerun the initial group creation SQL. No existing message/receipt/role/work data is rewritten.
-- NULL mandatory_mentions identifies historical messages; their existing recipients stay unchanged.
-- New mandatory messages require explicit employee recipients, separate from ordinary @mentions/@everyone.
BEGIN;
ALTER TABLE public.staff_chat_messages ADD COLUMN IF NOT EXISTS mandatory_mentions uuid[];
CREATE OR REPLACE FUNCTION public.staff_chat_mutate(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); grp public.staff_chat_group; msg public.staff_chat_messages;
  mid uuid; ids uuid[]; mandatory_ids uuid[]; options jsonb; choice_ids integer[]; admin boolean; owner boolean; display_name text;
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
    IF jsonb_typeof(coalesce(p_data->'mandatoryMentions','[]')) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'منشن القراءة الإجبارية غير صالح'; END IF;
    SELECT coalesce(array_agg(DISTINCT value::uuid),'{}') INTO mandatory_ids
      FROM jsonb_array_elements_text(coalesce(p_data->'mandatoryMentions','[]'));
    IF cardinality(mandatory_ids)>100 OR EXISTS(SELECT 1 FROM unnest(mandatory_ids) x
      WHERE NOT private.has_role(x,'employee'::public.app_role) OR private.is_admin(x)) THEN
      RAISE EXCEPTION 'موظف القراءة الإجبارية غير صالح'; END IF;
    IF coalesce((p_data->>'mandatory')::boolean,false) THEN
      IF cardinality(mandatory_ids)=0 THEN RAISE EXCEPTION 'اختار موظفي القراءة الإجبارية'; END IF;
    ELSIF cardinality(mandatory_ids)>0 THEN RAISE EXCEPTION 'منشن القراءة الإجبارية يتطلب رسالة إجبارية'; END IF;
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
    INSERT INTO public.staff_chat_messages(sender_id,sender_name,body,mandatory,poll,mentions,mandatory_mentions)
      VALUES(uid,coalesce(display_name,'عضو MG Pro'),coalesce(p_data->>'body',''),coalesce((p_data->>'mandatory')::boolean,false),options,ids,mandatory_ids) RETURNING id INTO mid;
    UPDATE public.staff_chat_attachments SET message_id=mid WHERE id IN
      (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_data->'attachments','[]')));
    INSERT INTO public.staff_chat_notifications(message_id,user_id) SELECT mid,x FROM unnest(ids) x WHERE x<>uid ON CONFLICT DO NOTHING;
    IF coalesce((p_data->>'mandatory')::boolean,false) THEN
      INSERT INTO public.staff_chat_receipts(message_id,user_id)
        SELECT mid,x FROM unnest(mandatory_ids) x WHERE x<>uid ON CONFLICT DO NOTHING;
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

CREATE OR REPLACE FUNCTION public.staff_chat_status() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); grp public.staff_chat_group; employee boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  IF NOT private.is_staff(uid) THEN RETURN jsonb_build_object('enabled',false); END IF;
  SELECT * INTO grp FROM public.staff_chat_group WHERE id;
  employee:=NOT private.is_admin(uid);
  RETURN jsonb_build_object('enabled',true,'userId',uid,'role',CASE WHEN employee THEN 'employee' ELSE 'admin' END,
    'targetedMandatory',true,
    'incoming',(SELECT jsonb_build_object('id',m.id,'created_at',m.created_at) FROM public.staff_chat_messages m
      WHERE m.sender_id<>uid AND m.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM public.staff_chat_hidden h WHERE h.message_id=m.id AND h.user_id=uid)
      ORDER BY m.created_at DESC,m.id DESC LIMIT 1),
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

CREATE OR REPLACE FUNCTION public.staff_chat_read(p_before timestamptz DEFAULT NULL,p_id uuid DEFAULT NULL,p_before_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); result jsonb;
BEGIN
  IF uid IS NULL OR NOT private.is_staff(uid) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') INTO result FROM (
    SELECT m.id,m.sender_id,m.sender_name,CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,m.mandatory,CASE WHEN m.deleted_at IS NULL THEN m.mandatory_mentions ELSE '{}'::uuid[] END AS mandatory_mentions,m.created_at,m.edited_at,m.deleted_at,
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

COMMIT;
