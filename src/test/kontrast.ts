/**
 * Kontrast WCAG 2.x między dwoma kolorami `#RRGGBB`. Wspólne dla testów pilnujących
 * progów AA (tekst wtórny, miedź, tokeny) — żeby wzór żył w jednym miejscu.
 */
export function luminancja(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

export function kontrast(a: string, b: string): number {
  const [x, y] = [luminancja(a), luminancja(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
