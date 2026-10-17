// 데이터 접근은 전부 이 파일을 거친다 — Supabase 직결 (TraderNote 방식)
// frontend/.env 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 필요 (.env.example 참고)
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : null;
export const configured = !!supabase;
if (!supabase) console.warn('Supabase 미설정: frontend/.env 를 채우세요 (.env.example 참고)');

const rows = ({ data, error }) => {
  if (error) throw error;
  return data;
};

const need = () => { if (!supabase) throw new Error('Supabase 미설정 (frontend/.env)'); };

const RESV_BASE = 'id,staffId:staff_id,date,startMin:start_min,durationMin:duration_min,title,subtitle,price';
const RESV_COLS = RESV_BASE + ',done,choice';
const NO_DONE_MSG = '완료 표시용 칸(reservation.done)이 없어요 — supabase/setup.sql 최신 버전을 실행하세요';
const NO_CHOICE_MSG = '초이스 표시용 칸(reservation.choice)이 없어요 — supabase/setup.sql 최신 버전을 SQL Editor에서 실행하세요';
let hasChoice = true; // reservation.choice 칸이 있는지 (읽어 보고 알게 됨)

// 새 칸(done·choice)이 아직 없는 DB에서도 보드는 보이게: 없는 칸을 빼고 다시 읽는다
const selectResv = async q => {
  let res = await q(RESV_COLS);
  if (res.error?.code !== '42703') { if (!res.error) hasChoice = true; return rows(res); }
  hasChoice = false;
  res = await q(RESV_BASE + ',done');
  if (res.error?.code !== '42703') return rows(res).map(r => ({ ...r, choice: false }));
  return rows(await q(RESV_BASE)).map(r => ({ ...r, done: false, choice: false }));
};
const STAFF_COLS = 'id,name,dotColor:dot_color,sortOrder:sort_order,joinedOn:joined_on,leftOn:left_on,'
  + 'commissionPct:commission_pct,workDays:work_days,workOpenMin:work_open_min,workCloseMin:work_close_min,phone,memo';
const LEAVE_COLS = 'id,staffId:staff_id,startDate:start_date,endDate:end_date,startMin:start_min,endMin:end_min,reason';
const NO_LEAVE_MSG = '휴가 기능용 표(staff_leave)가 없어요 — supabase/setup.sql 최신 버전을 SQL Editor에서 실행하세요';
const MENU_COLS = 'id,name,durations,prices,sortOrder:sort_order';

const staffRow = s => ({
  name: s.name, dot_color: s.dotColor, sort_order: s.sortOrder ?? 0,
  joined_on: s.joinedOn || null, left_on: s.leftOn || null,
  commission_pct: s.commissionPct ?? 0,
  work_days: s.workDays ?? [0, 1, 2, 3, 4, 5, 6],
  work_open_min: s.workOpenMin ?? null, work_close_min: s.workCloseMin ?? null,
  phone: s.phone ?? '', memo: s.memo ?? '',
});

const NO_SHOP_MSG = '계정·매장 표(shop)가 없어요 — supabase/accounts.sql 을 SQL Editor에서 실행하세요';
let shopId = null; // 로그인한 계정의 매장 (myShop 이 채움)

// 로그인 오류를 한국어로
const AUTH_MSG = [
  [/invalid login credentials/i, '이메일 또는 비밀번호가 맞지 않아요'],
  [/email not confirmed/i, '메일 인증이 아직이에요 — 받은 메일의 링크를 먼저 눌러 주세요'],
  [/already registered|already been registered/i, '이미 가입된 이메일이에요 — 로그인해 주세요'],
  [/password should be at least/i, '비밀번호는 6자 이상이어야 해요'],
  [/unable to validate email|invalid email|email address .* is invalid/i, '이메일 주소를 확인해 주세요'],
  [/rate limit|too many/i, '잠시 뒤에 다시 해 주세요 (요청이 너무 많아요)'],
];
const authErr = e => {
  const m = e?.message || String(e);
  return new Error(AUTH_MSG.find(([re]) => re.test(m))?.[1] ?? m);
};
const authed = ({ data, error }) => { if (error) throw authErr(error); return data; };
// rpc 오류: 함수 안에서 낸 한국어 메시지는 그대로, 함수가 없으면 SQL 안내
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.code === 'PGRST202' || error.code === '42883'
    ? (fn === 'reset_pin' ? 'PIN 다시 정하기 함수가 없어요 — supabase/hardening.sql 을 SQL Editor에서 실행하세요' : NO_SHOP_MSG)
    : error.message);
  return data;
};

