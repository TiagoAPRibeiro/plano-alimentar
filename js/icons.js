// Ícones de traço (viewBox 24×24). Usados no editor e incorporados no PDF.
const PATHS = {
  fruit: '<path d="M12 7.5c-1.6-1.1-4.6-1.4-6.1.6S4.6 14 6.6 17s3.6 3.6 5.4 2.6c1.8 1 3.4.4 5.4-2.6s2-7-.4-8.9-4.4-1.7-5-.6z"/><path d="M12 7.5c0-2 .8-3.4 2.4-4.2"/>',
  water: '<path d="M12 3.5c3.2 4.2 6 7.4 6 10.5a6 6 0 0 1-12 0c0-3.1 2.8-6.3 6-10.5z"/><path d="M9.2 14.6a2.9 2.9 0 0 0 2.4 2.6"/>',
  pill: '<path d="M4.9 13.4l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a3.5 3.5 0 0 1-5-5z"/><path d="M9.2 9.1l5 5"/>',
  plate: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/>',
  pan: '<path d="M3.5 11h13v1.5a5 5 0 0 1-5 5h-3a5 5 0 0 1-5-5z"/><path d="M16.5 12.5h4"/><path d="M8 8c0-1 1-1.4 1-2.4M12 8c0-1 1-1.4 1-2.4"/>',
  tips: '<path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>',
  recipe: '<path d="M5 4.5h10.5a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"/><path d="M5 18a2 2 0 0 1 2-2h10.5"/><path d="M9 8.5h5M9 11.5h3.5"/>',
  photo: '<path d="M4 8.5h3l1.6-2.3h6.8L17 8.5h3V19H4z"/><circle cx="12" cy="13.3" r="3.3"/>',
};

export function iconSvg(name, color, size = 24) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
}
