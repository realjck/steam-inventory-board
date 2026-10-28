/** Inline SVG icons; they inherit currentColor and are hidden from assistive tech. */

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const REFRESH_ICON = svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>');

export const CHECK_ICON = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>');
