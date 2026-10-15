import { useMemo, useState } from 'react';
import { fmtDate } from '../api';
import { DAYS } from '../lib/constants';
import { Chevron } from './ui';

export default function MiniCalendar({ selected, onSelect, eventDates }) {
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
        <button className="mc-arrow" onClick={() => move(-1)} aria-label="이전 달"><Chevron dir="left" size={13} /></button>
        <span className="mc-title">{view.getFullYear()}년 {view.getMonth() + 1}월</span>
        <button className="mc-today" onClick={() => { setView(new Date(today.getFullYear(), today.getMonth(), 1)); onSelect(today); }}>오늘</button>
        <button className="mc-arrow" onClick={() => move(1)} aria-label="다음 달"><Chevron dir="right" size={13} /></button>
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
