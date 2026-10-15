import { useEffect, useState } from 'react';
import { api, fmtDate, configured } from './api';
import { START_H, END_H, isActiveOn } from './lib/constants';
import { BASE_FONT, loadDisplay, saveDisplay } from './lib/display';
import TopBar from './components/TopBar';
import MiniCalendar from './components/MiniCalendar';
import DateHeader from './components/DateHeader';
import Board from './components/Board';
import PayrollPage from './components/PayrollPage';
import SettingsPage from './components/SettingsPage';
import ReservationModal from './components/ReservationModal';
import './App.css';

export default function App() {
  const [tab, setTab] = useState('reserve');
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [list, setList] = useState([]);
  const [eventDates, setEventDates] = useState(new Set());
  const [menus, setMenus] = useState([]);
  const [settings, setSettings] = useState(null);
  const [modal, setModal] = useState(null); // 예약 등록/수정 폼 초기값
  const [dbErr, setDbErr] = useState('');
  const [display, setDisplay] = useState(loadDisplay);

  const loadStaff = () => api.staff().then(s => { setStaff(s); setDbErr(''); })
    .catch(e => { setStaff([]); setDbErr(e.message || String(e)); });
  const loadMenus = () => api.menus().then(setMenus).catch(() => setMenus([]));
  const loadSettings = () => api.settings().then(setSettings).catch(() => {});
  useEffect(() => { loadStaff(); loadMenus(); loadSettings(); }, []);

  // 표시 설정 적용: 글자 크기(zoom + 높이 보정), 다크 모드
  useEffect(() => {
    saveDisplay(display);
    const scale = display.fontPx / BASE_FONT;
    document.body.style.zoom = scale;
    document.documentElement.style.setProperty('--scale', scale);
    document.documentElement.dataset.theme = display.dark ? 'dark' : 'light';
  }, [display]);

  // 화면 항상 켜기 (wake lock) — 탭이 다시 보일 때 재요청
  useEffect(() => {
    if (!display.keepAwake || !('wakeLock' in navigator)) return;
    let lock = null;
    const request = () =>
      navigator.wakeLock.request('screen').then(l => { lock = l; }).catch(() => {});
    request();
    const onVisible = () => document.visibilityState === 'visible' && request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release?.().catch(() => {});
    };
  }, [display.keepAwake]);

  const reload = () => {
    api.reservations(fmtDate(date)).then(setList).catch(() => setList([]));
    api.reservationDates().then(d => setEventDates(new Set(d))).catch(() => {});
  };
  useEffect(reload, [date]);

  const startH = settings ? Math.floor(settings.openMin / 60) : START_H;
  const endH = settings ? Math.ceil(settings.closeMin / 60) : END_H;

  // 보드/모달은 그 날짜 재직자만, 결제는 그 날 예약이 있는 퇴사자도 포함
  const dateStr = fmtDate(date);
  const activeStaff = staff.filter(s => isActiveOn(s, dateStr));
  const payStaff = staff.filter(s => isActiveOn(s, dateStr) || list.some(r => r.staffId === s.id));
  const modalStaff = modal ? staff.filter(s => isActiveOn(s, dateStr) || s.id === modal.staffId) : [];

  const moveDay = n => setDate(d => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const openCreate = (staffId, startMin) => setModal({ staffId, startMin, durationMin: 60, title: '', subtitle: '' });

  return (
    <div className="app">
      <TopBar tab={tab} onTab={setTab} />
      <div className="body">
        {tab !== 'settings' && (
          <aside className="sidebar">
            <MiniCalendar selected={date} onSelect={setDate} eventDates={eventDates} />
          </aside>
        )}
        <main className="main">
          {!configured && (
            <p className="notice">Supabase가 아직 연결되지 않았어요 — frontend/.env 를 채우면 데이터가 표시됩니다 (README 참고)</p>
          )}
          {dbErr && <p className="notice">{dbErr}</p>}
          {tab === 'reserve' && (<>
            <DateHeader date={date} count={list.length} onMove={moveDay} />
            <Board staff={activeStaff} list={list} date={date} startH={startH} endH={endH}
              hourPx={display.hourPx} halfLine={display.halfLine}
              onCellClick={openCreate} onBlockClick={r => setModal(r)} />
          </>)}
          {tab === 'pay' && (<>
            <DateHeader date={date} count={list.length} onMove={moveDay} />
            <PayrollPage staff={payStaff} list={list} />
          </>)}
          {tab === 'settings' && (
            <SettingsPage staff={staff} menus={menus} settings={settings}
              display={display} onDisplay={setDisplay}
              onStaffChanged={() => { loadStaff(); reload(); }}
              onMenusChanged={loadMenus}
              onSettingsChanged={loadSettings} />
          )}
        </main>
      </div>
      {tab === 'reserve' && (
        <button className="fab" aria-label="예약 추가"
          onClick={() => openCreate(activeStaff[0]?.id, 12 * 60)}>+</button>
      )}
      {modal && (
        <ReservationModal init={modal} staff={modalStaff} menus={menus} date={date}
          startH={startH} endH={endH} hidePrice={display.hidePrice}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
    </div>
  );
}
