# 타임보드 (Timeboard)

직원별 시간대 예약/일정을 한눈에 보는 스케줄 보드.
가로축 = 직원, 세로축 = 시간. 네이버 예약 파트너 화면과 유사한 UI.

## 구조

```
frontend/   React (Vite) — 예약 보드 UI
backend/    Spring Boot 3 (Java 21, Gradle) — API 서버
```

## 로컬 실행

```bash
# 프론트 (http://localhost:5173)
cd frontend && npm install && npm run dev

# 백엔드 (http://localhost:8080)
cd backend && ./gradlew bootRun
```

현재 프론트는 `src/data.js`의 목업 데이터를 사용한다. 백엔드 API가 생기면 교체.

## 무료 배포 플랜 (2026-10 조사)

| 구성 | 서비스 | 무료 조건 | 비고 |
|------|--------|-----------|------|
| 프론트 | Vercel 또는 Netlify | 정적 사이트 무료 | 제약 사실상 없음 |
| 백엔드 | Render (Docker) | 월 750시간, 512MB RAM | 15분 유휴 시 슬립 → 첫 요청 ~1분 지연 |
| DB | Neon (PostgreSQL) | 0.5GB 저장, scale-to-zero | Render 무료 PG는 30일 만료라 제외 |

- 백엔드는 `backend/Dockerfile`로 Render에 바로 배포 가능 (`PORT` 환경변수 대응 완료).
- DB 연결은 Render 환경변수 `DATABASE_URL`에 Neon 접속 문자열을 넣으면 된다.
- 대안: Supabase (DB 500MB + 인증/스토리지 포함, 항상 켜짐).

## 다음 할 일

- [ ] 백엔드: Reservation / Staff 엔티티 + CRUD API
- [ ] 프론트: 목업 → API 연동, 예약 등록 모달 (+ FAB)
- [ ] 배포: Neon 프로젝트 생성 → Render/Vercel 연결
