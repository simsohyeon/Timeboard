-- 타임보드 계정·매장 분리 + 사장님 PIN (setup.sql 다음에 한 번 실행)
-- Supabase 대시보드 → SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전하다.
--
-- 계정 1개 = 매장 1개. 로그인한 계정은 자기 매장(shop_id) 데이터만 읽고 쓴다.
-- 로그인 안 한 상태(anon)로는 아무것도 못 본다.
-- 기존 데이터(shop_id 없음)는 가입 뒤 맨 아래 '기존 데이터 가져오기'로 내 매장에 붙인다.

create extension if not exists pgcrypto with schema extensions;

-- ───── 매장 · 매장 사람 ─────
create table if not exists public.shop (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  pin_hash text,                          -- 사장님 PIN (bcrypt). 화면에서는 읽을 수 없음
  pin_fails int not null default 0,       -- 연속 틀린 횟수
  pin_locked_until timestamptz,           -- 5번 틀리면 5분 잠금
  created_at timestamptz not null default now()
);
create table if not exists public.shop_member (
  user_id uuid primary key references auth.users (id) on delete cascade,  -- 계정 하나는 매장 하나
  shop_id uuid not null references public.shop (id) on delete cascade,
  role text not null default 'owner'
);

-- 내 매장 id (로그인 안 했으면 null)
create or replace function public.my_shop_id() returns uuid
  language sql stable security definer set search_path = public as
$$ select shop_id from public.shop_member where user_id = auth.uid() $$;
revoke execute on function public.my_shop_id() from public, anon;
grant execute on function public.my_shop_id() to authenticated;

alter table public.shop enable row level security;
alter table public.shop_member enable row level security;
drop policy if exists "my shop" on public.shop;
create policy "my shop" on public.shop for select to authenticated using (id = public.my_shop_id());
drop policy if exists "my membership" on public.shop_member;
create policy "my membership" on public.shop_member for select to authenticated using (user_id = auth.uid());
-- 매장 표는 이름까지만 보이게 (PIN 해시·잠금 정보는 함수로만)
revoke all on public.shop from anon, authenticated;
grant select (id, name, created_at) on public.shop to authenticated;
revoke all on public.shop_member from anon, authenticated;
grant select on public.shop_member to authenticated;

-- ───── 앱 표마다 매장 칸 + 내 매장만 ─────
-- settings 는 매장마다 한 줄이 되도록 id 고정(=1)을 푼다
alter table public.settings drop constraint if exists settings_id_check;
create sequence if not exists public.settings_id_seq owned by public.settings.id;
select setval('public.settings_id_seq', greatest((select coalesce(max(id), 1) from public.settings), 1));
alter table public.settings alter column id set default nextval('public.settings_id_seq');

do $$
declare t text; p record;
begin
  foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
    execute format('alter table public.%I add column if not exists shop_id uuid references public.shop (id) on delete cascade', t);
    execute format('alter table public.%I alter column shop_id set default public.my_shop_id()', t);
    execute format('create index if not exists %I on public.%I (shop_id)', t || '_shop_idx', t);
    -- 예전 로그인 작업의 store_id 칸이 있으면 비워도 저장되게 (이제 안 씀)
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'store_id') then
      execute format('alter table public.%I alter column store_id drop not null', t);
    end if;
    -- 예전 정책(로그인 없이 열기, 예전 매장 정책) 전부 지우고 '내 매장만' 하나로
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (shop_id = public.my_shop_id()) with check (shop_id = public.my_shop_id())', 'my shop ' || t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
create unique index if not exists settings_shop_uniq on public.settings (shop_id);
grant usage, select on all sequences in schema public to authenticated;

-- ───── 함수 (화면에서 rpc 로 부름) ─────
-- 가입 직후 매장 만들기: 매장 + 내 계정 연결 + 기본 운영시간·메뉴·담당자
create or replace function public.create_shop(p_name text, p_pin text) returns uuid
  language plpgsql security definer set search_path = public, extensions as
$$
declare sid uuid;
begin
  if auth.uid() is null then raise exception '로그인이 필요해요'; end if;
  if exists (select 1 from shop_member where user_id = auth.uid()) then raise exception '이미 매장이 있어요'; end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then raise exception 'PIN은 숫자 4자리예요'; end if;
  insert into shop (name, pin_hash) values (coalesce(nullif(trim(p_name), ''), '내 매장'), crypt(p_pin, gen_salt('bf')))
    returning id into sid;
  insert into shop_member (user_id, shop_id) values (auth.uid(), sid);
  insert into settings (shop_id, open_min, close_min) values (sid, 600, 1320);
  insert into menu (shop_id, name, durations, sort_order) values
    (sid, '타이', array[60, 90, 120], 0), (sid, '아로마', array[60, 90, 120], 1);
  insert into staff (shop_id, name, dot_color, sort_order) values (sid, '사장님', '#4a90d9', 0);
  return sid;
