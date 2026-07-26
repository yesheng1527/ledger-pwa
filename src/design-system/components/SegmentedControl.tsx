export type SegmentedControlOption<Value extends string> = {
  value: Value;
  label: string;
};

export type SegmentedControlProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  onChange(value: Value): void;
};

export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<Value>) {
  return (
    <div className="ds-segmented-control" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className="ds-segmented-control__option"
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
