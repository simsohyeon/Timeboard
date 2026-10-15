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
const RESV_COLS = RESV_BASE + ',done';
const NO_DONE_MSG = '완료 표시용 칸(reservation.done)이 없어요 — supabase/setup.sql 최신 버전을 실행하세요';
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

export const api = {
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
    const q = cols => supabase.from('reservation').select(cols).eq('date', date).order('start_min');
    const res = await q(RESV_COLS);
    // setup.sql 을 아직 안 돌려 done 칸이 없으면, 완료 표시 없이라도 보드는 보이게
    if (res.error?.code === '42703') return rows(await q(RESV_BASE)).map(r => ({ ...r, done: false }));
    return rows(res);
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
    return rows(await supabase.from('reservation').select(RESV_COLS)
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
    return rows(await supabase.from('reservation').insert(toRow(r)).select('id'));
  },

  updateReservation: async (id, r) => {
    need();
    return rows(await supabase.from('reservation').update(toRow(r)).eq('id', id).select('id'));
  },

  deleteReservation: async id => {
    need();
    const { error } = await supabase.from('reservation').delete().eq('id', id);
    if (error) throw error;
  },

  // ───── 설정 (업무시간) ─────
  settings: async () =>
    supabase
      ? (rows(await supabase.from('settings').select('openMin:open_min,closeMin:close_min').eq('id', 1))[0] ?? null)
      : null,

  updateSettings: async s => {
    need();
    const d = rows(await supabase.from('settings')
      .update({ open_min: s.openMin, close_min: s.closeMin }).eq('id', 1).select());
    if (!d.length) throw new Error('settings 테이블이 없어요 — supabase/setup.sql 최신 버전을 실행하세요');
    return d;
  },
};

// 카멜케이스 → DB 컬럼명
const toRow = r => ({
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
