import { MANUAL_DRAW_SCALE_MPU } from "@/lib/design";

/**
 * Rozmiar symboli w powiązaniu ze SKALĄ RZUTU.
 *
 * Problem: geometria glifów (patrz `glyphBoxSize`) jest podana w jednostkach planu i do
 * tej pory nie zależała od skali. Strefy ochronne, obrysy przyborów, szerokości drzwi
 * i podziałka są liczone w METRACH i przeliczane przez `mpu`. Dwie miary na jednym
 * rysunku rozjeżdżają się dokładnie wtedy, gdy skala odbiega od tej, pod którą glify
 * były rysowane: na rzucie wgranym jako podkład i skalibrowanym na 1 jedn. = 1 cm
 * gniazdko robi się pięć razy za małe, a strefa wokół wanny zostaje na swoim miejscu.
 *
 * Rozwiązanie: glify zachowują STAŁY ROZMIAR RZECZYWISTY. Renderowana skala rośnie
 * odwrotnie proporcjonalnie do `mpu`, więc symbol zajmuje na rysunku zawsze tyle samo
 * centymetrów ściany, niezależnie od tego, ile jednostek planu na te centymetry
 * przypada.
 *
 * Punktem odniesienia jest skala ręcznego rysowania, bo pod nią cała geometria glifów
 * była dobierana (stąd uwaga w PR o wannie pokrywającej się ze strefą przy 1 kratka =
 * 1 m). Projekty rysowane od zera nie zmieniają więc wyglądu ani o piksel — poprawiają
 * się wyłącznie te, które dziś wyglądają źle.
 */

/**
 * Bazowa geometria glifów okazała się za duża w skali planu (symbole zlewały się przy
 * gęściej rozstawionych punktach), więc RENDER zawsze mnożymy przez ten współczynnik —
 * niezależnie od tego, co pokazuje suwak. Suwak ma pokazywać „1.0×" jako punkt
 * odniesienia (czyli „bez zmian względem domyślnego"), a nie bazową, zbyt dużą geometrię.
 */
export const BASE_ELEMENT_SCALE = 0.7;

/** Wartość suwaka, od której użytkownik startuje i do której wraca „reset". To mnożnik
 *  WZGLĘDEM rozmiaru wynikającego ze skali rzutu, nie bezpośredni rozmiar renderu. */
export const DEFAULT_ELEMENT_SCALE = 1;

/** Skala, pod którą dobrana jest geometria glifów — patrz `MANUAL_DRAW_SCALE_MPU`. */
export const SKALA_ODNIESIENIA_MPU = MANUAL_DRAW_SCALE_MPU;

/**
 * Ile jednostek glifu przypada na metr rzeczywisty przy suwaku 1,0×.
 *
 * Potrzebne tam, gdzie symbol ma odwzorowywać PRAWDZIWY WYMIAR, a nie być umowny —
 * czyli przy przyborach sanitarnych, których obrys jest jednocześnie strefą 1.
 */
export const JEDNOSTKI_NA_METR = 1 / (SKALA_ODNIESIENIA_MPU * BASE_ELEMENT_SCALE);

/**
 * Mnożnik wyrównujący rozmiar symbolu do skali rzutu. 1,0 bez kalibracji — wtedy nie ma
 * czego wyrównywać i zostaje dotychczasowe zachowanie.
 *
 * Bez ograniczenia z góry i z dołu, świadomie: przy rzucie jednego mieszkania
 * skalibrowanym na 1 jedn. = 4 mm mnożnik dochodzi do kilkunastu i tak MA być — pokój
 * jest wtedy szeroki na tysiąc jednostek. Obcięcie tej wartości psułoby poprawne
 * przypadki, a niepoprawne (ktoś podał 5 m dla dwóch punktów odległych o 3 jednostki)
 * i tak są już zepsute wszędzie indziej: strefy i podziałka też nie mają ograniczeń.
 */
export function autoSymbolScale(mpu: number | null): number {
  return mpu !== null && mpu > 0 ? SKALA_ODNIESIENIA_MPU / mpu : 1;
}

/** Skala renderu osprzętu: umowny rozmiar symbolu razy ustawienie suwaka. */
export function elementRenderScale(mpu: number | null, suwak: number): number {
  return suwak * BASE_ELEMENT_SCALE * autoSymbolScale(mpu);
}

/**
 * Skala renderu przyborów sanitarnych — BEZ suwaka.
 *
 * Wanna nie jest symbolem umownym, tylko wymiarem: jej obrys to strefa 1 wg
 * PN-HD 60364-7-701 i walidator liczy odległości właśnie od niego. Gdyby suwak
 * powiększał również przybory, rysunek pokazywałby wannę większą niż strefa, którą
 * aplikacja faktycznie sprawdza — czyli kłamałby o jedynym miejscu, w którym pomyłka
 * kończy się porażeniem. Suwak zostaje przy osprzęcie, gdzie zmienia tylko czytelność.
 */
export function sanitaryRenderScale(mpu: number | null): number {
  return BASE_ELEMENT_SCALE * autoSymbolScale(mpu);
}
