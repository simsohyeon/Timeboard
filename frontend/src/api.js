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

const RESV_COLS = 'id,staffId:staff_id,date,startMin:start_min,durationMin:duration_min,title,subtitle';

export const api = {
  staff: async () =>
    supabase
      ? rows(await supabase.from('staff')
          .select('id,name,dotColor:dot_color,sortOrder:sort_order')
          .order('sort_order'))
      : [],

  reservations: async date =>
    supabase
      ? rows(await supabase.from('reservation')
          .select(RESV_COLS)
          .eq('date', date)
          .order('start_min'))
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
};

const need = () => { if (!supabase) throw new Error('Supabase 미설정 (frontend/.env)'); };

// 카멜케이스 → DB 컬럼명
const toRow = r => ({
  staff_id: r.staffId,
  date: r.date,
  start_min: r.startMin,
  duration_min: r.durationMin,
  title: r.title,
  subtitle: r.subtitle ?? '',
});

export const fmtDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
