import type { AssetKey } from '../../assets/registry';
import type { Ref } from 'react';
import { HandDrawnIcon } from './HandDrawnIcon';

export type NavigationItem = {
  id: string;
  label: string;
  icon: AssetKey;
  active: boolean;
  central?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  onActivate(): void;
};

export type BottomNavigationProps = {
  items: readonly NavigationItem[];
  label?: string;
};

export function BottomNavigation({ items, label = '主要导航' }: BottomNavigationProps) {
  return (
    <nav className="ds-bottom-navigation" aria-label={label}>
      <ul className="ds-bottom-navigation__list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              ref={item.buttonRef}
              type="button"
              className={[
                'ds-bottom-navigation__button',
                item.central && 'ds-bottom-navigation__button--central',
              ].filter(Boolean).join(' ')}
              aria-current={!item.central && item.active ? 'page' : undefined}
              onClick={item.onActivate}
            >
              <HandDrawnIcon asset={item.icon} decorative />
              <span>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
