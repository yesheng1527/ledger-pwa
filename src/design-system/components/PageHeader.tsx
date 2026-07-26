import type { AssetKey } from '../../assets/registry';
import { HandDrawnIcon } from './HandDrawnIcon';

export type PageHeaderAction = {
  label: string;
  asset: AssetKey;
  onActivate(): void;
};

export type PageHeaderProps = {
  title: string;
  titleId?: string;
  eyebrow?: string;
  action?: PageHeaderAction;
};

export function PageHeader({
  title,
  titleId,
  eyebrow,
  action,
}: PageHeaderProps) {
  return (
    <header className="ds-page-header">
      <div className="ds-page-header__copy">
        {eyebrow ? <p className="ds-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 id={titleId} className="ds-page-header__title">{title}</h1>
      </div>
      {action ? (
        <button
          className="ds-page-header__action"
          type="button"
          aria-label={action.label}
          onClick={action.onActivate}
        >
          <HandDrawnIcon asset={action.asset} decorative />
        </button>
      ) : null}
    </header>
  );
}
