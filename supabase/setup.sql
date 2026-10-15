-- 타임보드 서버 설정 (한 번만)
-- Supabase 대시보드 → SQL Editor에서 이 파일 내용을 그대로 실행한다. 여러 번 실행해도 안전하다.

create table if not exists public.staff (
  id bigint generated always as identity primary key,
  name text not null,
  dot_color text,                    -- 컬럼 헤더 점 색상(hex). null이면 점 없음
  sort_order int not null default 0
);

create table if not exists public.reservation (
  id bigint generated always as identity primary key,
  staff_id bigint not null references public.staff (id) on delete cascade,
  date date not null,
  start_min int not null check (start_min between 0 and 1439),  -- 0:00 기준 분
  duration_min int not null check (duration_min > 0),
  title text not null default '',
  subtitle text not null default ''
);
create index if not exists reservation_date_idx on public.reservation (date);

-- 일단 로그인 없는 단일 매장 보드라 anon 키로 읽기/쓰기를 연다.
-- 로그인을 붙이는 시점에 아래 두 정책을 authenticated 전용으로 교체할 것.
alter table public.staff enable row level security;
alter table public.reservation enable row level security;
drop policy if exists "open staff" on public.staff;
create policy "open staff" on public.staff
  for all to anon, authenticated using (true) with check (true);
drop policy if exists "open reservation" on public.reservation;
create policy "open reservation" on public.reservation
  for all to anon, authenticated using (true) with check (true);

-- 메뉴: 예약 등록 시 선택, 선택한 시간이 소요시간이 된다
create table if not exists public.menu (
  id bigint generated always as identity primary key,
  name text not null,
  durations int[] not null default '{60,90,120}',  -- 선택 가능한 시간(분)
  sort_order int not null default 0
);
alter table public.menu enable row level security;
drop policy if exists "open menu" on public.menu;
create policy "open menu" on public.menu
  for all to anon, authenticated using (true) with check (true);

insert into public.menu (name, durations, sort_order)
select * from (values
  ('타이', array[60, 90, 120], 0),
  ('아로마', array[60, 90, 120], 1)
) v(name, durations, sort_order)
where not exists (select 1 from public.menu);

-- 메뉴 가격(durations와 같은 순서) / 예약 금액(예약 시점 스냅샷)
alter table public.menu add column if not exists prices int[] not null default '{}';
alter table public.reservation add column if not exists price int not null default 0;
alter table public.reservation add column if not exists done boolean not null default false;  -- 시술 완료 표시

-- 가게 설정 (단일 행): 업무시간
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  open_min int not null default 360,    -- 오전 6:00
  close_min int not null default 1320   -- 오후 10:00
);
alter table public.settings enable row level security;
drop policy if exists "open settings" on public.settings;
create policy "open settings" on public.settings
  for all to anon, authenticated using (true) with check (true);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- 담당자 상세: 재직 기간 / 정산 비율 / 근무 요일·시간 / 연락처 / 메모
alter table public.staff add column if not exists joined_on date;                 -- null = 제한 없음
alter table public.staff add column if not exists left_on date;                   -- 퇴사일(그날까지 근무). 삭제 대신 사용
alter table public.staff add column if not exists commission_pct int not null default 0
  check (commission_pct between 0 and 100);                                        -- 결제 탭 정산액 = 매출 × 비율
alter table public.staff add column if not exists work_days int[] not null default '{0,1,2,3,4,5,6}'; -- 0=일 … 6=토
alter table public.staff add column if not exists work_open_min int;              -- null = 매장 운영시간과 같음
alter table public.staff add column if not exists work_close_min int;
alter table public.staff add column if not exists phone text not null default '';
alter table public.staff add column if not exists memo text not null default '';

-- 데모 시드 (비어 있을 때만)
insert into public.staff (name, dot_color, sort_order)
select * from (values
  ('사장님', '#4a90d9', 0),
  ('ㅇ', '#4a90d9', 1),
  ('ㄱ', '#4a90d9', 2),
  ('ㄷ', '#4a90d9', 3),
  ('미지정', null, 4)
) v(name, dot_color, sort_order)
where not exists (select 1 from public.staff);

insert into public.reservation (staff_id, date, start_min, duration_min, title, subtitle)
select s.id, current_date, v.start_min, v.duration_min, '고객 등록 필요', v.subtitle
from (values (0, 720, 60, '타이60분'), (2, 870, 90, '타이90'), (4, 780, 60, '타이90'))
  v(ord, start_min, duration_min, subtitle)
join public.staff s on s.sort_order = v.ord
where not exists (select 1 from public.reservation);
