// 개발용 가짜 Supabase — `npm run dev:mock` 일 때만 쓴다 (배포 빌드에는 들어가지 않음)
// 실제 DB 대신 브라우저(localStorage)에 샘플 매장 데이터를 두고 PostgREST·Auth 요청을 흉내 낸다.
// 아무 이메일·비밀번호(6자 이상)로 로그인, 사장님 PIN 1234. 데이터 초기화: 주소 뒤에 ?mock-reset

const KEY = 'tb-mock-db';
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function seed() {
  const today = ymd(new Date());
  const all = [0, 1, 2, 3, 4, 5, 6];
  const st = (id, name, color, order, extra = {}) => ({
    id, name, dot_color: color, sort_order: order, joined_on: null, left_on: null, commission_pct: 40,
    work_days: all, work_open_min: null, work_close_min: null, phone: '', memo: '', ...extra,
  });
  const r = (id, staff_id, start_min, duration_min, title, subtitle, price, extra = {}) => ({
    id, staff_id, date: today, start_min, duration_min, title, subtitle, price, done: false, choice: false, ...extra,
  });
  return {
    nextId: 1000,
    pin: '1234',
    shop: [{ id: 'shop-1', name: '샘플 마사지' }],
    staff: [
      st(1, '사장님', '#4a90d9', 0, { commission_pct: 0 }), st(2, '민지', '#e8743b', 1),
      st(3, '수아', '#19a979', 2), st(4, '지훈', '#945ecf', 3),
    ],
    menu: [
      { id: 1, name: '타이', durations: [60, 90, 120], prices: [50000, 70000, 90000], sort_order: 0 },
      { id: 2, name: '아로마', durations: [60, 90, 120], prices: [60000, 80000, 100000], sort_order: 1 },
    ],
    reservation: [
      r(1, 1, 660, 90, '김민수', '타이 90분', 70000, { done: true, choice: true }),
      r(2, 2, 720, 60, '이서연', '아로마 60분', 60000),
      r(3, 3, 840, 90, '박지민', '타이 90분', 70000, { choice: true }),
      r(4, 4, 900, 120, '최유진', '아로마 120분', 100000),
    ],
    staff_leave: [],
    settings: [{ id: 1, shop_id: 'shop-1', open_min: 600, close_min: 1320 }],
  };
}

const load = () => {
  try {
    if (new URLSearchParams(location.search).has('mock-reset')) localStorage.removeItem(KEY);
    return JSON.parse(localStorage.getItem(KEY)) || seed();
  } catch { return seed(); }
};
// 처음 요청 때 불러온다 (이 파일을 불러오기만 해서는 아무 일도 안 일어나게 — 배포 빌드에서 통째로 빠지도록)
let db = null;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장 실패해도 동작 */ } };

const json = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const user = email => ({
  id: 'mock-user', aud: 'authenticated', role: 'authenticated', email,
  email_confirmed_at: new Date().toISOString(), identities: [{ id: 'mock' }],
  app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
});
const session = email => ({
  access_token: 'mock-token', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh', user: user(email),
});

// select=a:b,c → [[결과 키, 칸]]
const parseSel = s => (s ? s.split(',').filter(x => x && x !== '*').map(x => {
  const [a, b] = x.split(':'); return b ? [a, b] : [a, a];
}) : null);
const project = (row, sel) => (sel ? Object.fromEntries(sel.map(([k, c]) => [k, row[c] ?? null])) : row);
const coerce = (v, sample) => (typeof sample === 'number' ? Number(v) : typeof sample === 'boolean' ? v === 'true' : v);
const SKIP = ['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'];
const match = (row, params) => params.every(([k, v]) => {
  if (SKIP.includes(k)) return true;
  const [op, ...rest] = v.split('.'); const val = rest.join('.'); const cur = row[k];
  if (op === 'eq') return String(cur) === String(coerce(val, cur));
  if (op === 'neq') return String(cur) !== String(coerce(val, cur));
  if (op === 'gte') return cur >= coerce(val, cur);
  if (op === 'lte') return cur <= coerce(val, cur);
  if (op === 'gt') return cur > coerce(val, cur);
  if (op === 'lt') return cur < coerce(val, cur);
  if (op === 'is') return val === 'null' ? cur == null : true;
  if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').includes(String(cur));
  return true;
});
const sortRows = (rows, order) => {
  if (!order) return rows;
  const keys = order.split(',').map(o => { const [c, dir] = o.split('.'); return [c, dir === 'desc' ? -1 : 1]; });
  return [...rows].sort((a, b) => {
    for (const [c, d] of keys) { if (a[c] < b[c]) return -d; if (a[c] > b[c]) return d; }
    return 0;
  });
};

