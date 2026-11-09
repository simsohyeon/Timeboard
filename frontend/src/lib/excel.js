// 예약 ↔ 엑셀 변환 (내보내기 표 만들기, 올린 표 읽어서 바뀐 내용 계산). 화면은 components/ExcelPanel.jsx
import { worksOn, minLabel } from './constants';
import { leaveOn, hitsLeave } from './schedule';

export const HEADERS = ['예약번호', '날짜', '시작', '시간(분)', '담당자', '메뉴', '손님', '금액', '초이스', '완료'];
const pad = n => String(n).padStart(2, '0');
// 영업일 기준 분 → "14:30" (자정 넘은 새벽은 "25:30" 처럼 24를 더해 그 영업일에 붙인다)
export const hhmm = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// 내보내기: 머리줄 + 예약 줄 (날짜·시간은 엑셀이 멋대로 바꾸지 않게 글자로)
export function toSheet(rows, staffName) {
  return [
    HEADERS,
    ...rows.map(r => [
      r.id, r.date, hhmm(r.startMin), r.durationMin, staffName(r.staffId), r.subtitle || '', r.title || '',
      r.price || 0, r.choice ? 'O' : '', r.done ? 'O' : '',
    ]),
  ];
}

// ───── 읽기: 엑셀 칸 값 → 우리 값 ─────
const ymd = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

function readDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : ymd(v);
  if (typeof v === 'number' && v > 20000) return ymd(new Date(EXCEL_EPOCH + Math.round(v) * 864e5)); // 엑셀 날짜 번호
  const m = String(v).trim().match(/^(\d{4})[-./ ]\s*(\d{1,2})[-./ ]\s*(\d{1,2})\.?$/);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? ymd(dt) : null; // 2월 30일 같은 날짜는 거름
}

// "14:30" · "오후 2:30" · 엑셀 시간(0.6041…) · Date(1899-12-30T14:30) → 분
function readTime(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === 'number') return v >= 0 && v < 2 ? Math.round(v * 1440) : null;
  const s = String(v).trim();
  const m = s.match(/^(오전|오후|새벽|AM|PM)?\s*(\d{1,2})\s*[:시]\s*(\d{1,2})?\s*분?$/i);
  if (!m) return null;
  let h = +m[2]; const mi = m[3] ? +m[3] : 0;
  const ap = (m[1] || '').toUpperCase();
  if ((ap === '오후' || ap === 'PM') && h < 12) h += 12;
  if ((ap === '오전' || ap === 'AM') && h === 12) h = 0;
  if (ap === '새벽') h += 24;
  if (mi > 59 || h > 47) return null;
  return h * 60 + mi;
}
const readInt = v => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,원\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
};
const readFlag = v => v === true || /^(o|y|yes|예|1|true|v|✓|ㅇ)$/i.test(String(v ?? '').trim());
const text = v => (v == null ? '' : String(v).trim());

