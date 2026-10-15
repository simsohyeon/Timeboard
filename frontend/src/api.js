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
};

export const fmtDate = d =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
