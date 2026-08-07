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
      this.recentMovements.set(movements.slice(0, 5));
      this.lowStockProducts.set(lowStock.slice(0, 5));
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
