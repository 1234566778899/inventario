import { Pipe, PipeTransform } from '@angular/core';
import { StockMovement } from '../../core/models';

/**
 * Signed stock change for a movement.
 *
 * `quantity` is not consistent across types — entrada/salida store a magnitude
 * while ajuste stores an already-signed delta, so prefixing '+' to an ajuste
 * produced strings like "+-5". The stock columns are the reliable source.
 */
function delta(mv: StockMovement): number {
  return mv.new_stock - mv.previous_stock;
}

@Pipe({ name: 'movementDelta', standalone: true })
export class MovementDeltaPipe implements PipeTransform {
  transform(mv: StockMovement): string {
    const d = delta(mv);
    if (d === 0) return '0';
    return `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  }
}

/** Colours the delta by direction, so a negative ajuste reads red like a salida. */
@Pipe({ name: 'movementDeltaClass', standalone: true })
export class MovementDeltaClassPipe implements PipeTransform {
  transform(mv: StockMovement): string {
    const d = delta(mv);
    if (d > 0) return 'qty-in';
    if (d < 0) return 'qty-out';
    return 'qty-flat';
  }
}
