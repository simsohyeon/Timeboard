-- 타임보드 보안 보강 (accounts.sql 과 '기존 데이터 가져오기' 다음에 실행)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 1) 예약·휴가가 다른 매장 직원을 가리킬 수 없게 (직원 번호 + 매장을 같이 확인)
-- 2) 예전 로그인 작업 잔재(store_id 칸 기본값, my_store_id, RLS 꺼진 예전 표) 정리
-- 3) 함수: search_path 비움(이름은 전부 스키마까지), 매장 이름 길이 제한
-- 4) 'PIN을 잊었어요': 방금 비밀번호로 로그인했으면 PIN 새로 정하기 (reset_pin)

-- ───── 1) 매장 칸 필수 + 직원 번호는 같은 매장 것만 ─────
do $$
declare t text; n bigint; leftover text := ''; c record;
begin
  foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
    execute format('select count(*) from public.%I where shop_id is null', t) into n;
    if n > 0 then leftover := leftover || format(' %s(%s건)', t, n); end if;
  end loop;
  if leftover <> '' then
    raise exception '매장이 정해지지 않은 예전 데이터가 있어요:% — supabase/claim.sql(기존 데이터 가져오기)을 먼저 실행하세요 (안 쓸 데이터면 지워도 돼요)', leftover;
  end if;

  foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
    execute format('alter table public.%I alter column shop_id set not null', t);
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'staff_id_shop_key') then
    alter table public.staff add constraint staff_id_shop_key unique (id, shop_id);
  end if;
  -- staff_id 하나만 보는 예전 FK(이름이 달라도)를 지우고 (직원, 매장) FK 로
  for c in select conrelid::regclass::text as tbl, conname from pg_constraint
           where contype = 'f' and conrelid in ('public.reservation'::regclass, 'public.staff_leave'::regclass)
             and pg_get_constraintdef(oid) ilike 'FOREIGN KEY (staff_id) %' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'reservation_staff_shop_fkey') then
    alter table public.reservation add constraint reservation_staff_shop_fkey
      foreign key (staff_id, shop_id) references public.staff (id, shop_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_leave_staff_shop_fkey') then
    alter table public.staff_leave add constraint staff_leave_staff_shop_fkey
      foreign key (staff_id, shop_id) references public.staff (id, shop_id) on delete cascade;
  end if;
end $$;

-- 정책: 내 매장 확인을 줄마다가 아니라 한 번만 계산 ((select ...) 로 감싸기)
do $$
declare t text;
begin
  foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
    execute format('drop policy if exists %I on public.%I', 'my shop ' || t, t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (shop_id = (select public.my_shop_id())) with check (shop_id = (select public.my_shop_id()))', 'my shop ' || t, t);
  end loop;
end $$;

-- ───── 2) 예전 로그인 작업 잔재 정리 ─────
do $$
declare t record; c record;
begin
  -- store_id 칸: 기본값(예전 매장 id 를 계속 박던 것)과 예전 매장 표로 가는 FK 제거
  for c in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'store_id'
             and table_name in ('staff', 'reservation', 'menu', 'settings', 'staff_leave') loop
    execute format('alter table public.%I alter column store_id drop default', c.table_name);
    execute format('alter table public.%I alter column store_id drop not null', c.table_name);
  end loop;
  for c in select conrelid::regclass::text as tbl, conname from pg_constraint
           where contype = 'f' and connamespace = 'public'::regnamespace
             and conrelid::regclass::text in ('staff', 'reservation', 'menu', 'settings', 'staff_leave', 'public.staff', 'public.reservation', 'public.menu', 'public.settings', 'public.staff_leave')
             and pg_get_constraintdef(oid) ilike '%(store_id)%' loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;

  -- 앱이 쓰지 않는 public 표 중 RLS 가 꺼진 것(예전 store·member 등)은 잠근다 — anon 키로 읽기·쓰기 되던 구멍
  for t in select pc.relname from pg_class pc
           where pc.relnamespace = 'public'::regnamespace and pc.relkind = 'r' and not pc.relrowsecurity
             and pc.relname not in ('staff', 'reservation', 'menu', 'settings', 'staff_leave', 'shop', 'shop_member') loop
    execute format('alter table public.%I enable row level security', t.relname);
    execute format('revoke all on public.%I from anon, authenticated', t.relname);
    raise notice '예전 표 잠금: %', t.relname;
  end loop;

  -- my_store_id(): 이제 안 씀. 아직 무언가 쓰고 있으면(예전 표의 정책 등) 지우지 않고 anon 실행만 막는다
  if to_regprocedure('public.my_store_id()') is not null then
    begin
      drop function public.my_store_id();
      raise notice 'my_store_id() 삭제';
    exception when dependent_objects_still_exist then
      revoke execute on function public.my_store_id() from public, anon;
      raise notice 'my_store_id() 는 아직 쓰는 곳이 있어 남기고 anon 실행만 막음';
    end;
  end if;
end $$;

-- 로그인 안 한 상태(anon)에는 번호표(시퀀스)도 필요 없다
revoke usage, select on all sequences in schema public from anon;

-- ───── 3) 함수 다시 만들기: search_path 비움 + 스키마까지 쓴 이름 ─────
create or replace function public.my_shop_id() returns uuid
  language sql stable security definer set search_path = '' as
