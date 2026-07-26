export type ProgressBarProps = {
  label: string;
  value: number;
  max: number;
  valueText: string;
  tone?: 'coral' | 'warning' | 'income';
};

export function ProgressBar({
  label,
  value,
  max,
  valueText,
  tone = 'coral',
}: ProgressBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const safeValue = safeMax === 0
    ? 0
    : Math.min(safeMax, Math.max(0, Number.isFinite(value) ? value : 0));
  const percentage = safeMax === 0 ? 0 : safeValue / safeMax * 100;

  return (
    <div
      className="ds-progress-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      aria-valuetext={valueText}
      data-tone={tone}
    >
      <span
        className="ds-progress-bar__fill"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
