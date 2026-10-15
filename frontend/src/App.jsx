import { useEffect, useState } from 'react';
import { api, fmtDate, configured } from './api';
import TopBar from './components/TopBar';
import MiniCalendar from './components/MiniCalendar';
import DateHeader from './components/DateHeader';
import Board from './components/Board';
import ReservationModal from './components/ReservationModal';
import MenuModal from './components/MenuModal';
import './App.css';

export default function App() {
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [list, setList] = useState([]);
  const [eventDates, setEventDates] = useState(new Set());
  const [menus, setMenus] = useState([]);
  const [modal, setModal] = useState(null); // 예약 등록/수정 폼 초기값
  const [menuOpen, setMenuOpen] = useState(false);

  const loadMenus = () => api.menus().then(setMenus).catch(() => setMenus([]));
  useEffect(() => {
    api.staff().then(setStaff).catch(() => setStaff([]));
    loadMenus();
  }, []);

  const reload = () => {
    api.reservations(fmtDate(date)).then(setList).catch(() => setList([]));
    api.reservationDates().then(d => setEventDates(new Set(d))).catch(() => {});
  };
  useEffect(reload, [date]);

  const moveDay = n => setDate(d => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  const openCreate = (staffId, startMin) => setModal({ staffId, startMin, durationMin: 60, title: '', subtitle: '' });

  return (
    <div className="app">
      <TopBar />
      <div className="body">
        <aside className="sidebar">
          <MiniCalendar selected={date} onSelect={setDate} eventDates={eventDates} />
        </aside>
        <main className="main">
          {!configured && (
            <p className="notice">Supabase가 아직 연결되지 않았어요 — frontend/.env 를 채우면 데이터가 표시됩니다 (README 참고)</p>
          )}
          <DateHeader date={date} count={list.length} onMove={moveDay} onMenuOpen={() => setMenuOpen(true)} />
          <Board staff={staff} list={list} date={date}
            onCellClick={openCreate} onBlockClick={r => setModal(r)} />
        </main>
      </div>
      <button className="fab" aria-label="예약 추가"
        onClick={() => openCreate(staff[0]?.id, 12 * 60)}>+</button>
      {modal && (
        <ReservationModal init={modal} staff={staff} menus={menus} date={date}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); reload(); }} />
      )}
      {menuOpen && (
        <MenuModal menus={menus} onClose={() => setMenuOpen(false)} onChanged={loadMenus} />
      )}
    </div>
  );
}
