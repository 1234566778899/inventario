import { Component, inject, signal, OnInit, ViewChild, AfterViewInit } from '@angular/core';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog } from '@angular/material/dialog';
import { FormsModule } from '@angular/forms';
import { DatePipe, JsonPipe, SlicePipe } from '@angular/common';
import { EditLogService } from '../../core/services/edit-log.service';
import { EditLog } from '../../core/models';

@Component({
  selector: 'app-edit-log',
  standalone: true,
  imports: [
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    DatePipe,
    JsonPipe,
    SlicePipe,
  ],
  templateUrl: './edit-log.html',
  styleUrl: './edit-log.scss',
})
export class EditLogComponent implements OnInit, AfterViewInit {
  private readonly logService = inject(EditLogService);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  protected readonly loading = signal(true);
  protected readonly dataSource = new MatTableDataSource<EditLog>([]);
  protected readonly displayedColumns = ['created_at', 'table_name', 'action', 'record_id', 'user', 'details'];

  protected selectedTable = '';
  protected selectedAction = '';

  protected readonly tables = ['products', 'categories', 'suppliers', 'custom_fields', 'stock_movements'];
  protected expandedRow: EditLog | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      let logs = await this.logService.getAll(500);

      if (this.selectedTable) {
        logs = logs.filter(l => l.table_name === this.selectedTable);
      }
      if (this.selectedAction) {
        logs = logs.filter(l => l.action === this.selectedAction);
      }

      this.dataSource.data = logs as EditLog[];
    } finally {
      this.loading.set(false);
    }
  }

  protected async applyFilters(): Promise<void> {
    await this.load();
  }

  protected async clearFilters(): Promise<void> {
    this.selectedTable = '';
    this.selectedAction = '';
    await this.load();
  }

  protected actionBadge(action: string): string {
    return { insert: 'badge-success', update: 'badge-info', delete: 'badge-danger' }[action] ?? 'badge-secondary';
  }

  protected actionLabel(action: string): string {
    return { insert: 'Creación', update: 'Actualización', delete: 'Eliminación' }[action] ?? action;
  }

  protected tableLabel(table: string): string {
    const labels: Record<string, string> = {
      products: 'Productos',
      categories: 'Categorías',
      suppliers: 'Proveedores',
      custom_fields: 'Campos Personalizados',
      stock_movements: 'Movimientos',
    };
    return labels[table] ?? table;
  }

  protected toggleRow(row: EditLog): void {
    this.expandedRow = this.expandedRow === row ? null : row;
  }
}
