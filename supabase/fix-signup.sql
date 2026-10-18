-- 회원가입 'Database error saving new user' 해결
-- 예전 로그인 작업이 남긴 '가입하면 자동 실행' 트리거(auth.users)를 지운다.
-- 타임보드는 가입할 때 자동으로 실행할 게 없다 (매장은 가입 뒤 '매장 만들기'에서 만듦).
-- 여러 번 실행해도 안전. 결과 창 NOTICE 에 지운 것이 나온다.
do $$
declare t record; n int := 0; fname text;
begin
  for t in
    select tg.tgname, p.oid::regprocedure as fn, pn.nspname as fn_schema
    from pg_trigger tg
    join pg_proc p on p.oid = tg.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
    where tg.tgrelid = 'auth.users'::regclass and not tg.tgisinternal
      and pn.nspname not in ('auth', 'extensions', 'realtime', 'storage', 'supabase_functions', 'graphql', 'pgsodium', 'vault')
  loop
    fname := t.fn::text;
    execute format('drop trigger %I on auth.users', t.tgname);
    raise notice '트리거 삭제: % (함수 %)', t.tgname, fname;
    n := n + 1;
    -- 그 함수를 다른 데서 안 쓰면 함수도 지움
    begin
      execute format('drop function %s', fname);
      raise notice '함수 삭제: %', fname;
    exception when dependent_objects_still_exist then
      raise notice '함수 %는 다른 곳에서 써서 남김', fname;
    end;
  end loop;
  if n = 0 then raise notice 'auth.users 에 지울 트리거가 없어요 — 다른 원인이에요. 결과를 캡처해서 보내 주세요'; end if;
end $$;
