import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Product, CustomField } from '../../core/models';

interface DetailDialogData { product: Product; customFields: CustomField[]; }

@Component({
  selector: 'app-product-detail-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatDividerModule, CurrencyPipe, DecimalPipe],
  templateUrl: './product-detail-dialog.html',
  styleUrl: './product-detail-dialog.scss',
})
export class ProductDetailDialogComponent {
  private readonly dialogData = inject<DetailDialogData>(MAT_DIALOG_DATA);
  protected readonly data = this.dialogData.product;
  protected readonly customFields = this.dialogData.customFields;

  protected isLowStock(): boolean {
    return this.data.stock_current <= this.data.stock_minimum;
  }

  protected margin(): number {
    if (!this.data.cost || !this.data.price) return 0;
    return ((this.data.price - this.data.cost) / this.data.price) * 100;
  }

  protected getCustomValue(fieldId: string): string {
    return this.data.custom_values?.find(cv => cv.field_id === fieldId)?.value ?? '—';
  }
}
