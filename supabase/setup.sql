-- 타임보드 표 만들기 (처음 한 번, 그리고 칸이 늘어난 새 버전이 나왔을 때)
-- Supabase 대시보드 → SQL Editor에서 이 파일 내용을 그대로 실행한다. 여러 번 실행해도 안전하다.
-- 처음 설치 순서: setup.sql → accounts.sql → hardening.sql (README 참고)
-- 계정(accounts.sql)을 적용한 뒤 다시 실행해도 매장별 보안 규칙은 건드리지 않는다 (맨 아래 참고).

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
  start_min int not null check (start_min between 0 and 2879),  -- 영업일 0:00 기준 분 (1440 이상 = 자정 넘은 새벽)
  duration_min int not null check (duration_min > 0),
  title text not null default '',
  subtitle text not null default ''
);
create index if not exists reservation_date_idx on public.reservation (date);

-- 메뉴: 예약 등록 시 선택, 선택한 시간이 소요시간이 된다
create table if not exists public.menu (
  id bigint generated always as identity primary key,
  name text not null,
  durations int[] not null default '{60,90,120}',  -- 선택 가능한 시간(분)
  sort_order int not null default 0
);

-- 메뉴 가격(durations와 같은 순서) / 예약 금액(예약 시점 스냅샷)
alter table public.menu add column if not exists prices int[] not null default '{}';
alter table public.reservation add column if not exists price int not null default 0;
alter table public.reservation add column if not exists done boolean not null default false;  -- 시술 완료 표시
alter table public.reservation add column if not exists choice boolean not null default false; -- 초이스: 손님이 담당자를 직접 고름 (인센 추가)
alter table public.reservation alter column staff_id drop not null;  -- 담당자 미정 예약 (시간이 다가오면 그때 고름)

-- 가게 설정: 업무시간 (accounts.sql 이후에는 매장마다 한 줄)
create table if not exists public.settings (
  id int primary key default 1,
  open_min int not null default 360,    -- 오전 6:00
  close_min int not null default 1320   -- 오후 10:00
);

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

-- 담당자 휴가: 날짜 범위(그날들 종일) 또는 시간 지정(반차·외출, 범위 안 매일 그 시간)
create table if not exists public.staff_leave (
  id bigint generated always as identity primary key,
  staff_id bigint not null references public.staff (id) on delete cascade,
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  start_min int check (start_min between 0 and 2880),   -- null = 종일
  end_min int check (end_min between 0 and 2880),
  reason text not null default ''
);
create index if not exists staff_leave_dates_idx on public.staff_leave (start_date, end_date);

-- 자정 넘어 영업 (예: 새벽 3시 마감): 영업일 기준 분이 1440(24시)을 넘을 수 있게 제한을 넓힌다
-- 새벽 1시 예약 = 그 전날 영업일의 1500분. 이미 만든 표에도 적용되도록 제약을 다시 건다
alter table public.reservation drop constraint if exists reservation_start_min_check;
alter table public.reservation add constraint reservation_start_min_check check (start_min between 0 and 2879);
alter table public.staff_leave drop constraint if exists staff_leave_start_min_check;
alter table public.staff_leave add constraint staff_leave_start_min_check check (start_min between 0 and 2880);
alter table public.staff_leave drop constraint if exists staff_leave_end_min_check;
alter table public.staff_leave add constraint staff_leave_end_min_check check (end_min between 0 and 2880);

-- 보안 규칙: 표마다 RLS 를 켜 둔다.
-- 계정(accounts.sql)이 아직 없을 때만 '로그인 없이 열기' 규칙을 만든다 (계정 없던 예전 단일 매장 방식).
-- accounts.sql 이 적용된 뒤에는 '내 매장만' 규칙이 있으므로 아무것도 하지 않는다 — 다른 매장 데이터가 열리지 않게.
-- 예시 데이터는 넣지 않는다: 가입해서 매장을 만들면 기본 메뉴·담당자·운영시간이 그 매장에 생긴다.
do $$
declare t text;
begin
  foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
  if to_regclass('public.shop') is null then
    foreach t in array array['staff', 'reservation', 'menu', 'settings', 'staff_leave'] loop
      execute format('drop policy if exists %I on public.%I', 'open ' || t, t);
      execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', 'open ' || t, t);
    end loop;
  end if;
end $$;

notify pgrst, 'reload schema';
