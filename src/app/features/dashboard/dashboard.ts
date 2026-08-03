import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { ProductsService } from '../../core/services/products.service';
import { CategoriesService } from '../../core/services/categories.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { MovementsService } from '../../core/services/movements.service';
import { AuthService } from '../../core/services/auth.service';
import { Product, StockMovement } from '../../core/models';

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
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly suppliersService = inject(SuppliersService);
  private readonly movementsService = inject(MovementsService);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly totalProducts = signal(0);
  protected readonly activeProducts = signal(0);
  protected readonly lowStockCount = signal(0);
  protected readonly totalCategories = signal(0);
  protected readonly totalSuppliers = signal(0);
  protected readonly recentMovements = signal<StockMovement[]>([]);
  protected readonly lowStockProducts = signal<Product[]>([]);

  async ngOnInit(): Promise<void> {
    try {
      const [products, categories, suppliers, movements] = await Promise.all([
        this.productsService.getAll(),
        this.categoriesService.getAll(),
        this.suppliersService.getAll(),
        this.movementsService.getAll(),
      ]);

      const lowStock = products.filter(p => p.is_active && p.stock_current <= p.stock_minimum);

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
