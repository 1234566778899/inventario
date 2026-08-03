import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/layout').then(m => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/products/products').then(m => m.ProductsComponent),
      },
      {
        path: 'products/new',
        loadComponent: () =>
          import('./features/products/product-form/product-form').then(m => m.ProductFormComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'products/:id/edit',
        loadComponent: () =>
          import('./features/products/product-form/product-form').then(m => m.ProductFormComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/categories/categories').then(m => m.CategoriesComponent),
      },
      {
        path: 'suppliers',
        loadComponent: () =>
          import('./features/suppliers/suppliers').then(m => m.SuppliersComponent),
      },
      {
        path: 'movements',
        loadComponent: () =>
          import('./features/movements/movements').then(m => m.MovementsComponent),
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./features/alerts/alerts').then(m => m.AlertsComponent),
      },
      {
        path: 'edit-log',
        loadComponent: () =>
          import('./features/edit-log/edit-log').then(m => m.EditLogComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'settings/custom-fields',
        loadComponent: () =>
          import('./features/settings/custom-fields/custom-fields').then(m => m.CustomFieldsComponent),
        canActivate: [adminGuard],
      },
      {
        path: 'settings/users',
        loadComponent: () =>
          import('./features/settings/users/users').then(m => m.UsersComponent),
        canActivate: [adminGuard],
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