export async function mockFetch(input, init = {}) {
  const u = new URL(typeof input === 'string' ? input : input.url);
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  let body = null;
  try { body = init.body ? JSON.parse(init.body) : null; } catch { body = null; }
  const p = u.pathname;
  if (!db) { db = load(); save(); }
  await new Promise(r => setTimeout(r, 60)); // 실제처럼 약간 늦게

  // ───── 로그인 ─────
  if (p === '/auth/v1/token') {
    if (u.searchParams.get('grant_type') === 'refresh_token') return json(session(localStorage.getItem('tb-mock-email') || 'demo@test.com'));
    if (!body?.password || body.password.length < 6) return json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    localStorage.setItem('tb-mock-email', body.email);
    return json(session(body.email));
  }
  if (p === '/auth/v1/signup') { localStorage.setItem('tb-mock-email', body.email); return json(session(body.email)); }
  if (p === '/auth/v1/user') return json(user(localStorage.getItem('tb-mock-email') || 'demo@test.com'));
  if (p === '/auth/v1/logout') return json(null, 204);
  if (p === '/auth/v1/recover' || p === '/auth/v1/resend') return json({});

  // ───── 함수 ─────
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.split('/').pop();
    if (fn === 'verify_pin') return json(body.p_pin === db.pin);
    if (fn === 'set_pin') { const ok = body.p_old === db.pin; if (ok) { db.pin = body.p_new; save(); } return json(ok); }
    if (fn === 'reset_pin') { db.pin = body.p_new; save(); return json(null); }
    if (fn === 'rename_shop') { db.shop[0].name = body.p_name; save(); return json(null); }
    if (fn === 'create_shop') return json('shop-1');
    return json({ code: 'PGRST202', message: `mock: ${fn} 없음` }, 404);
  }

  // ───── 표 ─────
  const t = p.replace('/rest/v1/', '');
  if (!db[t]) return json({ code: 'PGRST205', message: `Could not find the table 'public.${t}'` }, 404);
  const params = [...u.searchParams.entries()];
  const sel = parseSel(u.searchParams.get('select'));
  const single = (headers.get('accept') || '').includes('vnd.pgrst.object');
  const reply = rows => {
    const out = rows.map(r => project(r, sel));
    if (single) return out.length === 1 ? json(out[0]) : json({ code: 'PGRST116', message: 'rows != 1' }, 406);
    return json(out);
  };
  if (method === 'GET' || method === 'HEAD') {
    let rows = sortRows(db[t].filter(r => match(r, params)), u.searchParams.get('order'));
    const lim = u.searchParams.get('limit'); if (lim) rows = rows.slice(0, Number(lim));
    return reply(rows);
  }
  if (method === 'POST') {
    const items = (Array.isArray(body) ? body : [body]).map(x => ({ id: db.nextId++, ...x }));
    db[t].push(...items); save();
    return reply(items);
  }
  if (method === 'PATCH') {
    const hit = db[t].filter(r => match(r, params));
    hit.forEach(r => Object.assign(r, body)); save();
    return reply(hit);
  }
  if (method === 'DELETE') {
    const hit = db[t].filter(r => match(r, params));
    db[t] = db[t].filter(r => !hit.includes(r)); save();
    return reply(hit);
  }
  return json({}, 405);
}
