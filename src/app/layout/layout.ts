import { Component, inject, signal, computed, OnInit, DestroyRef, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatBadgeModule } from '@angular/material/badge';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { ProductsService } from '../core/services/products.service';
import { Product } from '../core/models';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    MatBadgeModule,
  ],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class LayoutComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly productsService = inject(ProductsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);

  @ViewChild(MatSidenav) private readonly sidenav?: MatSidenav;

  protected readonly alertProducts = signal<Product[]>([]);
  protected readonly alertCount = computed(() => this.alertProducts().length);
  protected readonly isMobile = signal(false);

  private readonly seenAlertIds = signal<Set<string>>(
    new Set<string>(JSON.parse(localStorage.getItem('inv_seen_alerts') ?? '[]'))
  );
  protected readonly unseenCount = computed(() =>
    this.alertProducts().filter(p => !this.seenAlertIds().has(p.id)).length
  );

  protected readonly navItems: NavItem[] = [
    { path: '/dashboard',      label: 'Panel de Control', icon: 'dashboard' },
    { path: '/products',       label: 'Productos',         icon: 'inventory_2' },
    { path: '/movements',      label: 'Movimientos',       icon: 'swap_horiz' },
    { path: '/settings/users', label: 'Usuarios',          icon: 'manage_accounts', adminOnly: true },
  ];

  protected get visibleNavItems(): NavItem[] {
    return this.navItems.filter(item => !item.adminOnly || this.auth.isAdmin());
  }

  async ngOnInit(): Promise<void> {
    // Track viewport size — <900px is mobile
    this.breakpoints
      .observe('(max-width: 899.98px)')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(state => this.isMobile.set(state.matches));

    // Close sidenav after navigation on mobile
    this.router.events
      .pipe(
        filter(e => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.isMobile() && this.sidenav?.opened) {
          this.sidenav.close();
        }
      });

    await this.loadAlerts();
    this.productsService.stockChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.seenAlertIds.set(new Set());
        localStorage.removeItem('inv_seen_alerts');
        this.loadAlerts();
      });
  }

  protected toggleSidenav(): void {
    this.sidenav?.toggle();
  }

  protected async loadAlerts(): Promise<void> {
    try {
      const all = await this.productsService.getAll();
      this.alertProducts.set(all.filter(p => p.is_active && p.stock_current <= p.stock_minimum));
    } catch { /* not critical */ }
  }

  protected previewAlerts(): Product[] {
    return this.alertProducts().slice(0, 5);
  }

  protected markAlertsSeen(): void {
    const newSeen = new Set([...this.seenAlertIds(), ...this.alertProducts().map(p => p.id)]);
    this.seenAlertIds.set(newSeen);
    localStorage.setItem('inv_seen_alerts', JSON.stringify([...newSeen]));
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
  }
}
