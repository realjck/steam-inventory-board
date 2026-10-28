/** Inline SVG icons; they inherit currentColor and are hidden from assistive tech. */

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const REFRESH_ICON = svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>');

export const CHECK_ICON = svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>');

export const DOWNLOAD_ICON = svg('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>');

export const COLLECTION_ICON = svg(
  '<rect x="4" y="4" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1"/>' +
    '<rect x="4" y="13.5" width="6.5" height="6.5" rx="1"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1"/>',
);

export const SETTINGS_ICON = svg(
  // Eight-tooth wheel, outline computed from radii 7.4 (root) and 10 (tip) around (12, 12).
  '<path d="M10.1 4.9L10.5 2.1L13.5 2.1L13.9 4.9L15.7 5.6L17.9 4.0L20.0 6.1L18.4 8.3L19.1 10.1L21.9 10.5L21.9 13.5L19.1 13.9L18.4 15.7L20.0 17.9L17.9 20.0L15.7 18.4L13.9 19.1L13.5 21.9L10.5 21.9L10.1 19.1L8.3 18.4L6.1 20.0L4.0 17.9L5.6 15.7L4.9 13.9L2.1 13.5L2.1 10.5L4.9 10.1L5.6 8.3L4.0 6.1L6.1 4.0L8.3 5.6Z"/>' +
    '<circle cx="12" cy="12" r="3"/>',
);
