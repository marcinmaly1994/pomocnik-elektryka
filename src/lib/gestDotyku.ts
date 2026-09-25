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

/**
 * O ile palec musi się ruszyć [px], zanim uznamy, że PRZESUWA, a nie dotyka.
 *
 * Poniżej tego progu ruch to drżenie ręki przy zwykłym dotknięciu — a dotknięcie
 * stawia element albo punkt ściany. Przesuwanie odpalone od pierwszego piksela
 * zjadałoby co trzecie takie dotknięcie.
 */
export const PROG_PRZESUWANIA_PX = 10;

export type KierunekPalca = "za-wcześnie" | "poziomo" | "pionowo";

/**
 * Czym jest ruch JEDNEGO palca nad płótnem: przesuwaniem rzutu czy przewijaniem strony.
 *
 * Płótno oddaje przeglądarce ruch pionowy (`touch-action: pan-y`), bo zajmuje pół
 * ekranu telefonu i bez tego strony nie dałoby się przewinąć znad rzutu. Ruch w bok
 * strona i tak na nic nie zamienia — więc ten należy do rzutu.
 *
 * Rozstrzyga PIERWSZY ruch ponad próg, dalej gest trzyma się tej decyzji: rzut chwycony
 * w bok da się potem ciągnąć w dowolną stronę, a przewijanie strony nie zamienia się
 * w połowie w przesuwanie rzutu.
 */
export function kierunekPalca(dx: number, dy: number, prog = PROG_PRZESUWANIA_PX): KierunekPalca {
  if (Math.hypot(dx, dy) < prog) return "za-wcześnie";
  return Math.abs(dx) >= Math.abs(dy) ? "poziomo" : "pionowo";
}

/**
 * Kadr, w którym punkt planu `kotwica` leży dokładnie pod punktem ekranu `palec`.
 *
 * Wspólna zasada przesuwania i przybliżania dotykiem: to, co palec chwycił, jedzie
 * razem z nim. `palec` jest liczony względem płótna, `kotwica` i wynik — w jednostkach
 * planu (lewy górny róg okna).
 */
export function kadrPodPalcem(kotwica: PunktEkranu, palec: PunktEkranu, zoom: number): PunktEkranu {
  return { x: kotwica.x - palec.x / zoom, y: kotwica.y - palec.y / zoom };
}
