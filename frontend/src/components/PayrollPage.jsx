// 결제: 선택한 날짜의 담당자별 건수·매출·정산액(매출 × 정산 비율)
export default function PayrollPage({ staff, list }) {
  const byStaff = staff.map(s => {
    const rs = list.filter(r => r.staffId === s.id);
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
          <tr><th>담당자</th><th>건수</th><th>매출</th><th>정산액</th></tr>
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
          <tr><td>합계</td><td>{list.length}건</td><td>{total.toLocaleString()}원</td><td>{totalShare.toLocaleString()}원</td></tr>
        </tfoot>
      </table>
      <p className="pay-hint">
        이 날짜 예약의 금액 합계예요. 금액은 예약 등록 때 메뉴 가격으로 자동 입력되고,
        정산액은 설정 → 담당자의 정산 비율로 계산해요. (가격 기능 전에 등록한 예약은 0원)
      </p>
    </div>
  );
}
