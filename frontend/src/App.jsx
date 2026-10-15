import { useEffect, useMemo, useState } from 'react';
import { api, fmtDate, configured } from './api';
import './App.css';

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const START_H = 6, END_H = 22, HOUR_PX = 66;

const hourLabel = h => (h < 12 ? `오전 ${h}:00` : h === 12 ? `오후 12:00` : `오후 ${h - 12}:00`);

function TopBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 10000); return () => clearInterval(t); }, []);
  const clock = `${now.getMonth() + 1}.${now.getDate()} (${DAYS[now.getDay()]}) ${now.getHours() < 12 ? '오전' : '오후'} ${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <div className="topbar">
      <button className="tb-menu" aria-label="메뉴">
        <svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 4h14M2 9h14M2 14h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        <i className="badge" />
      </button>
      <nav className="tb-nav">
        <button className="active">예약<i className="badge" /></button>
        <button>결제</button>
        <button>고객</button>
      </nav>
      <div className="tb-right">
        <span className="tb-avatar">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5.5" r="3"/><path d="M2 14c.8-3 3.2-4.3 6-4.3s5.2 1.3 6 4.3z"/></svg>
        </span>
        <button className="tb-icon" aria-label="알림">
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M8.5 2a4 4 0 0 1 4 4v2.6l1.2 2.4H3.3L4.5 8.6V6a4 4 0 0 1 4-4z"/><path d="M7 13.5a1.6 1.6 0 0 0 3 0"/></svg>
        </button>
        <span className="tb-clock">{clock}</span>
        <button className="tb-icon" aria-label="더보기">⋮</button>
      </div>
    </div>
  );
}

function MiniCalendar({ selected, onSelect, eventDates }) {
  const [view, setView] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
  const today = new Date();

  const weeks = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const out = [];
    const d = new Date(start);
    do {
      const w = [];
      for (let i = 0; i < 7; i++) { w.push(new Date(d)); d.setDate(d.getDate() + 1); }
      out.push(w);
    } while (d.getMonth() === view.getMonth());
    return out;
  }, [view]);

  const move = n => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1));
  const same = (a, b) => fmtDate(a) === fmtDate(b);

  return (
    <div className="minical">
      <div className="mc-head">
        <button className="mc-arrow" onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <span className="mc-title">{view.getFullYear()}년 {view.getMonth() + 1}월</span>
        <button className="mc-today" onClick={() => { setView(new Date(today.getFullYear(), today.getMonth(), 1)); onSelect(today); }}>오늘</button>
        <button className="mc-arrow" onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>
      <div className="mc-grid mc-dow">
        {DAYS.map((d, i) => <span key={d} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{d}</span>)}
      </div>
      {weeks.map((w, wi) => (
        <div className="mc-grid" key={wi}>
          {w.map(d => {
            const out = d.getMonth() !== view.getMonth();
            const cls = [
              'mc-day',
              out && 'out',
              d.getDay() === 0 && 'sun',
              d.getDay() === 6 && 'sat',
              same(d, selected) && 'sel',
            ].filter(Boolean).join(' ');
            return (
              <button key={fmtDate(d)} className={cls} onClick={() => onSelect(new Date(d))}>
                <span className="num">{d.getDate()}</span>
                {eventDates.has(fmtDate(d)) && <i className="ev" />}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Board({ staff, list, date }) {
  const isToday = fmtDate(date) === fmtDate(new Date());
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  useEffect(() => {
    // 처음에 현재 시각(또는 정오) 부근이 보이게 스크롤
    const el = document.querySelector('.board');
    if (!el) return;
    const base = isToday ? new Date().getHours() : 12;
    el.scrollTop = Math.max(0, (base - 1 - START_H) * HOUR_PX);
  }, []);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = (nowMin - START_H * 60) / 60 * HOUR_PX;
  const showNow = isToday && nowMin >= START_H * 60 && nowMin <= END_H * 60;
  const nowLabel = `${((now.getHours() + 11) % 12) + 1}:${String(now.getMinutes()).padStart(2, '0')}`;

  return (
    <div className="board">
      <div className="board-grid" style={{ gridTemplateColumns: `64px repeat(${staff.length || 1}, 1fr)` }}>
        <div className="col-head corner" />
        {staff.map(s => (
          <div className="col-head" key={s.id}>
            {s.dotColor && <i className="dot" style={{ background: s.dotColor }} />}{s.name}
          </div>
        ))}
        <div className="time-col" style={{ height: (END_H - START_H) * HOUR_PX }}>
          {Array.from({ length: END_H - START_H }, (_, i) => (
            <span className="time-label" key={i} style={{ top: (i + 1) * HOUR_PX }}>{hourLabel(START_H + i + 1)}</span>
          ))}
          {showNow && <span className="now-pill" style={{ top: nowTop }}>{nowLabel}</span>}
        </div>
        {staff.map(s => (
          <div className="col" key={s.id} style={{ height: (END_H - START_H) * HOUR_PX }}>
            {Array.from({ length: END_H - START_H - 1 }, (_, i) => (
              <i className="hline" key={i} style={{ top: (i + 1) * HOUR_PX }} />
            ))}
            {list.filter(r => r.staffId === s.id).map(r => (
              <div className="resv" key={r.id} style={{ top: (r.startMin - START_H * 60) / 60 * HOUR_PX, height: r.durationMin / 60 * HOUR_PX - 2 }}>
                <b>{r.title}</b>
                <span>{r.subtitle}</span>
              </div>
            ))}
            {showNow && <i className="now-line" style={{ top: nowTop }} />}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [list, setList] = useState([]);
  const [eventDates, setEventDates] = useState(new Set());

  useEffect(() => {
    api.staff().then(setStaff).catch(() => setStaff([]));
    api.reservationDates().then(d => setEventDates(new Set(d))).catch(() => {});
  }, []);

  useEffect(() => {
    api.reservations(fmtDate(date)).then(setList).catch(() => setList([]));
  }, [date]);

  const moveDay = n => setDate(d => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });

  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <aside className="sidebar">
          <MiniCalendar selected={date} onSelect={setDate} eventDates={eventDates} />
          <button className="feedback">의견 보내기</button>
        </aside>
        <main className="main">
          {!configured && (
            <p className="notice">Supabase가 아직 연결되지 않았어요 — frontend/.env 를 채우면 데이터가 표시됩니다 (README 참고)</p>
          )}
          <div className="main-head">
            <button className="mh-arrow" onClick={() => moveDay(-1)} aria-label="이전 날">‹</button>
            <span className="mh-date">{date.getDate()}일 ({DAYS[date.getDay()]})</span>
            <span className="mh-count">총 {list.length}건</span>
            <button className="mh-arrow" onClick={() => moveDay(1)} aria-label="다음 날">›</button>
            <div className="mh-right">
              <button className="chip link-resv"><i className="n-ico">N</i> 링크예약</button>
              <button className="chip">담당자 전체 <i className="caret">▾</i></button>
              <button className="chip">일 <i className="caret">▾</i></button>
              <button className="mh-gear" aria-label="설정">
                <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.3"><circle cx="8.5" cy="8.5" r="2.6"/><path d="M8.5 1.8v2m0 9.4v2M1.8 8.5h2m9.4 0h2M3.8 3.8l1.4 1.4m6.6 6.6 1.4 1.4m0-9.4-1.4 1.4M5.2 11.8l-1.4 1.4"/></svg>
              </button>
            </div>
          </div>
          <Board staff={staff} list={list} date={date} />
        </main>
      </div>
      <div className="mascot" aria-hidden>🐥</div>
      <button className="fab" aria-label="예약 추가">+</button>
    </div>
  );
}
