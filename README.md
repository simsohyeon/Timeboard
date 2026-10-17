# 타임보드 (Timeboard)

직원별 시간대 예약/일정을 한눈에 보는 스케줄 보드.
가로축 = 직원, 세로축 = 시간. 빈 시간이 점선 칸으로 보이는 보드 + "지금" 현황판.

## 구조 (TraderNote 방식: 서버 없이 Supabase 직결)

```
frontend/   React (Vite) — 보드 UI, supabase-js로 DB 직접 접근
  src/
    Root.jsx           로그인 → 매장 확인 → App (계정이 바뀌면 App 을 새로 띄움)
    App.jsx            상태·조립만 (결제·설정 PIN 잠금 포함)
    api.js             데이터 접근 전부 (Supabase)
    lib/constants.js   시간 범위·요일·시간 포맷 등 공통 상수
    lib/schedule.js    빈 시간·지금 상태·가장 빠른 가능 시각 계산
    components/
      ui.jsx           공용 프리미티브 (Modal/Button/Field, 토스 스타일)
      TopBar.jsx  MiniCalendar.jsx  DateHeader.jsx
      Board.jsx          예약 보드 (칸 = 담당자, 세로 = 시간, 빈 시간 점선 칸 눌러 예약)
      DaySummary.jsx     보드 위 요약 (예약·완료 수, 시술 중, 바로 가능, 휴가)
      LeavePanel.jsx     설정 > 담당자 휴가 등록·삭제 + 겹친 예약 다른 담당자로 옮기기
      NowPage.jsx        지금 현황판 (담당자별 현재 상태 · 워크인 배정 · 다음 손님)
      ReservationModal.jsx  MenuModal.jsx
      AuthPage.jsx       로그인·회원가입·매장 만들기
      PinPad.jsx         사장님 PIN 입력
supabase/   setup.sql — 표 / accounts.sql — 계정별 매장·PIN / hardening.sql — 보안 보강 (이 순서) / claim.sql — 예전 데이터 가져오기
backend/    Spring Boot (Java 21) — 보관용. 배포에는 사용하지 않음
```

디자인 토큰은 `App.css`의 `:root`에 모여 있어 색·둥글기 전역 변경은 거기서 한다.

프론트가 Supabase PostgreSQL에 직결하므로 서버·콜드스타트가 없다.
데이터 접근은 전부 `frontend/src/api.js` 한 파일을 거친다.

## 처음 설정 (1회)

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성
2. SQL Editor 에서 차례로 실행: `supabase/setup.sql` → `supabase/accounts.sql` → `supabase/hardening.sql`
   (새 프로젝트는 이 셋이면 끝. 계정 없던 예전 데이터가 있을 때만 accounts 다음에 가입·매장 만들기 → `claim.sql` → hardening)
3. Authentication → URL Configuration
   - Site URL: 배포 주소 (예: `https://timeboard-five.vercel.app`) — 인증·비밀번호 재설정 메일 링크가 여기로 온다
   - Redirect URLs: 쓰는 주소를 모두 (배포 주소, 직접 연결한 도메인, `http://localhost:5173`)
4. **메일 (중요)**: Supabase 기본 메일 서버는 *프로젝트 팀원에게만*, 한 시간에 몇 통만 보낸다 → 실제 손님(매장주)에게는 가입 인증·비밀번호 찾기 메일이 안 간다
   - Authentication → Emails → SMTP Settings 에 메일 서비스(Resend, Gmail SMTP 등)를 연결하고, Rate Limits 에서 메일 한도를 올린다
   - SMTP 없이 쓰려면 Sign In / Providers → Email 의 Confirm email 을 끈다 (가입 즉시 사용). 이 경우 비밀번호 찾기 메일은 여전히 안 간다
   - (선택) Emails → Templates 에서 메일 문구를 한국어로
5. Project Settings → API에서 URL과 anon key 복사
6. 로컬: `frontend/.env.example`을 `frontend/.env`로 복사해 값 채우기. 배포: Vercel 환경 변수에 넣는다
   (Vite 는 빌드할 때 값을 넣으므로 바꾼 뒤에는 **다시 배포**해야 적용)

**업데이트로 칸이 늘어났을 때**: `setup.sql` 을 다시 실행한다 (계정 적용 뒤에도 안전 — 보안 규칙은 건드리지 않음)

## 계정 · 매장 · 사장님 PIN

