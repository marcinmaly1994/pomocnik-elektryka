/**
 * Szczypanie dwoma palcami — sama arytmetyka gestu, bez ani jednego zdarzenia.
 *
 * PO CO OSOBNO: na dotyku jedyną drogą do przybliżenia rzutu były dotąd przyciski
 * `−` i `+` w pasku. `Ctrl` + kółko, czyli sposób, którego uczy podpowiedź po wgraniu
 * rzutu (patrz `podpowiedziNawigacji.ts`), na telefonie nie istnieje — a szczypanie,
 * po które sięga tam odruchowo każdy, powiększało CAŁĄ STRONĘ razem z paskami.
 *
 * Wyliczenia siedzą tutaj, bo są jedyną częścią gestu, którą da się sprawdzić bez
 * ekranu dotykowego: książkowanie palców (kto dotknął, kto puścił, kto został) musi
 * zostać przy płótnie, ale „o ile przybliżyć" to zwykła proporcja.
 */

export interface PunktEkranu {
  x: number;
  y: number;
}

/** Odległość między palcami [px] — miara „rozsunięcia" gestu. */
export function dystansPalcow(a: PunktEkranu, b: PunktEkranu): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Punkt między palcami — KOTWICA przybliżenia.
 *
 * To, co jest pod środkiem szczypania, ma pod nim zostać: dokładnie ta sama zasada,
 * co przy `Ctrl` + kółku, gdzie kotwicą jest kursor. Bez niej rzut ucieka spod palców
 * i po dwóch gestach nie wiadomo już, na co się patrzy.
 */
export function srodekPalcow(a: PunktEkranu, b: PunktEkranu): PunktEkranu {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Powiększenie po rozsunięciu palców — proporcja do stanu z chwili ROZPOCZĘCIA gestu.
 *
 * Liczone od początku gestu, a nie krok po kroku od poprzedniej klatki: mnożenie
 * przyrostów kumuluje błąd zaokrągleń i po dłuższym szczypaniu ten sam rozstaw palców
 * dawał inne powiększenie niż na starcie. Palce rozsunięte dwukrotnie mają znaczyć
 * „dwa razy bliżej", niezależnie od tego, ile klatek po drodze.
 *
 * Dystans początkowy bliski zeru (palce postawione jeden na drugim) zwraca stan bez
 * zmian — dzielenie przez niego dałoby nieskończoność i skok na maksimum suwaka.
 */
export function zoomZeSzczypania(
  zoomPoczatkowy: number,
  dystansPoczatkowy: number,
  dystansTeraz: number,
  granice: { min: number; max: number }
): number {
  if (!(dystansPoczatkowy > 1) || !Number.isFinite(dystansTeraz)) return zoomPoczatkowy;
  const proporcja = dystansTeraz / dystansPoczatkowy;
  return Math.min(granice.max, Math.max(granice.min, zoomPoczatkowy * proporcja));
}
