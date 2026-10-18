import { useEffect, useRef, useState } from 'react';
import { api, fmtDate, configured } from './api';
import { holdUpdate } from './lib/autoUpdate';
import { START_H, END_H, isActiveOn, worksOn } from './lib/constants';
import { BASE_FONT, loadDisplay } from './lib/display';
import { bizNow, bizToday, setDayEnd, nowMinutes, ceilTo, leaveOn, hitsLeave } from './lib/schedule';
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
const DIRTY_LOCK_MS = 15 * 60 * 1000; // 저장 안 한 설정이 있어도 이만큼 안 누르면 잠근다 (변경은 버림)

export default function App({ shop, email, onShopChanged }) {
  const [tab, setTab] = useState('reserve');
  const [unlocked, setUnlocked] = useState(!shop); // 매장(로그인) 없는 로컬 개발 모드는 잠금 없음
  const [pinFor, setPinFor] = useState(null); // PIN 입력 뒤 열 탭
  const [date, setDate] = useState(new Date());
  const [staff, setStaff] = useState([]);
  const [rawList, setList] = useState([]);
  const [listDate, setListDate] = useState(null); // rawList 가 어느 날 것인지
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
  // (기기가 잠들었다 깨도 지난 시간으로 판단: 화면 복귀·터치 때도 확인)
  const lastTouch = useRef(0); // 잠금 해제할 때 지금 시각으로 채움
  useEffect(() => {
    if (!shop || !unlocked) return;
    lastTouch.current = Date.now();
    const expired = () => {
      const idle = Date.now() - lastTouch.current;
      return idle >= IDLE_LOCK_MS && (!settingsDirty || idle >= DIRTY_LOCK_MS);
    };
    const relock = () => {
      setUnlocked(false);
      setPinFor(null);
      setTab(cur => (PIN_TABS.includes(cur) ? 'reserve' : cur));
    };
    const check = () => { if (expired()) relock(); };
    const touch = () => { if (expired()) relock(); else lastTouch.current = Date.now(); };
    const onVisible = () => document.visibilityState === 'visible' && check();
    const t = setInterval(check, 15000);
    ['pointerdown', 'keydown'].forEach(e => window.addEventListener(e, touch, true));
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      ['pointerdown', 'keydown'].forEach(e => window.removeEventListener(e, touch, true));
      document.removeEventListener('visibilitychange', onVisible);
    };
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
    document.documentElement.toggleAttribute('data-zoomed', scale > 1.05); // 글자 크게: 좁은 화면 상단바 줄이기
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

  const [listErr, setListErr] = useState('');
  const reqSeq = useRef(0);
  const reload = () => {
    const seq = ++reqSeq.current;
    const day = fmtDate(date);
    api.reservations(day)
      .then(l => { if (seq === reqSeq.current) { setList(l); setListDate(day); setListErr(''); } })
      // 같은 날 다시 불러오다 실패하면 보드를 비우지 않는다 — 빈 보드를 보고 겹치기 예약을 잡지 않게
      .catch(e => {
        if (seq !== reqSeq.current) return;
        if (listDate !== day) { setList([]); setListDate(day); }
        setListErr(`예약을 불러오지 못했어요 (${e.message || e}) — 화면이 최신이 아닐 수 있어요`);
      });
    const around = n => { const x = new Date(date); x.setDate(x.getDate() + n); return fmtDate(x); };
    api.reservationDates(around(-62), around(62)).then(d => setEventDates(new Set(d))).catch(() => {});
  };
  useEffect(reload, [date]);
  // 현황판은 다른 기기에서 바뀐 예약도 보이게 1분마다 새로 불러온다
  // 영업일이 바뀌면(밤새 켜 둔 태블릿) 오늘로 넘긴다
  useEffect(() => {
    if (tab !== 'now') return;
    const t = setInterval(() => {
      const today = bizNow().date;
      if (fmtDate(today) !== fmtDate(date)) setDate(today); else reload();
    }, 60000);
    return () => clearInterval(t);
  }, [tab, date]);

  const startH = settings ? Math.floor(settings.openMin / 60) : START_H;
  const endH = settings ? Math.ceil(settings.closeMin / 60) : END_H;

  // 보드/모달은 그 날짜 재직자만, 결제는 그 날 예약이 있는 퇴사자도 포함
  const dateStr = fmtDate(date);
  // 날짜를 바꾼 직후 새 날 예약이 오기 전에는 이전 날 예약을 보여 주지 않는다 (엉뚱한 날 예약을 누르지 않게)
  const list = listDate === dateStr ? rawList : [];
  const listLoading = listDate !== dateStr;
  // 새 매장: 처음 할 일 안내 (다 하면 사라짐)
  const setupTodo = [
    !menus.some(m => (m.prices || []).some(p => p > 0)) && '메뉴 가격 정하기',
    staff.length <= 1 && '담당자 추가하기',
  ].filter(Boolean);
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
          {listErr && <p className="notice">{listErr}</p>}
          {tab === 'reserve' && (<>
            {dateHead}
            {setupTodo.length > 0 && (
              <div className="setup-hint" role="note">
                <b>처음 설정</b>
                <span>{setupTodo.join(' · ')}</span>
                <button type="button" onClick={() => changeTab('settings')}>설정 열기</button>
              </div>
            )}
            <div className={listLoading ? 'is-loading' : undefined} style={{ display: 'contents' }}>
            <DaySummary staff={activeStaff} list={list} leaves={leaves} date={date} openMin={startH * 60} closeMin={endH * 60} />
            <Board staff={activeStaff} list={list} date={date} startH={startH} endH={endH}
              hourPx={display.hourPx} halfLine={display.halfLine} leaves={leaves}
              onCellClick={openCreate} onBlockClick={r => setModal(r)} />
            </div>
          </>)}
          {tab === 'now' && (
            <div className={listLoading ? 'is-loading' : undefined} style={{ display: 'contents' }}>
            <NowPage staff={activeStaff} list={list} leaves={leaves} menus={menus}
              openMin={startH * 60} closeMin={endH * 60}
              onCreate={openCreate} onOpen={r => setModal(r)} onChanged={reload} />
            </div>
          )}
          {tab === 'pay' && (<>
            {dateHead}
            <div className={listLoading ? 'is-loading' : undefined} style={{ display: 'contents' }}>
              <PayrollPage staff={payStaff} list={list} />
            </div>
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
      {tab === 'reserve' && (
        <button className="fab" aria-label="예약 추가" disabled={listLoading}
          onClick={() => {
            const isToday = dateStr === bizToday();
            const want = isToday ? ceilTo(nowMinutes(), 10) : 12 * 60;
            const at = Math.min(Math.max(want, startH * 60), endH * 60 - 30);
            // 그 날 일하고, 종일 휴가가 아니고, 그 시각 1시간이 비어 있는 첫 담당자 (없으면 일하는 첫 사람)
            const works = activeStaff.filter(s => worksOn(s, date.getDay()) && !leaveOn(leaves, s.id, dateStr).full);
            const free = works.find(s => !list.some(r => r.staffId === s.id && at < r.startMin + r.durationMin && r.startMin < at + 60)
              && !hitsLeave(leaveOn(leaves, s.id, dateStr), at, 60));
            openCreate((free ?? works[0] ?? activeStaff[0])?.id, at);
          }}>+</button>
      )}
      {pinFor && (
        <PinPad email={email} desc={`${pinFor === 'pay' ? '결제(정산)' : '설정'} 화면은 사장님만 열 수 있어요.`}
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
            // (지금 탭은 늘 오늘이라 그대로 두고 다시 불러오기만)
            if (d && d !== dateStr && tab !== 'now') { const [y, m, dd] = d.split('-').map(Number); setDate(new Date(y, m - 1, dd)); }
            else reload();
          }} />
      )}
    </div>
  );
}
