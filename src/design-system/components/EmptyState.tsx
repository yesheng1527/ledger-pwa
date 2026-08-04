import type { AssetKey } from '../../assets/registry';
import { HandDrawnIcon } from './HandDrawnIcon';

export type EmptyStateProps = {
  title: string;
  description: string;
  illustration?: AssetKey;
};

export function EmptyState({ title, description, illustration }: EmptyStateProps) {
  return (
    <section className="ds-empty-state">
      {illustration ? <HandDrawnIcon asset={illustration} decorative /> : null}
      <h2 className="ds-empty-state__title">{title}</h2>
      <p className="ds-empty-state__description">{description}</p>
    </section>
  );
}
