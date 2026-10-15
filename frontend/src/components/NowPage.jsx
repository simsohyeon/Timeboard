import { useEffect, useState } from 'react';
import { api } from '../api';
import { minLabel, worksOn } from '../lib/constants';
import { staffNow, earliestStart, durLabel, nowMinutes, ceilTo, leaveLabel } from '../lib/schedule';

// 지금 현황판: 오늘 지금 이 순간 누가 뭘 하고 있는지 + 워크인 손님 배정 도우미 + 다음 손님
const short = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

export default function NowPage({ staff, list, leaves = [], openMin, closeMin, menus, onCreate, onOpen, onChanged }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);
  const today = new Date();
  const nowMin = nowMinutes(today);

  // 워크인 도우미: 메뉴판에 있는 시간들 (없으면 30/60/90)
  const durs = [...new Set(menus.flatMap(m => m.durations))].sort((a, b) => a - b);
  const durOpts = durs.length ? durs : [30, 60, 90];
  const [walkDur, setWalkDur] = useState(null);
  const dur = durOpts.includes(walkDur) ? walkDur : (durOpts.includes(60) ? 60 : durOpts[0]);

  const [busy, setBusy] = useState(null);
  const markDone = async r => {
    setBusy(r.id);
    try { await api.setReservationDone(r.id, true); onChanged(); }
    catch (e) { alert(e.message || String(e)); }
    finally { setBusy(null); }
  };

  const cards = staff.map(s => ({ s, st: staffNow(s, list, today, openMin, closeMin, nowMin, leaves) }));
  const from = ceilTo(nowMin);
  const walkIn = staff
    .filter(s => worksOn(s, today.getDay()) && !cards.find(c => c.s.id === s.id).st.lv.full)
    .map(s => {
      const st = cards.find(c => c.s.id === s.id).st;
      return { s, at: earliestStart(st.blocks, st.range, from, dur) };
    })
    .filter(w => w.at != null)
    .sort((a, b) => a.at - b.at);
  const upcoming = list.filter(r => !r.done && r.startMin >= nowMin).sort((a, b) => a.startMin - b.startMin);
  const overdue = list.filter(r => !r.done && r.startMin + r.durationMin <= nowMin);
  const nameOf = id => staff.find(s => s.id === id)?.name ?? '';
  const colorOf = id => staff.find(s => s.id === id)?.dotColor || 'var(--blue)';

  if (!staff.length) return <p className="now-empty">오늘 근무하는 담당자가 없어요. 설정 → 담당자에서 추가하세요.</p>;

  return (
    <div className="now">
      <div className="now-cards">
        {cards.map(({ s, st }) => (
          <article key={s.id} className={'now-card ' + st.kind}>
            <header>
              <i className="avatar" style={{ '--c': s.dotColor || 'var(--blue)' }}>{s.name.slice(0, 1)}</i>
              <b>{s.name}</b>
              <span className="now-badge">
                {{ off: '휴무', leave: st.until ? '외출' : '휴가', before: '출근 전', after: '퇴근', busy: '시술 중', free: '비어 있음' }[st.kind]}
              </span>
            </header>

            {st.kind === 'busy' && (<>
              <div className="now-main">
                <button type="button" className="now-who" onClick={() => onOpen(st.current)}>{st.current.title}</button>
                <span>{st.current.subtitle} · {short(st.current.startMin)}–{short(st.current.startMin + st.current.durationMin)}</span>
              </div>
              <div className="now-progress">
                <i><i style={{ width: `${Math.min(100, (nowMin - st.current.startMin) / st.current.durationMin * 100)}%` }} /></i>
                <span>{durLabel(st.left)} 남음</span>
              </div>
            </>)}
            {st.kind === 'free' && (
              <div className="now-main">
                <strong>{durLabel(st.freeFor)} 비어요</strong>
                <span>{short(st.until)} 전까지 받을 수 있어요</span>
              </div>
            )}
            {st.kind === 'leave' && (
              <div className="now-main">
                <strong>{leaveLabel(st.leave)}</strong>
                {st.until && <span>{short(st.until)}에 돌아와요</span>}
              </div>
            )}
            {st.kind === 'before' && (
              <div className="now-main"><strong>{short(st.range[0])} 출근</strong></div>
            )}
            {(st.kind === 'off' || st.kind === 'after') && (
              <div className="now-main"><span>오늘은 더 이상 예약이 없어요</span></div>
            )}

            <footer>
              {st.next
                ? <button type="button" className="now-next" onClick={() => onOpen(st.next)}>
                    <span>다음</span><b>{short(st.next.startMin)} {st.next.title}</b>
                  </button>
                : <span className="now-next none">다음 예약 없음</span>}
              {st.kind === 'busy' && (
                <button type="button" className="now-act" disabled={busy === st.current.id}
                  onClick={() => markDone(st.current)}>완료</button>
              )}
              {st.kind === 'free' && st.freeFor >= 30 && (
                <button type="button" className="now-act" onClick={() => onCreate(s.id, from)}>지금 받기</button>
              )}
            </footer>
          </article>
        ))}
      </div>

      <aside className="now-side">
        <section className="walkin">
          <b>워크인 손님이 왔다면</b>
          <div className="walkin-durs" role="group" aria-label="코스 시간">
            {durOpts.map(d => (
              <button key={d} type="button" className={d === dur ? 'on' : ''} aria-pressed={d === dur}
                onClick={() => setWalkDur(d)}>{d}분</button>
            ))}
          </div>
          {walkIn.length === 0
            ? <p>오늘 {dur}분 비는 사람이 없어요</p>
            : (
              <ul>
                {walkIn.slice(0, 4).map(({ s, at }) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onCreate(s.id, at, dur)}>
                      <b>{s.name}</b><span>{at <= from ? '지금 바로' : `${minLabel(at)}부터`}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="now-queue">
          <header><b>다음 손님</b><span>남은 {upcoming.length}건</span></header>
          {upcoming.length === 0 && <p>오늘 남은 예약이 없어요</p>}
          {upcoming.map(r => (
            <button key={r.id} type="button" onClick={() => onOpen(r)}>
              <b className="q-time">{short(r.startMin)}</b>
              <span className="q-body"><b>{r.title}</b><small>{r.subtitle}</small></span>
              <span className="q-staff" style={{ '--c': colorOf(r.staffId) }}>{nameOf(r.staffId)}</span>
            </button>
          ))}
          {overdue.length > 0 && (<>
            <p className="now-overdue">완료 처리 필요 {overdue.length}건</p>
            {overdue.map(r => (
              <div key={r.id} className="q-overdue">
                <button type="button" onClick={() => onOpen(r)}>
                  <b className="q-time">{short(r.startMin)}</b>
                  <span className="q-body"><b>{r.title}</b><small>{r.subtitle} · {nameOf(r.staffId)}</small></span>
                </button>
                <button type="button" className="now-act" disabled={busy === r.id} onClick={() => markDone(r)}>완료</button>
              </div>
            ))}
          </>)}
        </section>
      </aside>
    </div>
  );
}