export const auth = {
  session: async () => (supabase ? (await supabase.auth.getSession()).data.session : null),
  onChange: cb => supabase?.auth.onAuthStateChange((_e, s) => cb(s)).data.subscription,
  signIn: async (email, password) => authed(await supabase.auth.signInWithPassword({ email, password })),
  // 메일 인증을 켜 둔 프로젝트면 session 이 비어서 온다 → 화면에서 '메일 확인' 안내
  signUp: async (email, password) => authed(await supabase.auth.signUp({
    email, password, options: { emailRedirectTo: window.location.origin },
  })),
  signOut: async () => { shopId = null; await supabase.auth.signOut(); },
};

export const api = {
  // ───── 매장 (계정 1개 = 매장 1개) ─────
  myShop: async () => {
    const res = await supabase.from('shop').select('id,name').maybeSingle();
    if (res.error && ['42P01', 'PGRST205'].includes(res.error.code)) throw new Error(NO_SHOP_MSG);
    const s = rows(res);
    shopId = s?.id ?? null;
    return s;
  },
  createShop: (name, pin) => rpc('create_shop', { p_name: name, p_pin: pin }),
  verifyPin: pin => rpc('verify_pin', { p_pin: pin }),
  setPin: (oldPin, newPin) => rpc('set_pin', { p_old: oldPin, p_new: newPin }),
  renameShop: name => rpc('rename_shop', { p_name: name }),
  // PIN을 잊었을 때: 비밀번호로 다시 로그인한 직후에만 DB가 새 PIN을 받아 준다
  resetPin: async (email, password, pin) => {
    await auth.signIn(email, password);
    return rpc('reset_pin', { p_new: pin });
  },

  // ───── 담당자 ─────
  staff: async () => {
    if (!supabase) return [];
    const res = await supabase.from('staff').select(STAFF_COLS).order('sort_order');
    if (res.error?.code === '42703') throw new Error('staff 테이블에 새 컬럼이 없어요 — supabase/setup.sql 최신 버전을 실행하세요');
    return rows(res);
  },

  createStaff: async s => {
    need();
    return rows(await supabase.from('staff').insert(staffRow(s)).select());
  },

  updateStaff: async (id, s) => {
    need();
    return rows(await supabase.from('staff').update(staffRow(s)).eq('id', id).select());
  },

  deleteStaff: async id => {
    need();
    const { error } = await supabase.from('staff').delete().eq('id', id);
    if (error) throw error;
  },

  // ───── 메뉴 ─────
  menus: async () =>
    supabase ? rows(await supabase.from('menu').select(MENU_COLS).order('sort_order')) : [],

  createMenu: async m => {
    need();
    return rows(await supabase.from('menu').insert({
      name: m.name, durations: m.durations,
      prices: m.prices ?? m.durations.map(() => 0),
      sort_order: m.sortOrder ?? 0,
    }).select());
  },

  updateMenu: async (id, m) => {
    need();
    return rows(await supabase.from('menu')
      .update({ name: m.name, durations: m.durations, prices: m.prices ?? [] }).eq('id', id).select());
  },

  deleteMenu: async id => {
    need();
    const { error } = await supabase.from('menu').delete().eq('id', id);
    if (error) throw error;
  },

  // ───── 예약 ─────
  reservations: async date => {
    if (!supabase) return [];
    return selectResv(cols => supabase.from('reservation').select(cols).eq('date', date).order('start_min'));
  },

  setReservationDone: async (id, done) => {
    need();
    const res = await supabase.from('reservation').update({ done }).eq('id', id).select('id');
    if (res.error?.code === '42703' || res.error?.code === 'PGRST204') throw new Error(NO_DONE_MSG);
    return rows(res);
  },

  // 기간 안의 예약 전부 (휴가 등록 시 겹치는 예약 찾기)
  reservationsRange: async (from, to) => {
    if (!supabase) return [];
    return selectResv(cols => supabase.from('reservation').select(cols)
      .gte('date', from).lte('date', to).order('date').order('start_min'));
  },

  // ───── 휴가 ─────
  leaves: async () => {
    if (!supabase) return [];
    const res = await supabase.from('staff_leave').select(LEAVE_COLS).order('start_date');
    if (res.error && ['42P01', 'PGRST205'].includes(res.error.code)) throw new Error(NO_LEAVE_MSG);
    return rows(res);
  },

  createLeave: async l => {
    need();
    const res = await supabase.from('staff_leave').insert({
      staff_id: l.staffId, start_date: l.startDate, end_date: l.endDate,
      start_min: l.startMin ?? null, end_min: l.endMin ?? null, reason: l.reason ?? '',
    }).select(LEAVE_COLS);
    if (res.error && ['42P01', 'PGRST205'].includes(res.error.code)) throw new Error(NO_LEAVE_MSG);
    return rows(res)[0];
  },

  deleteLeave: async id => {
    need();
    const { error } = await supabase.from('staff_leave').delete().eq('id', id);
    if (error) throw error;
  },

  // 최근 예약의 고객명 (예약 등록 창의 '최근 손님' 빠른 입력용)
  recentCustomers: async () => {
    if (!supabase) return [];
    const data = rows(await supabase.from('reservation').select('title').order('id', { ascending: false }).limit(200));
    return [...new Set(data.map(r => (r.title || '').trim()).filter(t => t && t !== '고객 등록 필요'))];
  },

  reservationDates: async () =>
    supabase
      ? [...new Set(rows(await supabase.from('reservation').select('date')).map(r => r.date))]
      : [],

  createReservation: async r => {
    need();
    return resvWrite(await supabase.from('reservation').insert(toRow(r)).select('id'));
  },

  updateReservation: async (id, r) => {
    need();
    return resvWrite(await supabase.from('reservation').update(toRow(r)).eq('id', id).select('id'));
  },

  deleteReservation: async id => {
    need();
    const { error } = await supabase.from('reservation').delete().eq('id', id);
    if (error) throw error;
  },

  // ───── 설정 (업무시간) ─────
  settings: async () =>
    supabase
      ? (rows(await supabase.from('settings').select('openMin:open_min,closeMin:close_min').limit(1))[0] ?? null)
      : null,

  updateSettings: async s => {
    need();
    // 내 매장 줄 (다른 매장 줄은 DB 규칙상 보이지도 않음)
    const d = rows(await supabase.from('settings')
      .update({ open_min: s.openMin, close_min: s.closeMin }).eq('shop_id', shopId).select());
    if (!d.length) throw new Error('settings 테이블이 없어요 — supabase/setup.sql 최신 버전을 실행하세요');
    return d;
  },
};

const resvWrite = res => {
  if (res.error?.code === '42703' || res.error?.code === 'PGRST204') throw new Error(NO_CHOICE_MSG);
  return rows(res);
};

// 카멜케이스 → DB 컬럼명
// choice 칸이 없는 DB면 초이스가 아닐 때는 빼고 보내 저장은 되게 (초이스로 저장하려 할 때만 안내)
const toRow = r => ({
  ...(hasChoice || r.choice ? { choice: !!r.choice } : {}),
  staff_id: r.staffId,
  date: r.date,
  start_min: r.startMin,
  duration_min: r.durationMin,
  title: r.title,
  subtitle: r.subtitle ?? '',
  price: r.price ?? 0,
});

export const fmtDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
