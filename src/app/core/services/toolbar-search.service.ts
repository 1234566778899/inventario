import { Injectable, signal } from '@angular/core';

export interface ToolbarAction {
  label: string;
  icon: string;
  handler: () => void;
  /** When it returns true the action is not rendered (e.g. non-admins). */
  hidden?: () => boolean;
}

export interface ToolbarSearchOptions {
  /** Placeholder for the toolbar search field. Omit to hide the field entirely. */
  placeholder?: string;
  /** Opens the page's floating filter window. Omit when the page has no extra filters. */
  onFilters?: () => void;
  /** Clears the search term and every active filter. */
  onClear?: () => void;
  /** The page's main "+ Nuevo …" button, rendered on the right of the toolbar. */
  primaryAction?: ToolbarAction | null;
}

/**
 * Bridges each list page's chrome (search box + action buttons) into the app
 * toolbar so the per-page header row can go away and the table gets that space.
 *
 * A page calls `configure()` on init and `reset()` on destroy.
 */
@Injectable({ providedIn: 'root' })
export class ToolbarSearchService {
  /** Whether the toolbar should show the search field for the current page. */
  readonly active = signal(false);
  readonly placeholder = signal('Buscar…');
  /** Current search text — bound to the toolbar input, watched by the page. */
  readonly query = signal('');
  /** Active-filter count shown as a badge on the filter button (0 hides it). */
  readonly filterCount = signal(0);
  /** True while the page's floating filter window is open. */
  readonly filtersOpen = signal(false);
  /** The page's primary "+ Nuevo …" button. */
  readonly primaryAction = signal<ToolbarAction | null>(null);

  private onFiltersCb: (() => void) | null = null;
  private onClearCb: (() => void) | null = null;

  /** The toolbar shows the filter button only when a page provides this. */
  get hasFilters(): boolean {
    return this.onFiltersCb !== null;
  }

  openFilters(): void {
    this.onFiltersCb?.();
  }

  clear(): void {
    this.onClearCb?.();
  }

  configure(opts: ToolbarSearchOptions): void {
    this.onFiltersCb = opts.onFilters ?? null;
    this.onClearCb = opts.onClear ?? null;
    this.placeholder.set(opts.placeholder ?? 'Buscar…');
    this.query.set('');
    this.filterCount.set(0);
    this.filtersOpen.set(false);
    this.active.set(!!opts.placeholder);
    this.primaryAction.set(opts.primaryAction ?? null);
  }

  reset(): void {
    this.active.set(false);
    this.query.set('');
    this.filterCount.set(0);
    this.filtersOpen.set(false);
    this.primaryAction.set(null);
    this.onFiltersCb = null;
    this.onClearCb = null;
  }
}
