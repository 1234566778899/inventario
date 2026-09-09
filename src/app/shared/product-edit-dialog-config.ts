import { MatDialogConfig } from '@angular/material/dialog';

export const productEditDialogConfig: MatDialogConfig = {
  width: 'calc(100vw - 256px)',
  maxWidth: '100vw',
  height: '100vh',
  maxHeight: '100vh',
  position: { right: '0', top: '0' },
  panelClass: 'pd-panel',
  backdropClass: 'pd-backdrop',
  autoFocus: false,
  disableClose: false,
};
