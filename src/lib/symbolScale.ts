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
export function autoSymbolScale(mpu: number | null, zRysunku = 1): number {
  return mpu !== null && mpu > 0 ? SKALA_ODNIESIENIA_MPU / mpu : zRysunku;
}

/**
 * Rozpiętość rysunku (jedn. planu), przy której symbole mają rozmiar bazowy.
 *
 * 240 jedn. to 12 m w skali rysowania odręcznego (`MANUAL_DRAW_SCALE_MPU`) — tyle ma
 * w dłuższym boku typowy dom jednorodzinny albo mieszkanie. Pod taki właśnie rysunek
 * dobrana jest geometria glifów, więc rzut tej wielkości nie zmienia się ani o piksel.
 */
export const ROZPIETOSC_ODNIESIENIA = 240;

/** To samo dla OBSZARU planu — używane, dopóki nie ma czego mierzyć na rysunku.
 *  1000 jedn. to szerokość domyślnego obszaru (`DEFAULT_PLAN_SIZE`). */
export const ROZPIETOSC_PLANU_ODNIESIENIA = 1000;

/** Sufit dla zgadywanej skali. Jedno zabłąkane kliknięcie daleko poza domem rozdyma
 *  obrys rysunku i bez tego wyhodowałoby symbole większe od pokoju. */
const MAKS_SKALA_Z_RYSUNKU = 20;

/**
 * Skala symboli dla rzutu BEZ SKALIBROWANEJ SKALI — zgadywana z wielkości rysunku.
 *
 * Bez kalibracji nie wiadomo, ile metrów ma jednostka planu, więc dotąd symbole miały
 * po prostu rozmiar bazowy: na rzucie rozciągniętym na kilka tysięcy jednostek gniazdko
 * schodziło do kilku pikseli i rysunek stawał się nieczytelny. Jedyna informacja, jaka
 * tu jest, to sam rysunek — jeśli obrys ścian i pomieszczeń jest dziesięć razy większy
 * od typowego, to znaczy, że jednostka planu jest dziesięć razy mniejsza niż przy
 * rysowaniu odręcznym, i symbol ma urosnąć tyle samo.
 *
 * To ZGADYWANIE, nie pomiar — stąd dwie ostrożności, których nie ma ścieżka
 * skalibrowana (`autoSymbolScale`):
 *
 * 1. Wynik nigdy nie schodzi PONIŻEJ 1. Rysunek mniejszy od typowego bywa po prostu
 *    zaczęty (jedna ściana, jeden pokój) i zmniejszanie symboli na podstawie takiego
 *    śladu psułoby czytelność zamiast ją poprawiać. Zmiana wyłącznie powiększa, więc
 *    żaden dzisiejszy rzut nie może przez nią wyglądać gorzej.
 * 2. Wynik jest ograniczony z góry — patrz `MAKS_SKALA_Z_RYSUNKU`.
 *
 * Po skalibrowaniu skali ta funkcja przestaje mieć znaczenie: `autoSymbolScale` bierze
 * wtedy zmierzone `mpu`, czyli liczbę, a nie domysł.
 */
export function skalaZRysunku(rozpietoscRysunku: number | null, rozpietoscPlanu: number | null): number {
  const rozpietosc =
    rozpietoscRysunku !== null && rozpietoscRysunku > 0
      ? rozpietoscRysunku / ROZPIETOSC_ODNIESIENIA
      : rozpietoscPlanu !== null && rozpietoscPlanu > 0
        ? rozpietoscPlanu / ROZPIETOSC_PLANU_ODNIESIENIA
        : 1;
  return Math.min(MAKS_SKALA_Z_RYSUNKU, Math.max(1, rozpietosc));
}

/** Skala renderu osprzętu: umowny rozmiar symbolu razy ustawienie suwaka. */
export function elementRenderScale(mpu: number | null, suwak: number, zRysunku = 1): number {
  return suwak * BASE_ELEMENT_SCALE * autoSymbolScale(mpu, zRysunku);
}

/**
 * Skala renderu przyborów sanitarnych — BEZ suwaka.
 *
 * Wanna nie jest symbolem umownym, tylko wymiarem: jej obrys to strefa 1 wg
 * PN-HD 60364-7-701 i walidator liczy odległości właśnie od niego. Gdyby suwak
 * powiększał również przybory, rysunek pokazywałby wannę większą niż strefa, którą
 * aplikacja faktycznie sprawdza — czyli kłamałby o jedynym miejscu, w którym pomyłka
 * kończy się porażeniem. Suwak zostaje przy osprzęcie, gdzie zmienia tylko czytelność.
 *
 * Zgadywana skala z rysunku (`zRysunku`) to co innego niż suwak i przybory JĄ słuchają.
 * Wchodzi w grę wyłącznie wtedy, gdy skali nie ma — a wtedy `checkPlan` w ogóle nie
 * sprawdza stref i mówi o tym wprost („Strefy ochronne niesprawdzone — brak skali").
 * Nie ma więc strefy, o której obrys mógłby kłamać; jest za to rysunek, na którym wanna
 * ma wyglądać jak wanna, a nie jak kropka obok pokoju szerokiego na tysiąc jednostek.
 */
export function sanitaryRenderScale(mpu: number | null, zRysunku = 1): number {
  return BASE_ELEMENT_SCALE * autoSymbolScale(mpu, zRysunku);
}
