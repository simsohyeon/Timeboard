-- 예전 데이터(매장 칸이 빈 것)를 내 매장으로 옮기기
-- 매장이 하나뿐이면 그 매장으로, 여러 개면 아래 이메일을 내 계정으로 바꿔서 실행
do $$
declare
  my_email text := '';   -- 매장이 여러 개일 때만 '내이메일@example.com' 처럼 채우기
  sid uuid; n int; who text;
begin
  select count(*), string_agg(u.email, ', ') into n, who
    from public.shop_member m join auth.users u on u.id = m.user_id;
  if my_email <> '' then
    select m.shop_id into sid from public.shop_member m join auth.users u on u.id = m.user_id where u.email = my_email;
    if sid is null then raise exception '% 로 만든 매장이 없어요 (지금 매장: %)', my_email, coalesce(who, '없음'); end if;
  elsif n = 1 then
    select shop_id into sid from public.shop_member;
  elsif n = 0 then
    raise exception '아직 만든 매장이 없어요 — 사이트에서 회원가입하고 매장을 먼저 만드세요';
  else
    raise exception '매장이 %개예요 (%). 위 my_email 에 내 이메일을 넣고 다시 실행하세요', n, who;
  end if;

  -- 가입 때 자동으로 생긴 것만 지움 (예약·휴가 없는 '사장님', 가격 안 넣은 기본 메뉴, 기본 운영시간)
  if exists (select 1 from public.staff where shop_id is null) then
    delete from public.staff s where s.shop_id = sid and s.name = '사장님'
      and not exists (select 1 from public.reservation r where r.staff_id = s.id)
      and not exists (select 1 from public.staff_leave l where l.staff_id = s.id);
  end if;
  if exists (select 1 from public.menu where shop_id is null) then
    delete from public.menu where shop_id = sid and name in ('타이', '아로마') and coalesce(array_length(prices, 1), 0) = 0;
  end if;
  if exists (select 1 from public.settings where shop_id is null) then
    delete from public.settings where shop_id = sid;
    -- 예전 운영시간 줄이 여러 개면 하나만 남김
    delete from public.settings where shop_id is null and id <> (select min(id) from public.settings where shop_id is null);
  end if;
  update public.staff set shop_id = sid where shop_id is null;
  update public.reservation set shop_id = sid where shop_id is null;
  update public.menu set shop_id = sid where shop_id is null;
  update public.settings set shop_id = sid where shop_id is null;
  update public.staff_leave set shop_id = sid where shop_id is null;
  raise notice '예전 데이터를 % 매장으로 옮겼어요', (select name from public.shop where id = sid);
end $$;
