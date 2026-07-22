import { assetRegistry, type AssetKey } from '../../assets/registry';

export type HandDrawnIconProps =
  | { asset: AssetKey; decorative: true; label?: never }
  | { asset: AssetKey; decorative?: false; label: string };

export function HandDrawnIcon(props: HandDrawnIconProps) {
  const decorative = props.decorative === true;

  return (
    <img
      className="ds-hand-drawn-icon"
      src={assetRegistry[props.asset]}
      alt={decorative ? '' : props.label}
      aria-hidden={decorative ? 'true' : undefined}
    />
  );
}
