function formatCny(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}¥${value}`;
}

export type TrendDatum = {
  key: string;
  label: string;
  expenseCents: number;
  incomeCents: number;
};

function points(
  data: readonly TrendDatum[],
  pick: (datum: TrendDatum) => number,
  max: number,
): string {
  const width = 280;
  const height = 96;
  return data.map((datum, index) => {
    const x = data.length === 1 ? width / 2 : index / (data.length - 1) * width;
    const y = height - pick(datum) / max * height;
    return `${x + 10},${y + 10}`;
  }).join(' ');
}

export function AccessibleTrendChart({
  title,
  data,
}: {
  title: string;
  data: readonly TrendDatum[];
}) {
  const max = Math.max(
    0,
    ...data.flatMap((datum) => [datum.expenseCents, datum.incomeCents]),
  );
  if (data.length === 0 || max === 0) {
    return (
      <section>
        <h2>{title}</h2>
        <p>暂无可展示的统计数据</p>
      </section>
    );
  }

  const expensePoints = points(data, (datum) => datum.expenseCents, max);
  const incomePoints = points(data, (datum) => datum.incomeCents, max);
  return (
    <section>
      <h2>{title}</h2>
      <svg
        viewBox="0 0 300 120"
        aria-hidden="true"
        data-testid="decorative-chart"
      >
        <path d="M10 106H290" stroke="#d9cabb" strokeWidth="1.5" />
        <polyline
          points={expensePoints}
          fill="none"
          stroke="#f46d58"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={incomePoints}
          fill="none"
          stroke="#5db8dd"
          strokeWidth="3"
          strokeDasharray="7 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((datum, index) => {
          const x = data.length === 1 ? 150 : index / (data.length - 1) * 280 + 10;
          const expenseY = 106 - datum.expenseCents / max * 96;
          const incomeY = 106 - datum.incomeCents / max * 96;
          return (
            <g key={datum.key}>
              <circle cx={x} cy={expenseY} r="3.5" fill="#f46d58" />
              <rect x={x - 3} y={incomeY - 3} width="6" height="6" rx="1" fill="#5db8dd" />
            </g>
          );
        })}
      </svg>
      <table aria-label={`${title}数据`}>
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">支出</th>
            <th scope="col">收入</th>
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.key}>
              <th scope="row">{datum.label}</th>
              <td>{formatCny(datum.expenseCents)}</td>
              <td>{formatCny(datum.incomeCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
