// 결제: 선택한 날짜의 '완료 처리된' 예약만 담당자별 건수·매출·정산액(매출 × 정산 비율)
export default function PayrollPage({ staff, list }) {
  const done = list.filter(r => r.done);
  const pending = list.length - done.length;
  const byStaff = staff.map(s => {
    const rs = done.filter(r => r.staffId === s.id);
    const sum = rs.reduce((a, r) => a + (r.price || 0), 0);
    const pct = s.commissionPct || 0;
    return { ...s, count: rs.length, sum, pct, share: Math.round(sum * pct / 100) };
  });
  const total = byStaff.reduce((a, s) => a + s.sum, 0);
  const totalShare = byStaff.reduce((a, s) => a + s.share, 0);

  return (
    <div className="payroll">
      <table className="pay-table">
        <thead>
          <tr><th>담당자</th><th>완료</th><th>매출</th><th>정산액</th></tr>
        </thead>
        <tbody>
          {byStaff.map(s => (
            <tr key={s.id}>
              <td>{s.dotColor && <i className="dot" style={{ background: s.dotColor }} />}{s.name}</td>
              <td>{s.count}건</td>
              <td>{s.sum.toLocaleString()}원</td>
              <td>{s.pct ? <>{s.share.toLocaleString()}원 <small>{s.pct}%</small></> : <small>비율 없음</small>}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>합계</td><td>{done.length}건</td><td>{total.toLocaleString()}원</td><td>{totalShare.toLocaleString()}원</td></tr>
        </tfoot>
      </table>
      {pending > 0 && (
        <p className="pay-pending">아직 완료 처리 안 된 예약 {pending}건은 빠져 있어요. 예약 탭에서 완료 처리하면 여기에 더해져요.</p>
      )}
      <p className="pay-hint">
        완료 처리된 예약만 정산해요. 금액은 예약할 때 고른 메뉴 가격이고,
        정산액은 설정 → 담당자의 정산 비율로 계산해요.
      </p>
    </div>
  );
}