- 이메일·비밀번호로 가입 → 처음 한 번 매장 이름과 사장님 PIN(숫자 4자리)을 정한다. 계정 1개 = 매장 1개
- 모든 표에 `shop_id` 가 있고, RLS 가 로그인한 계정의 매장 줄만 읽고 쓰게 한다 (로그인 안 하면 아무것도 안 보임)
- 결제·설정 탭은 PIN 을 넣어야 열리고, 5분 동안 아무것도 안 누르면 다시 잠긴다 (상단 '잠그기'로 바로 잠금)
- PIN 은 DB 에 bcrypt 로만 저장, 확인은 `verify_pin` 함수로. 5번 연속 틀리면 5분 잠금
- PIN 을 잊으면 PIN 창의 'PIN을 잊었어요' → 로그인 비밀번호 확인 → 새 PIN (`reset_pin`: 10분 안에 비밀번호로 로그인한 토큰만)
- 예약·휴가의 담당자는 (직원 id, 매장) 으로 묶여 다른 매장 직원을 가리킬 수 없다 (hardening.sql)
- public 스키마에 새 표를 만들면 Supabase 는 anon 에 열어 둔다 → 새 표마다 RLS 켜고 anon 권한 회수
- PIN 은 화면 잠금이다: 같은 계정으로 로그인한 기기는 DB 규칙상 그 매장 데이터를 읽고 쓸 수 있다
- 예전(계정 없던 때) 데이터는 가입·매장 만들기 뒤 `claim.sql` 로 내 매장에 붙인다 (매장이 하나면 이메일 없이)

## 로컬 실행

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

## 무료 배포

| 구성 | 서비스 | 무료 조건 |
|------|--------|-----------|
| 프론트 | Vercel 또는 Netlify (정적) | 제약 사실상 없음 |
| DB | Supabase | DB 500MB, 항상 켜짐 (콜드스타트 없음) |

배포 시 Vercel 프로젝트의 Environment Variables에 `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`를 넣고 Root Directory를 `frontend`로 지정하면 끝.

## PWA (홈 화면 설치)

`frontend/public/`의 `manifest.webmanifest` · `sw.js` · 아이콘으로 구성.
배포 주소를 폰·태블릿에서 열고 "홈 화면에 추가"하면 앱처럼 전체화면으로 실행된다.

- 서비스워커는 **배포 빌드에서만** 등록 (`npm run dev`에선 안 함 — 캐시가 수정사항을 가리지 않게)
- 앱 화면 파일만 캐시하고 **Supabase 데이터 요청은 캐시하지 않음** → 예약은 항상 최신
- 오프라인이면 화면은 뜨지만 데이터는 비어 보인다
- 로컬에서 PWA 확인: `npm run build && npm run preview`
- `sw.js`의 캐시 동작을 바꾸면 `CACHE` 이름의 버전(v1 → v2)을 올릴 것

## DB 스키마

```
staff        id, name, dot_color, sort_order,
             joined_on, left_on(퇴사일: 다음 날부터 보드에서 숨김, 기록 유지),
             commission_pct(정산 비율), work_days(0=일…6=토), work_open_min/close_min(null=매장과 같음),
             phone, memo
reservation  id, staff_id, date, start_min(영업일 0:00 기준 분, 1440 이상 = 새벽), duration_min, title, subtitle, price, done(완료), choice(초이스)
menu         id, name, durations[], prices[](같은 순서), sort_order
settings     id, shop_id(매장마다 한 줄), open_min, close_min
shop         id, name, pin_hash, pin_fails, pin_locked_until   (화면에서는 id·name 만 보임)
shop_member  user_id(auth.users), shop_id, role
앱 표(staff·reservation·menu·settings·staff_leave)마다 shop_id (기본값 = 로그인한 계정의 매장)

컬럼이 늘어나면 setup.sql을 다시 실행하면 된다 (alter … add column if not exists).
```

`setup.sql` 만 실행한 상태는 로그인 없는 단일 매장(anon 전체 허용)이고,
`accounts.sql` 이 그 정책을 지우고 '내 매장만' 정책으로 바꾼다.

## 다음 할 일

- [x] 예약 등록/수정/삭제 모달 (빈 칸 클릭·블록 클릭·FAB, 메뉴 선택 시 소요시간 자동)
- [ ] Vercel 배포 연결
- [x] 로그인 + 계정별 매장 분리(RLS) + 사장님 PIN

## 참고: backend/ (보관용)

Spring Boot CRUD API(`/api/staff`, `/api/reservations`)가 구현되어 있다.
나중에 서버가 필요해지면(권한 로직, 외부 연동 등) `cd backend && ./gradlew bootRun`으로
기동하고 `api.js`를 fetch 기반으로 되돌리면 된다. Render 배포용 Dockerfile 포함.
