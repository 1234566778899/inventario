import { Component, inject, signal, OnInit } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoriesService } from '../../core/services/categories.service';
import { AuthService } from '../../core/services/auth.service';
import { Category } from '../../core/models';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog';
import { CategoryDialogComponent } from './category-dialog/category-dialog';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class CategoriesComponent implements OnInit {
  private readonly categoriesService = inject(CategoriesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly dataSource = new MatTableDataSource<Category>([]);
  protected readonly displayedColumns = ['name', 'parent', 'description', 'actions'];

  protected get categories(): Category[] {
    return this.dataSource.data;
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.dataSource.data = await this.categoriesService.getAll();
    } finally {
      this.loading.set(false);
    }
  }

  protected openDialog(category?: Category): void {
    const ref = this.dialog.open(CategoryDialogComponent, {
      width: '480px',
      data: { category },
    });
    ref.afterClosed().subscribe(async (saved: Category | false) => {
      if (saved) {
        const msg = category ? 'Categoría actualizada' : 'Categoría creada';
        this.snackBar.open(msg, 'Cerrar', { duration: 3000, panelClass: 'snack-success' });
        await this.load();
      }
    });
  }

  protected delete(category: Category): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar categoría',
        message: `¿Eliminar la categoría "${category.name}"?`,
        confirmLabel: 'Eliminar',
      },
    });
    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        try {
          await this.categoriesService.delete(category.id);
          this.snackBar.open('Categoría eliminada', 'Cerrar', { duration: 3000, panelClass: 'snack-success' });
          await this.load();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'Error al eliminar';
          this.snackBar.open(msg, 'Cerrar', { duration: 5000, panelClass: 'snack-error' });
        }
      }
    });
  }

  protected parentName(parentId: string | null): string {
    if (!parentId) return '';
    return this.categories.find(c => c.id === parentId)?.name ?? '';
  }
}
