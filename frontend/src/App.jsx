import { useEffect, useState } from 'react';
import { api, fmtDate, configured } from './api';
import { holdUpdate } from './lib/autoUpdate';
import { START_H, END_H, isActiveOn } from './lib/constants';
import { BASE_FONT, loadDisplay } from './lib/display';
import { bizNow, setDayEnd } from './lib/schedule';
import TopBar from './components/TopBar';
import MiniCalendar from './components/MiniCalendar';
import DateHeader from './components/DateHeader';
import Board from './components/Board';
import DaySummary from './components/DaySummary';
import NowPage from './components/NowPage';
import PayrollPage from './components/PayrollPage';
import SettingsPage from './components/SettingsPage';
import ReservationModal from './components/ReservationModal';
import PinPad from './components/PinPad';
import './App.css';

// 결제·설정은 사장님 PIN을 넣어야 열린다. 열린 뒤 아무것도 안 누르고 5분이 지나면 다시 잠긴다
const PIN_TABS = ['pay', 'settings'];
const IDLE_LOCK_MS = 5 * 60 * 1000;

export default function App({ shop, email, onShopChanged }) {
  const [tab, setTab] = useState('reserve');
  const [unlocked, setUnlocked] = useState(!shop); // 매장(로그인) 없는 로컬 개발 모드는 잠금 없음
  const [pinFor, setPinFor] = useState(null); // PIN 입력 뒤 열 탭
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [list, setList] = useState([]);
  const [eventDates, setEventDates] = useState(new Set());
  const [menus, setMenus] = useState([]);
  const [settings, setSettings] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [leaveErr, setLeaveErr] = useState('');
  const [modal, setModal] = useState(null); // 예약 등록/수정 폼 초기값
  const [dbErr, setDbErr] = useState('');
  const [display, setDisplay] = useState(loadDisplay); // 적용 중인 값 (설정에서 미리보기 포함, 저장은 설정 화면이 함)
  const [settingsDirty, setSettingsDirty] = useState(false);
  const changeTab = t => {
    if (t !== tab && settingsDirty && !window.confirm('저장하지 않은 설정 변경이 있어요. 저장하지 않고 이동할까요?')) return;
    if (PIN_TABS.includes(t) && !unlocked) { setPinFor(t); return; }
    if (t === 'now') { setDate(bizNow().date); setCalOpen(false); } // 현황판은 늘 오늘
    setTab(t);
  };
  const lock = () => {
    if (!shop) return;
    if (settingsDirty && !window.confirm('저장하지 않은 설정 변경이 있어요. 저장하지 않고 잠글까요?')) return;
    setSettingsDirty(false);
    setUnlocked(false);
    if (PIN_TABS.includes(tab)) setTab('reserve');
  };
  // 잠금 해제 중: 마지막으로 누른 뒤 5분 지나면 자동 잠금 (저장 안 한 설정이 있으면 기다림)
  useEffect(() => {
    if (!shop || !unlocked) return;
    let last = Date.now();
    const touch = () => { last = Date.now(); };
    const t = setInterval(() => {
      if (Date.now() - last < IDLE_LOCK_MS || settingsDirty) return;
      setUnlocked(false);
      setTab(cur => (PIN_TABS.includes(cur) ? 'reserve' : cur));
    }, 15000);
    ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, touch));
    return () => { clearInterval(t); ['pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, touch)); };
  }, [shop, unlocked, settingsDirty]);
  useEffect(() => holdUpdate(settingsDirty), [settingsDirty]); // 저장 안 한 설정이 있으면 자동 새로고침 미룸
  useEffect(() => {
    if (!settingsDirty) return;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingsDirty]);
  const [calOpen, setCalOpen] = useState(false); // 모바일(또는 달력 접었을 때) 펼침 달력
  // 데스크톱 왼쪽 달력 접기 — 기기별로 기억
  const [sideHidden, setSideHidden] = useState(() => { try { return localStorage.getItem('tb-cal-hidden') === '1'; } catch { return false; } });
  // 펼친 달력은 Esc로도 닫는다 (PC·태블릿 팝업은 바깥 가림막을 눌러 닫음 — 그 클릭이 보드까지 안 가게)
  useEffect(() => {
    if (!calOpen) return;
    const esc = e => e.key === 'Escape' && setCalOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [calOpen]);
  const toggleSide = () => setSideHidden(h => {
    try { localStorage.setItem('tb-cal-hidden', h ? '0' : '1'); } catch { /* 저장 실패해도 적용은 */ }
    setCalOpen(false);
    return !h;
  });

  const loadStaff = () => api.staff().then(s => { setStaff(s); setDbErr(''); })
    .catch(e => { setStaff([]); setDbErr(e.message || String(e)); });
  const loadMenus = () => api.menus().then(setMenus).catch(() => setMenus([]));
  const loadSettings = () => api.settings().then(s => {
    // 자정 넘어 영업하면 새벽 시간대는 전날 영업일로 — 처음 열었을 때 보드도 그 날로
    setDayEnd(s?.closeMin);
    setSettings(s);
    setDate(d => (fmtDate(d) === fmtDate(new Date()) ? bizNow().date : d));
  }).catch(() => {});
  const loadLeaves = () => api.leaves().then(l => { setLeaves(l); setLeaveErr(''); })
    .catch(e => { setLeaves([]); setLeaveErr(e.message || String(e)); });
  useEffect(() => { loadStaff(); loadMenus(); loadSettings(); loadLeaves(); }, []);

  // 표시 설정 적용: 글자 크기(zoom + 높이 보정), 다크 모드
  useEffect(() => {
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
  // 현황판은 다른 기기에서 바뀐 예약도 보이게 1분마다 새로 불러온다
  useEffect(() => {
    if (tab !== 'now') return;
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [tab, date]);

  const startH = settings ? Math.floor(settings.openMin / 60) : START_H;
  const endH = settings ? Math.ceil(settings.closeMin / 60) : END_H;

  // 보드/모달은 그 날짜 재직자만, 결제는 그 날 예약이 있는 퇴사자도 포함
  const dateStr = fmtDate(date);
  const activeStaff = staff.filter(s => isActiveOn(s, dateStr));
  const payStaff = staff.filter(s => isActiveOn(s, dateStr) || list.some(r => r.staffId === s.id));

  const moveDay = n => setDate(d => { const x = new Date(d); x.setDate(x.getDate() + n); return x; });
  // preferDur: 이 시간(분) 메뉴를 먼저 골라 둔다 (지금 탭 워크인 도우미)
  const openCreate = (staffId, startMin, preferDur) =>
    setModal({ staffId, startMin, durationMin: preferDur ?? 60, preferDur, title: '', subtitle: '' });

  // 예약·결제 공통 날짜 헤더 + 모바일 펼침 달력 (.cal-drop은 데스크톱에서 CSS로 숨김)
  const dateHead = (<div className="date-wrap">
    <DateHeader date={date} onMove={moveDay}
      {...(tab === 'pay'
        ? { count: list.filter(r => r.done).length, countLabel: '완료' }
        : { count: list.length })}
      calOpen={calOpen} onDateClick={() => setCalOpen(o => !o)}
      sideHidden={sideHidden} onToggleSide={toggleSide} />
    {calOpen && <div className="cal-scrim" onClick={() => setCalOpen(false)} />}
    {calOpen && (
      <div className="cal-drop">
        <MiniCalendar selected={date} eventDates={eventDates}
          onSelect={d => { setDate(d); setCalOpen(false); }} />
      </div>
    )}
  </div>);

  return (
    <div className={'app' + (sideHidden ? ' side-hidden' : '')}>
      <TopBar tab={tab} onTab={changeTab} shopName={shop?.name} locked={!!shop && !unlocked} pinTabs={shop ? PIN_TABS : []} onLock={lock} />
      <div className="body">
        {(tab === 'reserve' || tab === 'pay') && !sideHidden && (
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
            {dateHead}
            <DaySummary staff={activeStaff} list={list} leaves={leaves} date={date} openMin={startH * 60} closeMin={endH * 60} />
            <Board staff={activeStaff} list={list} date={date} startH={startH} endH={endH}
              hourPx={display.hourPx} halfLine={display.halfLine} leaves={leaves}
              onCellClick={openCreate} onBlockClick={r => setModal(r)} />
          </>)}
          {tab === 'now' && (
            <NowPage staff={activeStaff} list={list} leaves={leaves} menus={menus}
              openMin={startH * 60} closeMin={endH * 60}
              onCreate={openCreate} onOpen={r => setModal(r)} onChanged={reload} />
          )}
          {tab === 'pay' && (<>
            {dateHead}
            <PayrollPage staff={payStaff} list={list} />
          </>)}
          {tab === 'settings' && (
            <SettingsPage staff={staff} menus={menus} settings={settings}
              onDirtyChange={setSettingsDirty}
              leaves={leaves} leaveErr={leaveErr} onLeavesChanged={() => { loadLeaves(); reload(); }}
              display={display} onDisplay={setDisplay}
              onStaffChanged={() => { loadStaff(); reload(); }}
              onMenusChanged={loadMenus}
              onSettingsChanged={loadSettings}
              account={shop ? { shop, email, onShopChanged } : null} />
          )}
        </main>
      </div>
      {(tab === 'reserve' || tab === 'now') && (
        <button className="fab" aria-label="예약 추가"
          onClick={() => openCreate(activeStaff[0]?.id, 12 * 60)}>+</button>
      )}
      {pinFor && (
        <PinPad desc={`${pinFor === 'pay' ? '결제(정산)' : '설정'} 화면은 사장님만 열 수 있어요.`}
          onClose={() => setPinFor(null)}
          onOk={() => {
            const t = pinFor;
            setPinFor(null);
            setUnlocked(true);
            setTab(t);
          }} />
      )}
      {modal && (
        <ReservationModal init={modal} staff={staff} list={list} leaves={leaves} menus={menus} date={date}
          startH={startH} endH={endH} hidePrice={display.hidePrice}
          onClose={() => setModal(null)}
          onSaved={d => {
            setModal(null);
            // 다른 날로 저장했으면 보드를 그 날로 옮긴다 (날짜가 바뀌면 자동으로 다시 불러옴)
            if (d && d !== dateStr) { const [y, m, dd] = d.split('-').map(Number); setDate(new Date(y, m - 1, dd)); }
            else reload();
          }} />
      )}
    </div>
  );
}
