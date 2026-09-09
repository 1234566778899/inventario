import { Component, inject, signal, effect, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort } from '@angular/material/sort';
import { MatMenuModule } from '@angular/material/menu';
import { DatePipe } from '@angular/common';
import { UsersService } from '../../../core/services/users.service';
import { AuthService } from '../../../core/services/auth.service';
import { ToolbarSearchService } from '../../../core/services/toolbar-search.service';
import { User } from '../../../core/models';
import { UserDialogComponent } from './user-dialog/user-dialog';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTableModule,
    MatSortModule,
    MatMenuModule,
    DatePipe,
  ],
  templateUrl: './users.html',
  styleUrl: './users.scss',
})
export class UsersComponent implements OnInit, OnDestroy {
  private readonly usersService = inject(UsersService);
  private readonly toolbarSearch = inject(ToolbarSearchService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly auth = inject(AuthService);

  @ViewChild(MatSort) set matSort(sort: MatSort | undefined) {
    if (sort) this.dataSource.sort = sort;
  }

  constructor() {
    this.toolbarSearch.configure({
      placeholder: 'Buscar usuarios por nombre o email',
      onClear: () => {
        this.toolbarSearch.query.set('');
        this.dataSource.filter = '';
      },
      primaryAction: {
        label: 'Nuevo usuario',
        icon: 'add',
        handler: () => this.openRegisterDialog(),
      },
    });
    effect(() => {
      this.dataSource.filter = this.toolbarSearch.query().trim().toLowerCase();
    });
  }

  ngOnDestroy(): void {
    this.toolbarSearch.reset();
  }

  protected readonly loading = signal(true);
  protected readonly deletingId = signal<string | null>(null);
  protected readonly togglingId = signal<string | null>(null);
  protected readonly dataSource = new MatTableDataSource<User>([]);
  protected readonly displayedColumns = ['avatar', 'name', 'email', 'role', 'created_at', 'actions'];

  async ngOnInit(): Promise<void> {
    this.dataSource.filterPredicate = (user, filter) => {
      const term = filter.trim().toLowerCase();
      return (user.full_name ?? '').toLowerCase().includes(term)
        || user.email.toLowerCase().includes(term);
    };
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.dataSource.data = await this.usersService.getAll();
    } finally {
      this.loading.set(false);
    }
  }

  protected initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  /** Accounts created without a profile name fall back to the email handle, not "—". */
  protected displayName(user: User): string {
    return user.full_name?.trim() || user.email.split('@')[0];
  }

  protected isCurrentUser(user: User): boolean {
    return user.id === this.auth.currentUser()?.id;
  }

  /**
   * A right-anchored cover sheet that stops where the sidebar begins — the same
   * surface the product form uses.
   */
  private coverSheetConfig() {
    return {
      width: 'calc(100vw - 256px)',
      maxWidth: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      position: { right: '0', top: '0' },
      panelClass: 'pd-panel',
      backdropClass: 'pd-backdrop',
      autoFocus: false,
    };
  }

  protected openRegisterDialog(): void {
    const ref = this.dialog.open(UserDialogComponent, { ...this.coverSheetConfig(), data: {} });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Usuario registrado', 'Cerrar', { duration: 3000 });
        await this.load();
      }
    });
  }

  protected editUser(user: User): void {
    const ref = this.dialog.open(UserDialogComponent, { ...this.coverSheetConfig(), data: { user } });
    ref.afterClosed().subscribe(async (saved: boolean) => {
      if (saved) {
        this.snackBar.open('Usuario actualizado', 'Cerrar', { duration: 3000 });
        await this.load();
      }
    });
  }

  protected async changeRole(user: User, role: 'admin' | 'user'): Promise<void> {
    try {
      await this.usersService.updateRole(user.id, role);
      user.role = role;
      this.dataSource.data = [...this.dataSource.data];
      this.snackBar.open('Rol actualizado', 'Cerrar', { duration: 3000 });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al actualizar rol';
      this.snackBar.open(msg, 'Cerrar', { duration: 5000 });
    }
  }

  protected isActive(user: User): boolean {
    return user.is_active !== false;
  }

  /**
   * Deactivating is the everyday way to take someone off the system: it blocks
   * sign-in but keeps the account attached to its stock movements, which a hard
   * delete cannot do. Reactivating needs no confirmation — it is not destructive.
   */
  protected toggleActive(user: User): void {
    const deactivating = this.isActive(user);
    if (!deactivating) {
      void this.applyActive(user, true);
      return;
    }

    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Desactivar usuario',
        message: `¿Desactivar a "${this.displayName(user)}"? No podrá iniciar sesión, `
          + 'pero su historial de movimientos se conserva. Puedes reactivarlo cuando quieras.',
        confirmLabel: 'Desactivar',
        color: 'warn',
      },
      width: '400px',
    });

    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) void this.applyActive(user, false);
    });
  }

  private async applyActive(user: User, active: boolean): Promise<void> {
    this.togglingId.set(user.id);
    const { error } = await this.usersService.setActive(user.id, active);
    this.togglingId.set(null);

    if (error) {
      this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
      return;
    }
    user.is_active = active;
    this.dataSource.data = [...this.dataSource.data];
    this.snackBar.open(active ? 'Usuario reactivado' : 'Usuario desactivado', 'Cerrar', { duration: 3000 });
  }

  protected deleteUser(user: User): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar usuario',
        message: `¿Eliminar a "${this.displayName(user)}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
        color: 'warn',
      },
      width: '400px',
    });

    ref.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;
      this.deletingId.set(user.id);
      const { error } = await this.usersService.deleteUser(user.id);
      this.deletingId.set(null);
      if (error) {
        this.snackBar.open(error.message, 'Cerrar', { duration: 5000 });
      } else {
        this.dataSource.data = this.dataSource.data.filter(u => u.id !== user.id);
        this.snackBar.open('Usuario eliminado', 'Cerrar', { duration: 3000 });
      }
    });
  }
}
