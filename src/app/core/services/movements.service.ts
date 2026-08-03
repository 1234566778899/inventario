import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { EditLogService } from './edit-log.service';
import { ProductsService } from './products.service';
import { StockMovement, MovementType } from '../models';

@Injectable({ providedIn: 'root' })
export class MovementsService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);
  private readonly editLog = inject(EditLogService);
  private readonly productsService = inject(ProductsService);

  async getAll(productId?: string): Promise<StockMovement[]> {
    let query = this.supabase.client
      .from('stock_movements')
      .select(`
        *,
        product:product_id(id, sku, name),
        user:user_id(id, email, full_name)
      `)
      .order('created_at', { ascending: false });

    if (productId) {
      query = query.eq('product_id', productId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as StockMovement[];
  }

  async create(
    productId: string,
    type: MovementType,
    quantity: number,
    reason: string | null = null,
    notes: string | null = null
  ): Promise<StockMovement> {
    const userId = this.authService.currentUser()?.id;
    if (!userId) throw new Error('Usuario no autenticado');

    // Get current stock
    const product = await this.productsService.getById(productId);
    const previousStock = product.stock_current;
    let newStock: number;

    switch (type) {
      case 'entrada':
        newStock = previousStock + quantity;
        break;
      case 'salida':
        newStock = previousStock - quantity;
        break;
      case 'ajuste':
        newStock = quantity; // For ajuste, quantity IS the new stock value
        break;
    }

    if (newStock < 0) throw new Error('El stock no puede ser negativo');

    const payload = {
      product_id: productId,
      user_id: userId,
      type,
      quantity: type === 'ajuste' ? quantity - previousStock : quantity,
      previous_stock: previousStock,
      new_stock: newStock,
      reason,
      notes,
    };

    const { data, error } = await this.supabase.client
      .from('stock_movements')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;

    // Update product stock and notify listeners (e.g. toolbar badge)
    await this.productsService.updateStock(productId, newStock);
    this.productsService.notifyStockChanged();

    // Log the stock change
    await this.editLog.log(
      'products',
      productId,
      'update',
      { stock_current: previousStock },
      { stock_current: newStock, movement_type: type }
    );

    return data as StockMovement;
  }
}
