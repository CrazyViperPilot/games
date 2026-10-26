// Eigene, einfache SVG-Grafiken: Katzengesicht und X.

/** Katzengesicht; Kopf in currentColor, damit Fehler per CSS rot werden können. */
export const CAT_SVG = `<svg class="cat" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M14 46 L20 8 L44 28 Z M86 46 L80 8 L56 28 Z" fill="currentColor"/>
  <path d="M21 17 L25 33 L34 27 Z M79 17 L75 33 L66 27 Z" fill="var(--cat-ear)"/>
  <ellipse cx="50" cy="56" rx="38" ry="33" fill="currentColor"/>
  <ellipse cx="35" cy="53" rx="7.5" ry="9" fill="var(--cat-eye)"/>
  <ellipse cx="65" cy="53" rx="7.5" ry="9" fill="var(--cat-eye)"/>
  <ellipse cx="35" cy="54" rx="2.6" ry="7" fill="#1b1a1f"/>
  <ellipse cx="65" cy="54" rx="2.6" ry="7" fill="#1b1a1f"/>
  <path d="M45 66 L55 66 L50 72 Z" fill="var(--cat-nose)"/>
  <path d="M50 72 Q50 78 43 78 M50 72 Q50 78 57 78" stroke="var(--cat-line)" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <path d="M30 68 L8 64 M30 73 L9 76 M70 68 L92 64 M70 73 L91 76" stroke="var(--cat-line)" stroke-width="2.2" stroke-linecap="round"/>
</svg>`;

/** Katze mit Krone, für Logo und Icon. */
export const CROWN_CAT_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M30 22 L34 4 L42 14 L50 0 L58 14 L66 4 L70 22 Z" fill="#ffc83d" stroke="#d99a00" stroke-width="2" stroke-linejoin="round"/>
  <g transform="translate(5 14) scale(0.9)">${CAT_SVG.replace(/<\/?svg[^>]*>/g, '')}</g>
</svg>`;

export const CROSS_SVG = `<svg class="x" viewBox="0 0 100 100" aria-hidden="true"><path d="M30 30 L70 70 M70 30 L30 70" stroke="currentColor" stroke-width="9" stroke-linecap="round"/></svg>`;
