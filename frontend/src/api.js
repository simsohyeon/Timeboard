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

const RESV_COLS = 'id,staffId:staff_id,date,startMin:start_min,durationMin:duration_min,title,subtitle,price';
const STAFF_COLS = 'id,name,dotColor:dot_color,sortOrder:sort_order';
const MENU_COLS = 'id,name,durations,prices,sortOrder:sort_order';

export const api = {
  // ───── 담당자 ─────
  staff: async () =>
    supabase ? rows(await supabase.from('staff').select(STAFF_COLS).order('sort_order')) : [],

  createStaff: async s => {
    need();
    return rows(await supabase.from('staff')
      .insert({ name: s.name, dot_color: s.dotColor, sort_order: s.sortOrder ?? 0 }).select());
  },

  updateStaff: async (id, s) => {
    need();
    return rows(await supabase.from('staff')
      .update({ name: s.name, dot_color: s.dotColor, sort_order: s.sortOrder ?? 0 }).eq('id', id).select());
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
  reservations: async date =>
    supabase
      ? rows(await supabase.from('reservation').select(RESV_COLS).eq('date', date).order('start_min'))
      : [],

  reservationDates: async () =>
    supabase
      ? [...new Set(rows(await supabase.from('reservation').select('date')).map(r => r.date))]
      : [],

  createReservation: async r => {
    need();
    return rows(await supabase.from('reservation').insert(toRow(r)).select(RESV_COLS));
  },

  updateReservation: async (id, r) => {
    need();
    return rows(await supabase.from('reservation').update(toRow(r)).eq('id', id).select(RESV_COLS));
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