$$ select shop_id from public.shop_member where user_id = auth.uid() $$;

create or replace function public.create_shop(p_name text, p_pin text) returns uuid
  language plpgsql security definer set search_path = '' as
$$
declare sid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from public.shop_member where user_id = auth.uid()) then raise exception '이미 매장이 있어요'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'PIN은 숫자 4자리예요'; end if;
  insert into public.shop (name, pin_hash)
    values (left(coalesce(nullif(trim(p_name), ''), '내 매장'), 50), extensions.crypt(p_pin, extensions.gen_salt('bf')))
    returning id into sid;
  insert into public.shop_member (user_id, shop_id) values (auth.uid(), sid);
  insert into public.settings (shop_id, open_min, close_min) values (sid, 600, 1320);
  insert into public.menu (shop_id, name, durations, sort_order) values
    (sid, '타이', array[60, 90, 120], 0), (sid, '아로마', array[60, 90, 120], 1);
  insert into public.staff (shop_id, name, dot_color, sort_order) values (sid, '사장님', '#4a90d9', 0);
  return sid;
exception when unique_violation then
  raise exception '이미 매장이 있어요'; -- 두 번 눌러 동시에 만들어질 때
end $$;

create or replace function public.verify_pin(p_pin text) returns boolean
  language plpgsql security definer set search_path = '' as
$$
declare s public.shop; ok boolean; fails int;
begin
  select * into s from public.shop where id = public.my_shop_id() for update;
  if s.id is null then raise exception '로그인이 필요해요'; end if;
  if s.pin_locked_until > now() then
    raise exception 'PIN을 여러 번 틀려서 잠겼어요. % 뒤에 다시 해 주세요 (PIN을 잊었으면 ''PIN을 잊었어요'')',
      ceil(extract(epoch from s.pin_locked_until - now()) / 60) || '분';
  end if;
  ok := s.pin_hash is not null and s.pin_hash = extensions.crypt(coalesce(p_pin, ''), s.pin_hash);
  -- 잠금이 풀렸으면 틀린 횟수도 새로 센다 (풀린 뒤 한 번 틀렸다고 바로 다시 잠기지 않게)
  fails := case when s.pin_locked_until is not null and s.pin_locked_until <= now() then 0 else s.pin_fails end;
  update public.shop set pin_fails = case when ok then 0 else fails + 1 end,
                         pin_locked_until = case when not ok and fails + 1 >= 5 then now() + interval '5 minutes' end
    where id = s.id;
  return ok;
end $$;

create or replace function public.set_pin(p_old text, p_new text) returns boolean
  language plpgsql security definer set search_path = '' as
$$
begin
  if coalesce(p_new, '') !~ '^[0-9]{4}$' then raise exception '새 PIN은 숫자 4자리예요'; end if;
  if not public.verify_pin(p_old) then return false; end if;
  update public.shop set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')) where id = public.my_shop_id();
  return true;
end $$;

create or replace function public.rename_shop(p_name text) returns void
  language sql security definer set search_path = '' as
$$ update public.shop set name = left(coalesce(nullif(trim(p_name), ''), name), 50) where id = public.my_shop_id() $$;

-- ───── 4) PIN을 잊었을 때: 10분 안에 비밀번호로 로그인한 경우에만 새 PIN ─────
-- (화면이 비밀번호를 다시 받아 로그인한 직후 부른다. 토큰의 amr 에 비밀번호 로그인 시각이 들어 있음)
create or replace function public.reset_pin(p_new text) returns void
  language plpgsql security definer set search_path = '' as
$$
begin
  if public.my_shop_id() is null then raise exception '로그인이 필요해요'; end if;
  if coalesce(p_new, '') !~ '^[0-9]{4}$' then raise exception '새 PIN은 숫자 4자리예요'; end if;
  if not exists (
    select 1 from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) a
    where a ->> 'method' = 'password' and (a ->> 'timestamp')::bigint >= extract(epoch from now()) - 600
  ) then
    raise exception '비밀번호를 다시 확인해 주세요';
  end if;
  update public.shop set pin_hash = extensions.crypt(p_new, extensions.gen_salt('bf')), pin_fails = 0, pin_locked_until = null
    where id = public.my_shop_id();
end $$;

revoke execute on function public.my_shop_id(), public.create_shop(text, text), public.verify_pin(text),
  public.set_pin(text, text), public.rename_shop(text), public.reset_pin(text) from public, anon;
grant execute on function public.my_shop_id(), public.create_shop(text, text), public.verify_pin(text),
  public.set_pin(text, text), public.rename_shop(text), public.reset_pin(text) to authenticated;

notify pgrst, 'reload schema';