// ───── 올린 표 → 바뀔 내용 ─────
// 반환: [{ line, kind: 'update'|'create'|'same'|'error', row(새 값), before(기존 예약), changes:[{field,from,to}], problems:[], warnings:[] }]
export function planImport(sheet, { existing, staff, leaves, openMin, closeMin, dayList }) {
  const head = (sheet[0] || []).map(text);
  const col = name => head.indexOf(name);
  const missing = HEADERS.filter(h => !['예약번호', '초이스', '완료', '금액', '메뉴', '손님'].includes(h) && col(h) < 0);
  if (missing.length) throw new Error(`첫 줄에 '${missing.join("', '")}' 칸이 없어요 — 내보내기로 받은 파일을 고쳐서 올려 주세요`);
  const get = (r, name) => (col(name) < 0 ? null : r[col(name)]);
  const byId = new Map(existing.map(r => [r.id, r]));
  const staffByName = new Map();
  for (const s of staff) staffByName.set(s.name.trim(), staffByName.has(s.name.trim()) ? 'dup' : s);
  const staffName = id => staff.find(s => s.id === id)?.name ?? '';
  const seenIds = new Set();

  const plans = sheet.slice(1).map((r, i) => {
    const line = i + 2;
    if (!r || r.every(v => v == null || String(v).trim() === '')) return null; // 빈 줄
    const problems = [], warnings = [];
    const idRaw = get(r, '예약번호');
    const id = idRaw == null || idRaw === '' ? null : readInt(idRaw);
    const before = id != null ? byId.get(id) : null;
    if (id != null && (Number.isNaN(id) || !before)) problems.push('예약번호를 찾을 수 없어요 (새 예약이면 예약번호 칸을 비워 주세요)');
    if (id != null && seenIds.has(id)) problems.push('같은 예약번호가 두 번 있어요');
    if (id != null) seenIds.add(id);

    const date = readDate(get(r, '날짜'));
    if (!date) problems.push(`날짜를 읽을 수 없어요 (예: 2026-11-09) — '${text(get(r, '날짜'))}'`);
    let startMin = readTime(get(r, '시작'));
    if (startMin == null) problems.push(`시작 시각을 읽을 수 없어요 (예: 14:30) — '${text(get(r, '시작'))}'`);
    // 자정 넘어 영업: 새벽 1:30 을 "01:30" 으로 적었으면 그 영업일의 25:30 으로
    if (startMin != null && startMin < openMin && closeMin > 1440 && startMin + 1440 < closeMin) startMin += 1440;
    const durationMin = readInt(get(r, '시간(분)'));
    if (!durationMin || durationMin <= 0 || durationMin > 720) problems.push(`시간(분)이 이상해요 — '${text(get(r, '시간(분)'))}'`);
    const sName = text(get(r, '담당자'));
    const st = sName ? staffByName.get(sName) : null;
    if (sName && !st) problems.push(`'${sName}' 담당자가 없어요`);
    if (st === 'dup') problems.push(`'${sName}' 이름의 담당자가 둘이에요 — 설정에서 이름을 다르게 해 주세요`);
    const staffId = st && st !== 'dup' ? st.id : null; // 비우면 담당자 미정
    const price = col('금액') < 0 ? (before?.price ?? 0) : (readInt(get(r, '금액')) ?? 0);
    if (Number.isNaN(price) || price < 0) problems.push(`금액이 이상해요 — '${text(get(r, '금액'))}'`);

    const row = {
      date, startMin, durationMin, staffId,
      subtitle: col('메뉴') < 0 ? (before?.subtitle ?? '') : text(get(r, '메뉴')),
      title: col('손님') < 0 ? (before?.title ?? '') : (text(get(r, '손님')) || '고객 등록 필요'),
      price: Number.isNaN(price) ? 0 : price,
      choice: col('초이스') < 0 ? !!before?.choice : readFlag(get(r, '초이스')),
      done: col('완료') < 0 ? !!before?.done : readFlag(get(r, '완료')),
    };

    if (!problems.length) {
      if (startMin < openMin || startMin >= closeMin) problems.push(`영업시간(${minLabel(openMin)}–${minLabel(closeMin)}) 밖이에요`);
      else if (startMin + durationMin > closeMin) problems.push(`마감(${minLabel(closeMin)})을 넘겨서 끝나요`);
      if (staffId != null) {
        const s = staff.find(x => x.id === staffId);
        const dow = new Date(`${date}T00:00:00`).getDay();
        if (hitsLeave(leaveOn(leaves, staffId, date), startMin, durationMin)) problems.push(`${s.name} 휴가 시간이에요`);
        else if (!worksOn(s, dow)) warnings.push(`${s.name} 휴무일이에요`);
      }
    }

    // 바뀐 칸
    const FIELDS = [['date', '날짜', v => v], ['startMin', '시작', v => (v == null ? '' : hhmm(v))], ['durationMin', '시간', v => `${v}분`],
      ['staffId', '담당자', v => (v == null ? '미정' : staffName(v))], ['subtitle', '메뉴', v => v || ''], ['title', '손님', v => v || ''],
      ['price', '금액', v => `${(v || 0).toLocaleString()}원`], ['choice', '초이스', v => (v ? 'O' : '-')], ['done', '완료', v => (v ? 'O' : '-')]];
    const changes = before ? FIELDS.filter(([k]) => (before[k] ?? null) !== (row[k] ?? null) && !(k === 'staffId' && before[k] == null && row[k] == null))
      .map(([k, label, f]) => ({ field: k, label, from: f(before[k]), to: f(row[k]) })) : [];
    const kind = problems.length ? 'error' : !before ? 'create' : changes.length ? 'update' : 'same';
    return { line, kind, id: before?.id ?? null, row, before, changes, problems, warnings };
  }).filter(Boolean);

  // 겹침: 적용 뒤 모습(바뀌는 예약은 새 값, 그대로인 예약은 기존 값)으로 같은 담당자·같은 날 겹치는지
  const touched = new Set(plans.filter(p => p.id != null && p.kind !== 'error').map(p => p.id));
  const after = [
    ...dayList.filter(r => !touched.has(r.id)).map(r => ({ ...r, line: null })),
    ...plans.filter(p => p.kind === 'update' || p.kind === 'create' || p.kind === 'same').map(p => ({ ...p.row, id: p.id, line: p.line })),
  ];
  for (const p of plans) {
    if (p.kind !== 'update' && p.kind !== 'create') continue;
    if (p.row.staffId == null) continue;
    const hit = after.find(o => o.line !== p.line && o.staffId === p.row.staffId && o.date === p.row.date
      && p.row.startMin < o.startMin + o.durationMin && o.startMin < p.row.startMin + p.row.durationMin);
    if (hit) p.warnings.push(`${hhmm(hit.startMin)} ${hit.title || ''} 예약과 겹쳐요${hit.line ? ` (${hit.line}번째 줄)` : ''}`);
  }
  return plans;
}
