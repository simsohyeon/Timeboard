# 타임보드 (Timeboard)

직원별 시간대 예약/일정을 한눈에 보는 스케줄 보드.
가로축 = 직원, 세로축 = 시간. 빈 시간이 점선 칸으로 보이는 보드 + "지금" 현황판.

## 구조 (TraderNote 방식: 서버 없이 Supabase 직결)

```
frontend/   React (Vite) — 보드 UI, supabase-js로 DB 직접 접근
  src/
    App.jsx            상태·조립만
    api.js             데이터 접근 전부 (Supabase)
    lib/constants.js   시간 범위·요일·시간 포맷 등 공통 상수
    lib/schedule.js    빈 시간·지금 상태·가장 빠른 가능 시각 계산
    components/
      ui.jsx           공용 프리미티브 (Modal/Button/Field, 토스 스타일)
      TopBar.jsx  MiniCalendar.jsx  DateHeader.jsx
      Board.jsx          예약 보드 (칸 = 담당자, 세로 = 시간, 빈 시간 점선 칸 눌러 예약)
      DaySummary.jsx     보드 위 요약 (예약·완료 수, 시술 중, 바로 가능)
      NowPage.jsx        지금 현황판 (담당자별 현재 상태 · 워크인 배정 · 다음 손님)
      ReservationModal.jsx  MenuModal.jsx
supabase/   setup.sql — 테이블·RLS·시드 (SQL Editor에서 1회 실행)
backend/    Spring Boot (Java 21) — 보관용. 배포에는 사용하지 않음
```

디자인 토큰은 `App.css`의 `:root`에 모여 있어 색·둥글기 전역 변경은 거기서 한다.

프론트가 Supabase PostgreSQL에 직결하므로 서버·콜드스타트가 없다.
데이터 접근은 전부 `frontend/src/api.js` 한 파일을 거친다.

## 처음 설정 (1회)

1. [supabase.com](https://supabase.com)에서 무료 프로젝트 생성
2. 대시보드 → SQL Editor에 `supabase/setup.sql` 내용 붙여넣고 실행
3. Project Settings → API에서 URL과 anon key 복사
4. `frontend/.env.example`을 `frontend/.env`로 복사해 값 채우기

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
reservation  id, staff_id, date, start_min(0:00 기준 분), duration_min, title, subtitle, price
menu         id, name, durations[], prices[](같은 순서), sort_order
settings     id=1, open_min, close_min

컬럼이 늘어나면 setup.sql을 다시 실행하면 된다 (alter … add column if not exists).
```

지금은 로그인 없는 단일 매장 보드라 RLS를 anon 전체 허용으로 열어두었다.
로그인을 붙일 때 `setup.sql`의 두 정책을 authenticated 전용으로 교체할 것.

## 다음 할 일

- [x] 예약 등록/수정/삭제 모달 (빈 칸 클릭·블록 클릭·FAB, 메뉴 선택 시 소요시간 자동)
- [ ] Vercel 배포 연결
- [ ] (선택) 로그인 + RLS 강화

## 참고: backend/ (보관용)

Spring Boot CRUD API(`/api/staff`, `/api/reservations`)가 구현되어 있다.
나중에 서버가 필요해지면(권한 로직, 외부 연동 등) `cd backend && ./gradlew bootRun`으로
기동하고 `api.js`를 fetch 기반으로 되돌리면 된다. Render 배포용 Dockerfile 포함.
