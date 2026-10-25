# 설치 및 설정

## Supabase 처음 설정 (1회)

1. [supabase.com](https://supabase.com)에서 프로젝트를 만든다 (무료 플랜으로 충분).
2. SQL Editor에서 차례로 실행한다: `supabase/setup.sql` → `supabase/accounts.sql` → `supabase/hardening.sql`
   - 새 프로젝트는 이 셋이면 끝난다.
   - 계정 기능이 없던 시절 데이터가 있다면 accounts 다음에 가입·매장 만들기 → `claim.sql` → hardening 순서로 실행한다.
3. Authentication → URL Configuration
   - Site URL: 배포 주소 (예: `https://timeboard-five.vercel.app`). 인증 메일과 비밀번호 재설정 메일 링크가 여기로 온다.
   - Redirect URLs: 쓰는 주소를 모두 넣는다 (배포 주소, 직접 연결한 도메인, `http://localhost:5173`).
4. 메일 설정 (중요): Supabase 기본 메일 서버는 프로젝트 팀원에게만, 한 시간에 몇 통만 보낸다. 실제 매장 사용자에게는 가입 인증·비밀번호 찾기 메일이 가지 않는다.
   - Authentication → Emails → SMTP Settings에 메일 서비스(Resend, Gmail SMTP 등)를 연결하고 Rate Limits에서 한도를 올린다.
   - SMTP 없이 쓰려면 Sign In / Providers → Email의 Confirm email을 끈다 (가입 즉시 사용 가능). 이 경우 비밀번호 찾기 메일은 여전히 가지 않는다.
5. Project Settings → API에서 URL과 anon key를 복사한다.
6. 로컬은 `frontend/.env.example`을 `frontend/.env`로 복사해 값을 채운다. 배포는 Vercel 환경 변수에 넣는다.
   Vite는 빌드할 때 값을 넣기 때문에 값을 바꾼 뒤에는 다시 배포해야 적용된다.

테이블에 컬럼이 추가되는 업데이트가 있으면 `setup.sql`을 다시 실행하면 된다 (`add column if not exists`로 되어 있어 여러 번 실행해도 안전하고, 보안 정책은 건드리지 않는다).

## 로컬 실행

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## 배포 (Vercel)

- Root Directory: `frontend`
- Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- main 브랜치에 푸시하면 자동으로 배포된다.

| 구성 | 서비스 | 무료 조건 |
|------|--------|-----------|
| 프론트 | Vercel (정적 호스팅) | 사실상 제약 없음 |
| DB | Supabase | DB 500MB, 항상 켜져 있음 (콜드 스타트 없음) |

## 계정 · 매장 · 사장님 PIN

- 이메일·비밀번호로 가입하고, 처음 한 번 매장 이름과 사장님 PIN(숫자 4자리)을 정한다. 계정 1개 = 매장 1개.
- 모든 앱 테이블에 `shop_id`가 있고, RLS가 로그인한 계정의 매장 행만 읽고 쓰게 한다. 로그인하지 않으면 아무것도 보이지 않는다.
- 결제·설정 탭은 PIN을 넣어야 열리고, 5분 동안 조작이 없으면 다시 잠긴다 (상단 '잠그기'로 바로 잠글 수도 있다).
- PIN은 DB에 bcrypt 해시로만 저장하고 `verify_pin` 함수로 확인한다. 5번 연속 틀리면 5분 동안 잠긴다.
- PIN을 잊으면 PIN 창의 'PIN을 잊었어요' → 로그인 비밀번호 확인 → 새 PIN (`reset_pin`: 10분 안에 비밀번호로 로그인한 토큰만 허용).
- 예약·휴가의 담당자는 `(직원 id, 매장)` 복합 외래키로 묶여 있어 다른 매장 직원을 가리킬 수 없다 (`hardening.sql`).
- public 스키마에 새 테이블을 만들면 Supabase는 anon에 열어 둔다. 새 테이블마다 RLS를 켜고 anon 권한을 회수해야 한다.
- PIN은 화면 잠금이다. 같은 계정으로 로그인한 기기는 DB 규칙상 그 매장 데이터를 읽고 쓸 수 있다.

## PWA (홈 화면 설치)

`frontend/public/`의 `manifest.webmanifest`, `sw.js`, 아이콘으로 구성된다. 배포 주소를 폰·태블릿에서 열고 "홈 화면에 추가"하면 앱처럼 전체 화면으로 실행된다.

- 서비스 워커는 배포 빌드에서만 등록한다 (`npm run dev`에서는 캐시가 수정 사항을 가리지 않도록 등록하지 않음).
- 앱 화면 파일만 캐시하고 Supabase 데이터 요청은 캐시하지 않는다. 예약은 항상 최신 상태다.
- 오프라인이면 화면은 뜨지만 데이터는 비어 보인다.
- 로컬에서 PWA 확인: `npm run build && npm run preview`
- `sw.js`의 캐시 동작을 바꾸면 `CACHE` 이름의 버전(v1 → v2)을 올린다.
- 켜 둔 화면은 새 배포를 감지하면 알아서 새로고침한다 (`src/lib/autoUpdate.js`).

## DB 스키마

```
staff        id, name, dot_color, sort_order,
             joined_on, left_on(퇴사일: 다음 날부터 보드에서 숨김, 기록은 유지),
             commission_pct(정산 비율), work_days(0=일…6=토), work_open_min/close_min(null = 매장과 같음),
             phone, memo
reservation  id, staff_id(null = 담당자 미정), date, start_min(영업일 0:00 기준 분, 1440 이상 = 새벽),
             duration_min, title, subtitle, price, done(완료), choice(초이스)
staff_leave  id, staff_id, start_date, end_date, start_min/end_min(null = 하루 종일), reason
menu         id, name, durations[], prices[](같은 순서), sort_order
settings     id, shop_id(매장마다 한 줄), open_min, close_min
shop         id, name, pin_hash, pin_fails, pin_locked_until   (화면에서는 id, name만 보임)
shop_member  user_id(auth.users), shop_id, role
앱 테이블(staff, reservation, menu, settings, staff_leave)마다 shop_id (기본값 = 로그인한 계정의 매장)
```

`setup.sql`만 실행한 상태는 로그인 없는 단일 매장(anon 전체 허용)이고, `accounts.sql`이 그 정책을 지우고 '내 매장만' 정책으로 바꾼다.

## backend/ (보관용)

초기에 만든 Spring Boot CRUD API(`/api/staff`, `/api/reservations`)가 남아 있다. 지금 배포에는 쓰지 않는다. 나중에 서버가 필요해지면(외부 연동 등) `cd backend && ./gradlew bootRun`으로 띄우고 `api.js`를 fetch 기반으로 바꾸면 된다. Render 배포용 Dockerfile이 포함되어 있다.
