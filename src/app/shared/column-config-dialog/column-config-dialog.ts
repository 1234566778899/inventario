import { Component, inject } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatListModule } from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { ColumnConfig } from '../../core/models';

export interface ColumnConfigDialogData {
  columns: ColumnConfig[];
}

@Component({
  selector: 'app-column-config-dialog',
  standalone: true,
  imports: [
    FormsModule,
    DragDropModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatListModule,
  ],
  templateUrl: './column-config-dialog.html',
  styleUrl: './column-config-dialog.scss',
})
export class ColumnConfigDialogComponent {
  protected readonly dialogRef = inject(MatDialogRef<ColumnConfigDialogComponent>);
  private readonly inputData: ColumnConfigDialogData = inject(MAT_DIALOG_DATA);

  // Work on a deep copy so we can cancel
  protected columns: ColumnConfig[] = this.inputData.columns.map(c => ({ ...c }));

  protected drop(event: CdkDragDrop<ColumnConfig[]>): void {
    moveItemInArray(this.columns, event.previousIndex, event.currentIndex);
    this.columns = this.columns.map((c, i) => ({ ...c, order: i }));
  }

  protected toggleAll(visible: boolean): void {
    this.columns = this.columns.map(c => ({ ...c, visible }));
  }

  protected save(): void {
    this.dialogRef.close(this.columns);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
