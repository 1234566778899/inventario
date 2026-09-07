import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface LowStockAlertInput {
  name: string;
  sku: string;
  unit: string;
  stockCurrent: number;
  stockMinimum: number;
  movement?: { type: string; quantity: number };
}

/**
 * Fires the "producto con stock bajo" email through the /api/low-stock-alert
 * backend function (Resend). The recipient and API key live only on the server.
 *
 * Failures are swallowed on purpose — a missed notification must never break the
 * stock movement that triggered it.
 */
@Injectable({ providedIn: 'root' })
export class LowStockAlertService {
  private readonly auth = inject(AuthService);

  async notify(input: LowStockAlertInput): Promise<void> {
    try {
      const session = await this.auth.getSession();
      const user = this.auth.currentUser();

      const res = await fetch('/api/low-stock-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          product: {
            name: input.name,
            sku: input.sku,
            unit: input.unit,
            stock_current: input.stockCurrent,
            stock_minimum: input.stockMinimum,
          },
          movement: input.movement,
          actor: user?.full_name ?? user?.email ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn('[low-stock-alert] no se pudo enviar el aviso:', body);
      }
    } catch (e) {
      console.warn('[low-stock-alert] error al enviar el aviso:', e);
    }
  }
}
