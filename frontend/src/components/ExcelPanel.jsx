import { useRef, useState } from 'react';
import { api, fmtDate } from '../api';
import { bizToday } from '../lib/schedule';
import { toSheet, planImport, hhmm, infoSheet, readInfo, INFO_SHEET } from '../lib/excel';
import DatePicker from './DatePicker';

// 설정 > 엑셀: 예약을 엑셀로 내려받고, 고친 엑셀을 올려 한꺼번에 바꾸기
// 올리면 바로 바뀌지 않는다 — 바뀔 내용을 먼저 보여 주고 [적용]을 눌러야 저장. 엑셀에서 지운 줄은 삭제하지 않는다.
const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return fmtDate(new Date(y, m - 1, d + n)); };
const KIND = { update: ['수정', 'up'], create: ['새 예약', 'new'], error: ['문제', 'err'], same: ['그대로', 'same'], delete: ['삭제', 'del'] };

export default function ExcelPanel({ staff, leaves, openMin, closeMin, onChanged }) {
  const today = bizToday();
  const [from, setFrom] = useState(addDays(today, -7));
  const [to, setTo] = useState(addDays(today, 30));
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }
  const [plan, setPlan] = useState(null); // { file, items, canDelete }
  const [withDelete, setWithDelete] = useState(false); // 엑셀에서 지운 예약도 삭제 (직접 켜야)
  const fileRef = useRef(null);
  const staffName = id => staff.find(s => s.id === id)?.name ?? '';

  const exportXlsx = async () => {
    if (to < from) return setMsg({ ok: false, text: '끝 날짜가 시작 날짜보다 빨라요' });
    setBusy('export'); setMsg(null);
    try {
      const rows = await api.reservationsRange(from, to);
      const { default: writeExcelFile } = await import('write-excel-file/browser');
      const widths = [10, 12, 8, 9, 10, 14, 16, 10, 7, 7];
      await writeExcelFile([
        { data: toSheet(rows, staffName), sheet: '예약', columns: widths.map(width => ({ width })), stickyRowsCount: 1 },
        { data: infoSheet(rows.map(r => r.id), from, to), sheet: INFO_SHEET },
      ]).toFile(`timeboard_${from}_${to}.xlsx`); // 파일 이름은 영문 — 한글 이름은 일부 브라우저에서 'download' 로 바뀜
      setMsg({ ok: true, text: `${rows.length}건을 내려받았어요. 고친 뒤 아래 '엑셀 올리기'로 올려 주세요.` });
    } catch (e) { setMsg({ ok: false, text: `내려받지 못했어요 — ${e.message || e}` }); }
    setBusy('');
  };

  const readFile = async file => {
    if (!file) return;
    setBusy('read'); setMsg(null); setPlan(null); setWithDelete(false);
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('.xlsx 엑셀 파일만 올릴 수 있어요');
      if (file.size > 5 * 1024 * 1024) throw new Error('파일이 너무 커요 (5MB 까지)');
      const { readSheet } = await import('read-excel-file/browser');
      const sheet = await readSheet(file, 1);
      // 두 번째 시트(내보낸 예약번호)가 있으면 '엑셀에서 지운 예약'을 찾을 수 있다. 없으면(예전 파일·직접 만든 파일) 삭제 안 함
      let info = null;
      try { info = readInfo(await readSheet(file, INFO_SHEET)); } catch { info = null; }
      if (sheet.length < 2) throw new Error('예약 줄이 없어요');
      if (sheet.length > 2001) throw new Error('한 번에 2000줄까지 올릴 수 있어요');
      // 파일에 있는 예약번호의 지금 값 + 파일 날짜 범위의 예약(겹침 확인용)
      const idCol = (sheet[0] || []).indexOf('예약번호');
      const fileIds = idCol < 0 ? [] : sheet.slice(1).map(r => Number(r[idCol])).filter(n => Number.isInteger(n) && n > 0);
      const ids = [...new Set([...fileIds, ...(info?.ids ?? [])])];
      const existing = await api.reservationsByIds(ids);
      const first = planImport(sheet, { existing, staff, leaves, openMin, closeMin, dayList: [] });
      const dates = first.map(p => p.row.date).filter(Boolean).sort();
      const dayList = dates.length ? await api.reservationsRange(dates[0], dates[dates.length - 1]) : [];
      const items = planImport(sheet, { existing, staff, leaves, openMin, closeMin, dayList, exportedIds: info?.ids ?? null });
      setPlan({ file: file.name, items, canDelete: !!info });
    } catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    setBusy('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const todo = plan ? plan.items.filter(p => p.kind === 'update' || p.kind === 'create' || (withDelete && p.kind === 'delete')) : [];
  const count = k => plan?.items.filter(p => p.kind === k).length ?? 0;

  const apply = async () => {
    if (!todo.length) return;
    const del = withDelete ? count('delete') : 0;
    if (!window.confirm(`${todo.length}건을 적용할까요? (수정 ${count('update')}건 · 새 예약 ${count('create')}건${del ? ` · 삭제 ${del}건 — 삭제는 되돌릴 수 없어요` : ''})`)) return;
    setBusy('apply'); setMsg(null);
    const failed = [];
    for (const p of todo) { // 하나씩 — 실패한 줄만 알려 주기
      try {
        const { done, ...rest } = p.row;
        if (p.kind === 'delete') {
          await api.deleteReservation(p.id);
        } else if (p.kind === 'update') {
          await api.updateReservation(p.id, rest);
          if (!!p.before.done !== done) await api.setReservationDone(p.id, done);
        } else {
          const made = await api.createReservation(rest);
          if (done && made?.[0]?.id) await api.setReservationDone(made[0].id, true);
        }
      } catch (e) { failed.push(`${p.line}번째 줄: ${e.message || e}`); }
    }
    setBusy(''); setPlan(null); onChanged?.();
    setMsg(failed.length
      ? { ok: false, text: `${todo.length - failed.length}건 적용, ${failed.length}건 실패 — ${failed.slice(0, 3).join(' / ')}` }
      : { ok: true, text: `${todo.length}건을 적용했어요.` });
  };

  return (
    <div className="excel">
      <section className="set-grp">
        <div className="set-grp-h"><h3>1. 엑셀로 내려받기</h3></div>
        <div className="set-box pad xl-row">
          <DatePicker value={from} clearable={false} aria-label="시작 날짜" onChange={setFrom} />
          <span>~</span>
          <DatePicker value={to} clearable={false} aria-label="끝 날짜" onChange={setTo} />
          <button type="button" className="btn btn-primary" onClick={exportXlsx} disabled={!!busy}>
            {busy === 'export' ? '만드는 중…' : '엑셀 받기'}
          </button>
        </div>
      </section>

      <section className="set-grp">
        <div className="set-grp-h"><h3>2. 고친 엑셀 올리기</h3></div>
        <div className="set-box pad">
          <ul className="xl-help">
            <li>날짜·시작·시간(분)·담당자·메뉴·손님·금액·초이스·완료를 고칠 수 있어요. <b>예약번호는 고치지 마세요.</b></li>
            <li>새 예약은 줄을 추가하고 예약번호를 비워 두세요. 담당자를 비우면 '담당자 미정'이에요.</li>
            <li>엑셀에서 줄을 지우면, 올릴 때 <b>'지운 예약도 삭제'를 직접 켰을 때만</b> 삭제돼요. 초이스·완료는 O 로 표시해요.</li>
            <li>두 번째 시트 '내보낸 정보'는 지우거나 고치지 마세요.</li>
            <li>시간은 14:30 처럼, 자정 넘은 새벽은 25:30 처럼 적어요 (그 영업일에 붙어요).</li>
          </ul>
          <label className={'btn btn-secondary xl-file' + (busy ? ' disabled' : '')}>
            {busy === 'read' ? '읽는 중…' : '엑셀 파일 고르기 (.xlsx)'}
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={!!busy} onChange={e => readFile(e.target.files?.[0])} hidden />
          </label>
        </div>
      </section>

      {msg && <p className={'xl-msg ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}

      {plan && (
        <section className="set-grp">
          <div className="set-grp-h">
            <h3>3. 바뀔 내용 확인 — {plan.file}</h3>
          </div>
          <div className="set-box pad">
            <div className="xl-sum">
              <span className="up">수정 {count('update')}건</span>
              <span className="new">새 예약 {count('create')}건</span>
              <span className="err">문제 {count('error')}건 (적용 안 함)</span>
              <span className="same">그대로 {count('same')}건</span>
              {count('delete') > 0 && <span className="del">엑셀에서 지운 예약 {count('delete')}건</span>}
            </div>
            <div className="xl-table-wrap">
              <table className="xl-table">
                <thead><tr><th>줄</th><th>구분</th><th>예약</th><th>바뀌는 것 / 문제</th></tr></thead>
                <tbody>
                  {plan.items.filter(p => p.kind !== 'same').map(p => (
                    <tr key={p.line ?? `d${p.id}`} className={KIND[p.kind][1] + (p.kind === 'delete' && !withDelete ? ' off' : '')}>
                      <td>{p.line ?? '-'}</td>
                      <td><b className={'xl-tag ' + KIND[p.kind][1]}>{KIND[p.kind][0]}</b></td>
                      <td className="xl-what">
                        {p.row.date ?? '?'} {p.row.startMin != null ? hhmm(p.row.startMin) : '?'} · {p.row.staffId != null ? staffName(p.row.staffId) : '미정'} · {p.row.title}
                      </td>
                      <td>
                        {p.problems.map(t => <div key={t} className="xl-prob">✕ {t}</div>)}
                        {p.kind === 'update' && p.changes.map(c => <div key={c.field}>{c.label}: <s>{c.from}</s> → <b>{c.to}</b></div>)}
                        {p.kind === 'delete' && <div className="xl-prob">{withDelete ? '삭제돼요' : "삭제 안 함 — 아래 '엑셀에서 지운 예약도 삭제'를 켜면 삭제"} · {p.row.subtitle}</div>}
                        {p.kind === 'create' && <div>{p.row.subtitle || `${p.row.durationMin}분`}{p.row.price ? ` · ${p.row.price.toLocaleString()}원` : ''}</div>}
                        {p.warnings.map(t => <div key={t} className="xl-warn">⚠ {t}</div>)}
                      </td>
                    </tr>
                  ))}
                  {plan.items.every(p => p.kind === 'same') && <tr><td colSpan={4}>바뀐 내용이 없어요.</td></tr>}
                </tbody>
              </table>
            </div>
            {plan.canDelete
              ? count('delete') > 0 && (
                <label className="xl-del">
                  <input type="checkbox" checked={withDelete} onChange={e => setWithDelete(e.target.checked)} />
                  <span><b>엑셀에서 지운 예약 {count('delete')}건도 삭제</b>
                    <small>내려받을 때 있던 예약 중 엑셀에서 지운 것만 삭제해요. 그 뒤에 새로 들어온 예약은 지우지 않아요. 삭제는 되돌릴 수 없어요.</small></span>
                </label>
              )
              : <p className="xl-note">이 파일에는 '내보낸 정보' 시트가 없어서 엑셀에서 지운 줄은 삭제하지 않아요. (지금 버전에서 받은 파일만 삭제를 지원해요)</p>}
            <div className="xl-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPlan(null)} disabled={!!busy}>취소</button>
              <button type="button" className="btn btn-primary" onClick={apply} disabled={!!busy || !todo.length}>
                {busy === 'apply' ? '적용 중…' : `${todo.length}건 적용`}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