end $$;

-- PIN 확인: 맞으면 true. 5번 연속 틀리면 5분 동안 확인 자체를 막는다
create or replace function public.verify_pin(p_pin text) returns boolean
  language plpgsql security definer set search_path = public, extensions as
$$
declare s shop; ok boolean;
begin
  select * into s from shop where id = my_shop_id() for update;
  if s.id is null then raise exception '로그인이 필요해요'; end if;
  if s.pin_locked_until > now() then
    raise exception 'PIN을 여러 번 틀려서 잠겼어요. % 뒤에 다시 해 주세요',
      ceil(extract(epoch from s.pin_locked_until - now()) / 60) || '분';
  end if;
  ok := s.pin_hash is not null and s.pin_hash = crypt(coalesce(p_pin, ''), s.pin_hash);
  update shop set pin_fails = case when ok then 0 else pin_fails + 1 end,
                  pin_locked_until = case when not ok and pin_fails + 1 >= 5 then now() + interval '5 minutes' end
    where id = s.id;
  return ok;
end $$;

-- PIN 바꾸기: 지금 PIN이 맞아야 바뀐다
create or replace function public.set_pin(p_old text, p_new text) returns boolean
  language plpgsql security definer set search_path = public, extensions as
$$
begin
  if coalesce(p_new, '') !~ '^[0-9]{4}$' then raise exception '새 PIN은 숫자 4자리예요'; end if;
  if not verify_pin(p_old) then return false; end if;
  update shop set pin_hash = crypt(p_new, gen_salt('bf')) where id = my_shop_id();
  return true;
end $$;

-- 매장 이름 바꾸기
create or replace function public.rename_shop(p_name text) returns void
  language sql security definer set search_path = public as
$$ update shop set name = coalesce(nullif(trim(p_name), ''), name) where id = my_shop_id() $$;

revoke execute on function public.create_shop(text, text), public.verify_pin(text), public.set_pin(text, text),
  public.rename_shop(text) from public, anon;
grant execute on function public.create_shop(text, text), public.verify_pin(text), public.set_pin(text, text),
  public.rename_shop(text) to authenticated;

notify pgrst, 'reload schema';


-- ───── 기존 데이터 가져오기 (가입하고 매장을 만든 뒤 한 번) ─────
-- 아래 주석을 풀고 이메일을 내 계정으로 바꿔 실행하면, 매장 칸이 비어 있는(예전) 데이터가 전부 내 매장으로 들어온다.
-- 가입할 때 자동으로 생긴 기본 메뉴·'사장님'·운영시간은 예전 것으로 바꾼다 (가입 뒤 직접 추가한 건 남김).
--
-- do $$
-- declare sid uuid := (select m.shop_id from public.shop_member m join auth.users u on u.id = m.user_id
--                      where u.email = '내이메일@example.com' and u.email_confirmed_at is not null);
-- begin
--   if sid is null then raise exception '그 이메일로 만든 매장이 없어요 (메일 인증 전이면 인증부터)'; end if;
--   -- 가입 때 자동으로 생긴 것만 지움 (예약 없는 '사장님', 가격 안 넣은 기본 메뉴). 직접 추가한 건 그대로
--   if exists (select 1 from public.staff where shop_id is null) then
--     delete from public.staff s where s.shop_id = sid and s.name = '사장님'
--       and not exists (select 1 from public.reservation r where r.staff_id = s.id)
--       and not exists (select 1 from public.staff_leave l where l.staff_id = s.id);
--   end if;
--   if exists (select 1 from public.menu where shop_id is null) then
--     delete from public.menu where shop_id = sid and name in ('타이', '아로마') and coalesce(array_length(prices, 1), 0) = 0;
--   end if;
--   if exists (select 1 from public.settings where shop_id is null) then
--     delete from public.settings where shop_id = sid;
--   end if;
--   update public.staff set shop_id = sid where shop_id is null;
--   update public.reservation set shop_id = sid where shop_id is null;
--   update public.menu set shop_id = sid where shop_id is null;
--   update public.settings set shop_id = sid where shop_id is null;
--   update public.staff_leave set shop_id = sid where shop_id is null;
-- end $$;
