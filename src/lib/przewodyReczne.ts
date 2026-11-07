import type { ElementType, RodzajPrzewodu } from "@/types";
import { ELEMENT_TYPES } from "@/lib/elements";

/**
 * Ręczne przewody (F11 z audytu 5.11.2026): rodzaje, ich wygląd i domyślny opis kabla.
 *
 * Kreska jest celowo INNA niż u tras automatycznych (ciągła = zasilanie obwodu,
 * kropkowana = sterowanie, kreskowana = szacunek — patrz `KLUCZ_TRAS`): przewód ręczny
 * ma kreskę z kropką i ciemny kolor, żeby na wydruku nie dało się go pomylić z trasą
 * policzoną przez aplikację.
 */
export const RODZAJE_PRZEWODU: Record<RodzajPrzewodu, { etykieta: string; kolor: string; kreska: number[] }> = {
  zasilanie: { etykieta: "Zasilanie", kolor: "#334155", kreska: [10, 3, 2, 3] },
  sterowanie: { etykieta: "Sterowanie", kolor: "#3B8C63", kreska: [6, 3, 2, 3] },
  teletechnika: { etykieta: "Teletechnika", kolor: "#0F8A9E", kreska: [8, 3, 2, 3, 2, 3] },
};

/**
 * Typowy przewód dla danej pary elementów — wpisywany od razu, żeby świeżo
 * poprowadzony przewód miał na rysunku sensowny opis, a nie pusty.
 *
 * - teletechnika na którymkolwiek końcu (gniazdo LAN/TV, domofon, szafka) → skrętka;
 * - łącznik/czujnik ↔ oprawa → sterowanie, 3 × 1,5;
 * - reszta → zasilanie, 3 × 2,5 (gniazda), a gdy po drodze jest oprawa — 3 × 1,5.
 */
export function domyslnyPrzewod(a: ElementType, b: ElementType): { rodzaj: RodzajPrzewodu; kabel: string } {
  const rola = (t: ElementType) => ELEMENT_TYPES[t].role;
  const tele = (t: ElementType) => rola(t) === "lv" || t === "szafkaTeletech";
  if (tele(a) || tele(b)) {
    const antenowy = a === "rtvsat" || b === "rtvsat";
    return { rodzaj: "teletechnika", kabel: antenowy ? "RG-6 (koncentryk)" : "U/UTP kat. 6" };
  }
  const swiatlo = (t: ElementType) => rola(t) === "light";
  const sterujacy = (t: ElementType) => rola(t) === "control";
  if ((sterujacy(a) && swiatlo(b)) || (sterujacy(b) && swiatlo(a)) || (sterujacy(a) && sterujacy(b))) {
    return { rodzaj: "sterowanie", kabel: "YDYp 3×1,5" };
  }
  if (swiatlo(a) || swiatlo(b)) return { rodzaj: "zasilanie", kabel: "YDYp 3×1,5" };
  if (a === "gniazdko400" || b === "gniazdko400") return { rodzaj: "zasilanie", kabel: "YDYp 5×2,5" };
  return { rodzaj: "zasilanie", kabel: "YDYp 3×2,5" };
}
