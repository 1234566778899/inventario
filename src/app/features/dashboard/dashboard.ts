import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CurrencyPipe } from '@angular/common';
import { MovementDialogComponent } from '../../shared/movement-dialog/movement-dialog';
import { ProductsService } from '../../core/services/products.service';
import { CategoriesService } from '../../core/services/categories.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { MovementsService } from '../../core/services/movements.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, StockMovement } from '../../core/models';
import { MovementDeltaPipe, MovementDeltaClassPipe } from '../../shared/pipes/movement-delta.pipe';

interface CategoryStat {
  name: string;
  value: number;
  count: number;
  pct: number;
}

interface StockHealth {
  healthy: number;
  low: number;
  out: number;
  total: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatTooltipModule,
    CurrencyPipe,
    MovementDeltaPipe,
    MovementDeltaClassPipe,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly movementsService = inject(MovementsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly inventoryValue = signal(0);
  protected readonly inventoryRetailValue = signal(0);
  protected readonly totalProducts = signal(0);
  protected readonly activeProducts = signal(0);
  protected readonly lowStockCount = signal(0);
  protected readonly totalCategories = signal(0);
  protected readonly totalSuppliers = signal(0);
  protected readonly recentMovements = signal<StockMovement[]>([]);
  protected readonly lowStockProducts = signal<Product[]>([]);
  protected readonly categoryStats = signal<CategoryStat[]>([]);
  protected readonly stockHealth = signal<StockHealth>({ healthy: 0, low: 0, out: 0, total: 0 });
  protected readonly topValueProducts = signal<{ name: string; value: number }[]>([]);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const [products, categories, suppliers, movements] = await Promise.all([
        this.productsService.getAll(),
        this.categoriesService.getAll(),
        this.suppliersService.getAll(),
        this.movementsService.getAll(),
      ]);

      const lowStock = products.filter(p => p.is_active && p.stock_current <= p.stock_minimum);
      const active = products.filter(p => p.is_active);

      // Money tied up in stock (at cost) vs. what it would bring in (at sale price).
      this.inventoryValue.set(
        active.reduce((sum, p) => sum + (p.cost ?? 0) * p.stock_current, 0)
      );
      this.inventoryRetailValue.set(
        active.reduce((sum, p) => sum + (p.price ?? 0) * p.stock_current, 0)
      );

      this.totalProducts.set(products.length);
      this.activeProducts.set(products.filter(p => p.is_active).length);
      this.lowStockCount.set(lowStock.length);
      this.totalCategories.set(categories.length);
      this.totalSuppliers.set(suppliers.length);
      this.recentMovements.set(movements.slice(0, 7));
      this.lowStockProducts.set(
        [...lowStock].sort((a, b) => a.stock_current - b.stock_current).slice(0, 6)
      );

      // Stock health across the active catalogue.
      const out = active.filter(p => p.stock_current === 0).length;
      const low = active.filter(p => p.stock_current > 0 && p.stock_current <= p.stock_minimum).length;
      this.stockHealth.set({
        healthy: active.length - out - low,
        low,
        out,
        total: active.length,
      });

      // Money tied up in stock, grouped by category (top 6).
      const byCategory = new Map<string, { value: number; count: number }>();
      for (const p of active) {
        const name = p.category?.name ?? 'Sin categoría';
        const entry = byCategory.get(name) ?? { value: 0, count: 0 };
        entry.value += (p.cost ?? 0) * p.stock_current;
        entry.count += 1;
        byCategory.set(name, entry);
      }
      const ranked = [...byCategory.entries()]
        .map(([name, v]) => ({ name, value: v.value, count: v.count }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
      const max = Math.max(1, ...ranked.map(c => c.value));
      this.categoryStats.set(
        ranked.map(c => ({ ...c, pct: Math.max(3, Math.round((c.value / max) * 100)) }))
      );

      // Highest-value items sitting in the warehouse right now.
      this.topValueProducts.set(
        active
          .map(p => ({ name: p.name, value: (p.cost ?? 0) * p.stock_current }))
          .filter(p => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 4)
      );
    } finally {
      this.loading.set(false);
    }
  }

  /** Closes the loop where the problem surfaces: restock straight from the alert. */
  protected restock(product: Product, event: Event): void {
    event.stopPropagation();
    const ref = this.dialog.open(MovementDialogComponent, {
      data: { product, defaultType: 'entrada' },
      width: '480px',
    });

    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (!saved) return;
      this.snackBar.open(`Stock actualizado: ${product.name}`, 'Cerrar', { duration: 3000 });
      this.productsService.invalidateCache();
      this.loading.set(true);
      await this.load();
    });
  }

  /** Short, human relative time for the recent-movements list. */
  protected relativeDate(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const minutes = Math.floor((Date.now() - then) / 60000);
    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} h`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} d`;
    return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
  }

  /** Segments for the inventory-health bar, dropping any that are empty. */
  protected get healthSegments(): { key: string; label: string; value: number; pct: number }[] {
    const h = this.stockHealth();
    const total = h.total || 1;
    return [
      { key: 'healthy', label: 'En stock', value: h.healthy, pct: (h.healthy / total) * 100 },
      { key: 'low', label: 'Stock bajo', value: h.low, pct: (h.low / total) * 100 },
      { key: 'out', label: 'Agotado', value: h.out, pct: (h.out / total) * 100 },
    ].filter(s => s.value > 0);
  }

  protected movementTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      entrada: 'Entrada',
      salida: 'Salida',
      ajuste: 'Ajuste',
    };
    return labels[type] ?? type;
  }

  protected movementTypeBadge(type: string): string {
    const classes: Record<string, string> = {
      entrada: 'badge-success',
      salida: 'badge-danger',
      ajuste: 'badge-info',
    };
    return classes[type] ?? 'badge-secondary';
  }
}
