import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses the host as soon as it is inserted.
 *
 * The plain `autofocus` attribute is not a substitute here: browsers honour it
 * for elements present when the document is parsed, but treat it as a hint for
 * nodes added later — which is exactly how the inline editors appear, inside an
 * `@if`. In practice Chrome focused the first editor of a session and ignored
 * every one after it, so the field never received focus, never fired `blur`,
 * and the edit was never staged.
 */
@Directive({
  selector: '[appAutofocus]',
  standalone: true,
})
export class AutofocusDirective implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    const node = this.host.nativeElement;
    // A microtask lets the surrounding block finish inserting before focus
    // moves; focusing mid-insert can be undone by the click that opened it.
    queueMicrotask(() => node.focus());
  }
}
