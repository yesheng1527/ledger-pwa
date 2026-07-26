const colors = ['#f46d58', '#8bcfe8', '#e8892e', '#2e9b68', '#756f68'];

function formatCny(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const value = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(cents) / 100);
  return `${sign}¥${value}`;
}

export type DonutSegment = {
  id: string;
  label: string;
  valueCents: number;
  percentage?: number;
};

export function AccessibleDonutChart({
  title,
  segments,
}: {
  title: string;
  segments: readonly DonutSegment[];
}) {
  const positiveSegments = segments.filter((segment) => segment.valueCents > 0);
  const total = positiveSegments.reduce((sum, segment) => sum + segment.valueCents, 0);

  if (total === 0) {
    return (
      <section>
        <h2>{title}</h2>
        <p>暂无可展示的统计数据</p>
      </section>
    );
  }

  let offset = 0;
  return (
    <section>
      <h2>{title}</h2>
      <div>
        <svg
          viewBox="0 0 120 120"
          aria-hidden="true"
          data-testid="decorative-chart"
        >
          <circle cx="60" cy="60" r="42" fill="none" stroke="#eee2d3" strokeWidth="16" />
          {positiveSegments.map((segment, index) => {
            const percentage = segment.valueCents / total * 100;
            const currentOffset = offset;
            offset += percentage;
            return (
              <circle
                key={segment.id}
                cx="60"
                cy="60"
                r="42"
                fill="none"
                stroke={colors[index % colors.length]}
                strokeWidth="16"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray={`${percentage} ${100 - percentage}`}
                strokeDashoffset={-currentOffset}
                transform="rotate(-90 60 60)"
              />
            );
          })}
        </svg>
        <ul aria-label={`${title}数据`}>
          {positiveSegments.map((segment) => {
            const percentage = segment.percentage
              ?? Math.round(segment.valueCents / total * 10_000) / 100;
            return (
              <li key={segment.id}>
                <span>{segment.label}</span>
                <span>{formatCny(segment.valueCents)}</span>
                <span>{percentage.toFixed(2)}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
