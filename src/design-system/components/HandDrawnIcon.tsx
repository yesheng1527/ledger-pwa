import { assetRegistry, type AssetKey } from '../../assets/registry';

type ImageLoadingProps = {
  loading?: 'eager' | 'lazy';
  decoding?: 'async' | 'auto' | 'sync';
};

export type HandDrawnIconProps = (
  | { asset: AssetKey; decorative: true; label?: never }
  | { asset: AssetKey; decorative?: false; label: string }
) & ImageLoadingProps;

export function HandDrawnIcon(props: HandDrawnIconProps) {
  const decorative = props.decorative === true;

  return (
    <img
      className="ds-hand-drawn-icon"
      src={assetRegistry[props.asset]}
      alt={decorative ? '' : props.label}
      aria-hidden={decorative ? 'true' : undefined}
      loading={props.loading}
      decoding={props.decoding}
    />
  );
}
