import { useEffect, useState } from 'react';
import { api, fmtDate, configured } from './api';
import { START_H, END_H, getScale, applyScale } from './lib/constants';
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

  const loadStaff = () => api.staff().then(setStaff).catch(() => setStaff([]));
  const loadMenus = () => api.menus().then(setMenus).catch(() => setMenus([]));
  const loadSettings = () => api.settings().then(setSettings).catch(() => {});
  useEffect(() => { applyScale(getScale()); loadStaff(); loadMenus(); loadSettings(); }, []);

  const reload = () => {
    api.reservations(fmtDate(date)).then(setList).catch(() => setList([]));
    api.reservationDates().then(d => setEventDates(new Set(d))).catch(() => {});
  };
  useEffect(reload, [date]);

  const startH = settings ? Math.floor(settings.openMin / 60) : START_H;
  const endH = settings ? Math.ceil(settings.closeMin / 60) : END_H;

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
          {tab === 'reserve' && (<>
            <DateHeader date={date} count={list.length} onMove={moveDay} />
            <Board staff={staff} list={list} date={date} startH={startH} endH={endH}
              onCellClick={openCreate} onBlockClick={r => setModal(r)} />
          </>)}
          {tab === 'pay' && (<>
            <DateHeader date={date} count={list.length} onMove={moveDay} />
            <PayrollPage staff={staff} list={list} />
          </>)}
          {tab === 'settings' && (
            <SettingsPage staff={staff} menus={menus} settings={settings}
              onStaffChanged={() => { loadStaff(); reload(); }}
              onMenusChanged={loadMenus}
              onSettingsChanged={loadSettings} />
          )}
        </main>
      </div>
      {tab === 'reserve' && (
        <button className="fab" aria-label="예약 추가"
          onClick={() => openCreate(staff[0]?.id, 12 * 60)}>+</button>
      )}
      {modal && (
        <ReservationModal init={modal} staff={staff} menus={menus} date={date}
          startH={startH} endH={endH}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
    </div>
  );
}
