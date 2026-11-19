import { useEffect, useRef, useState } from "react";
import { useCalculatorsStore, type CalcId, type TrybObwodu } from "@/store/useCalculatorsStore";
import { useRoute } from "@/hooks/useRoute";
import { dopasujParam } from "@/lib/routing";
import { KalkulatorImpedancji } from "./KalkulatorImpedancji";
import { KalkulatorKompensacji } from "./KalkulatorKompensacji";
import { KalkulatorPeN } from "./KalkulatorPeN";
import { KalkulatorSPD } from "./KalkulatorSPD";
import { KalkulatorDoboruObwodu } from "./KalkulatorDoboruObwodu";
import { KalkulatorBilansuMocy } from "./KalkulatorBilansuMocy";
import { KalkulatorRCD } from "./KalkulatorRCD";
import { KalkulatorPetli } from "./KalkulatorPetli";
import { KalkulatorUziemieniaTT } from "./KalkulatorUziemieniaTT";
import { KalkulatorOswietlenia } from "./KalkulatorOswietlenia";
import { KalkulatorEV } from "./KalkulatorEV";
import { KalkulatorPV } from "./KalkulatorPV";
import { KalkulatorSilnika } from "./KalkulatorSilnika";
import { KalkulatorBilansuFaz } from "./KalkulatorBilansuFaz";
import { KalkulatorUziomu } from "./KalkulatorUziomu";
import { KalkulatorZwarcia } from "./KalkulatorZwarcia";
import { KalkulatorDlugosci } from "./KalkulatorDlugosci";
import { KalkulatorSpadku } from "./KalkulatorSpadku";
import { KalkulatorWkladkiGG } from "./KalkulatorWkladkiGG";
import { EkranStartowy, ListaKalkulatorow, SzukajkaKalkulatorow, WyborKalkulatoraMobile } from "./NawigacjaKalkulatorow";
import { filtruj, type GrupaId } from "@/lib/calc/grupy";

/**
 * Kolejność grupowana wg fazy pracy elektryka, nie wg tego, kiedy który kalkulator
 * powstał (patrz przegląd — sesja porządkująca zakładkę Kalkulatory):
 *  1. Bilans i zasilanie budynku — od ogółu (moc) do szczegółu (WLZ).
 *  2. Codzienny dobór obwodu — przekrój/zabezpieczenie/pełny dobór/wkładka gG,
 *     a na końcu spadek napięcia: to narzędzie WERYFIKUJE gotową trasę
 *     („sprawdzenie trasy o znanym przekroju”), więc pasuje za doborem, nie przed nim.
 *  3. Dane wejściowe do ochrony — impedancja przewodu i prądy zwarciowe, w tej
 *     kolejności: pierwsze jest budulcem drugiego (Zk do liczenia Ik).
 *  4. Ochrona przeciwporażeniowa — pętla TN, uziemienie TT, uziom, RCD, PE/N.
 *  5. Obciążenia specjalne i jakość zasilania.
 *  6. Instalacje specjalne (opcjonalne, coraz częstsze) — PV, EV, oświetlenie.
 */
/**
 * Adresy czterech kalkulatorow scalonych w „Dobor obwodu" — kazdy prowadzi do
 * wlasciwego TRYBU, a nie tylko do nowej strony.
 *
 * Linki do nich sa juz w obiegu (w mailach, notatkach, na forach), a kalkulator
 * elektryczny bez wynikow to dla odbiorcy taki sam blad jak 404. Przekierowanie
 * zachowuje intencje: kto szukal doboru zabezpieczenia, trafia w tryb „Mam przekroj",
 * a nie na ekran, na ktorym musi zgadnac, gdzie sie to teraz znajduje.
 */
const TRYBY_OBWODU: TrybObwodu[] = ["przekroj", "zabezpieczenie", "wlz", "pelny"];

const STARE_ADRESY: Record<string, TrybObwodu> = {
  przekroj: "przekroj",
  zabezpieczenie: "zabezpieczenie",
  pelnyDobor: "pelny",
  "pelny-dobor": "pelny",
  wlz: "wlz",
};

const CALC_LIST: { id: CalcId; label: string; desc: string }[] = [
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana i prąd do wniosku o przyłączenie" },
  { id: "obwod", label: "Dobór obwodu", desc: "przekrój, zabezpieczenie, WLZ i cztery kryteria w jednym" },
  { id: "gGWkladka", label: "Dobór wkładki gG", desc: "ochrona przeciwporażeniowa — zabezpieczenie topikowe" },
  { id: "spadek", label: "Spadek napięcia", desc: "sprawdzenie trasy o znanym przekroju" },
  { id: "dlugosc", label: "Maksymalna długość obwodu", desc: "ile metrów wolno pociągnąć — spadek i zadziałanie zabezpieczenia" },
  { id: "impedancja", label: "Impedancja przewodu", desc: "R, X, Z oraz przewody równoległe" },
  { id: "zwarcie", label: "Prądy zwarciowe", desc: "Ik, prąd udarowy, wytrzymałość cieplna" },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "ochrona przeciwporażeniowa — układ TN" },
  { id: "uziemienieTT", label: "Rezystancja uziemienia", desc: "ochrona przeciwporażeniowa — układ TT" },
  { id: "uziom", label: "Uziom — dobór geometrii", desc: "pręt, bednarka, otok; potrzebna długość" },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD — lista kontrolna, bez obliczeń" },
  { id: "peN", label: "Dobór przewodu PE i N", desc: "reguła, warunek cieplny, harmoniczne" },
  { id: "bilansFaz", label: "Bilans faz i prąd w N", desc: "asymetria, przewód neutralny, 3. harmoniczna" },
  { id: "kompensacja", label: "Kompensacja mocy biernej", desc: "moc baterii, pojemność, rezonans" },
  { id: "silnik", label: "Silnik indukcyjny", desc: "rozruch, zabezpieczenia, spadek przy starcie" },
  { id: "spd", label: "Ochronniki przepięć (SPD)", desc: "koordynacja Up, długość przewodów" },
  { id: "pv", label: "Instalacja fotowoltaiczna", desc: "string DC, Voc na zimno, spadek DC, AC falownika" },
  { id: "ev", label: "Ładowarka pojazdu elektrycznego", desc: "praca ciągła, wymagany typ RCD" },
  { id: "oswietlenie", label: "Dobór oświetlenia", desc: "strumień świetlny i liczba opraw" },
];

export function CalculatorsTab() {
  // Stan (wejścia i lista odbiorników w bilansie mocy) mieszka w osobnym,
  // trwałym store'zie (`useCalculatorsStore`, localStorage) — bez tego
  // wszystko znikało przy zmianie zakładki albo odświeżeniu strony. Selektory
  // pojedynczych pól (zamiast jednego selektora zwracającego obiekt) to ten
  // sam wzorzec co `useProjectStore` w całej aplikacji — każdy komponent
  // subskrybuje tylko to, co faktycznie czyta.
  const zapisanyActiveCalc = useCalculatorsStore((s) => s.activeCalc);
  const zapisaneOstatnie = useCalculatorsStore((s) => s.ostatnieKalkulatory);
  const zwinieteGrupy = useCalculatorsStore((s) => s.zwinieteGrupy);
  const [frazaSzukania, setFrazaSzukania] = useState("");
  // Tryb „Doboru obwodu” — tu tylko do nawigacji (`?tryb=` w adresie, stare adresy).
  const trybObwodu = useCalculatorsStore((s) => s.trybObwodu);
  const patch = useCalculatorsStore((s) => s.patch);

  /**
   * Identyfikator wczytany z localStorage może pochodzić ze STARSZEJ wersji, w
   * której kalkulatory nazywały się inaczej — np. „przewod" sprzed rozbicia na
   * „przekroj" i „zabezpieczenie". Taki nieznany identyfikator wywracał całą
   * zakładkę: `CALC_LIST.find(...)!` zwracało `undefined`, a odczyt `.label`
   * kończył się białym ekranem u KAŻDEGO, kto korzystał z kalkulatorów przed
   * aktualizacją (świeży localStorage tego nie pokazuje, więc łatwo to przeoczyć).
   * Cofamy się do pierwszej pozycji zamiast ufać zapisanej wartości.
   */
  /**
   * Który kalkulator jest otwarty — z pierwszeństwem dla ADRESU.
   *
   * Trzy źródła, w tej właśnie kolejności:
   *  1. parametr z URL („/kalkulatory/spadek") — bo link przysłany przez kogoś ma
   *     otworzyć TO, co w nim jest, a nie to, co akurat siedzi w localStorage;
   *  2. wartość zapisana z poprzedniej wizyty — wejście na samo „/kalkulatory"
   *     wraca tam, gdzie się skończyło;
   *  3. pierwsza pozycja listy — patrz komentarz o białym ekranie wyżej.
   */
  const [route, nawiguj] = useRoute();
  const zParamu = dopasujParam(
    route.tab === "kalkulatory" ? route.param : null,
    CALC_LIST.map((c) => c.id)
  );
  /**
   * `null` = ekran startowy z kafelkami.
   *
   * Wejscie na samo „/kalkulatory" przekierowywalo wczesniej do OSTATNIO otwartego
   * kalkulatora, wiec ktos, kto wchodzil tu pierwszy raz, ladowal w „Doborze obwodu"
   * bez pojecia, ze obok jest siedemnascie innych narzedzi. Pamiec o ostatnim
   * kalkulatorze zostaje — ale jako SKROT na ekranie startowym, nie jako przekierowanie.
   */
  const activeCalc: CalcId | null = zParamu ?? null;

  /**
   * Doprowadza adres do postaci KANONICZNEJ. Trzy przypadki, jeden warunek:
   * wejście na samo „/kalkulatory", parametr wskazujący na nieistniejący kalkulator
   * oraz poprawny, ale inaczej zapisany („/kalkulatory/ggwkladka" zamiast
   * „…/gGWkladka" — patrz `dopasujParam`). W każdym z nich w pasku ma zostać jedna,
   * przewidywalna postać adresu, bo to ją użytkownik skopiuje i wyśle dalej.
   *
   * `replace`, nie `push`: użytkownik nigdzie nie przeszedł, więc „wstecz" nie ma go
   * zawracać na adres, który natychmiast przekieruje z powrotem.
   */
  useEffect(() => {
    if (route.tab !== "kalkulatory") return;
    // Stary adres czterech scalonych kalkulatorow: ustaw tryb i przejdz na „obwod".
    const tryb = route.param ? STARE_ADRESY[route.param] : undefined;
    if (tryb) {
      patch({ trybObwodu: tryb });
      nawiguj("kalkulatory", "obwod", { replace: true });
      return;
    }
    // Brak parametru to WIDOK, nie brak danych — nie ma czego prostowac.
    if (activeCalc && route.param !== activeCalc) nawiguj("kalkulatory", activeCalc, { replace: true });
  }, [route.tab, route.param, activeCalc, nawiguj, patch]);

  /**
   * Tryb w adresie jako `?tryb=…`.
   *
   * Query trzymamy poza routerem (`useRoute` czyta sama sciezke), bo tryb nie jest
   * osobnym widokiem, tylko ustawieniem jednego kalkulatora — ale MA byc w adresie,
   * zeby dalo sie przyslac komus link prosto do „Mam przekroj" i zeby przekierowania
   * ze starych adresow mialy dokad prowadzic.
   */
  const trybWzietyZAdresu = useRef(false);
  useEffect(() => {
    if (route.tab !== "kalkulatory" || activeCalc !== "obwod") return;
    const zAdresu = new URLSearchParams(window.location.search).get("tryb");
    // Adres ustawia tryb TYLKO przy wejściu. Bez tego ograniczenia kliknięcie
    // w zakładkę trybu było natychmiast cofane przez `?tryb=` z paska — adres
    // wygrywał z użytkownikiem i przełącznik wyglądał na zepsuty.
    if (!trybWzietyZAdresu.current) {
      trybWzietyZAdresu.current = true;
      const znany = TRYBY_OBWODU.find((t) => t === zAdresu);
      if (znany && znany !== trybObwodu) {
        patch({ trybObwodu: znany });
        return;
      }
    }
    if (zAdresu !== trybObwodu) {
      window.history.replaceState(null, "", `${window.location.pathname}?tryb=${trybObwodu}`);
    }
  }, [route.tab, route.param, activeCalc, trybObwodu, patch]);

  // Wybór z listy tylko NAWIGUJE — zapisem zajmuje się efekt niżej, jedną drogą dla
  // wszystkich sposobów otwarcia kalkulatora.
  const setActiveCalc = (v: CalcId) => nawiguj("kalkulatory", v);

  /**
   * Zapamiętuje otwarty kalkulator na kolejną wizytę (samo „/kalkulatory" wraca do
   * niego zamiast do pierwszej pozycji listy).
   *
   * Zapis siedzi w EFEKCIE, a nie w obsłudze kliknięcia, bo kalkulator otwiera się
   * na dwa sposoby: klikiem w listę i wprost z adresu — a link przysłany przez kogoś
   * to też „ostatnio używany". Przy zapisie tylko przy kliknięciu wejście z linku na
   * „/kalkulatory/zwarcie", a potem na samo „/kalkulatory", odsyłało do czegoś zupełnie
   * innego, mimo że pomiędzy nie było żadnego wyboru.
   */
  useEffect(() => {
    if (route.tab !== "kalkulatory" || !activeCalc) return;
    // Lista ostatnich: najswiezszy na przodzie, bez powtorzen, maksymalnie trzy —
    // dluzsza przestaje byc skrotem i staje sie druga lista wszystkiego.
    const ostatnie = [activeCalc, ...zapisaneOstatnie.filter((id) => id !== activeCalc)].slice(0, 3);
    const bezZmian = ostatnie.length === zapisaneOstatnie.length && ostatnie.every((id, i) => id === zapisaneOstatnie[i]);
    if (!bezZmian) patch({ ostatnieKalkulatory: ostatnie });
    if (zapisanyActiveCalc !== activeCalc) patch({ activeCalc });
  }, [route.tab, activeCalc, zapisanyActiveCalc, zapisaneOstatnie, patch]);

  // `null` przy ekranie startowym — patrz `activeCalc` wyżej. Tytuły kart czytają
  // z tego obiektu, więc renderują się tylko razem z wybranym kalkulatorem.
  const active = CALC_LIST.find((c) => c.id === activeCalc) ?? CALC_LIST[0];

  return (
    /*
     * Pola na wąskim ekranie mają 16 px. Safari na iPhonie przy stuknięciu w pole
     * z mniejszą czcionką przybliża stronę i sam jej już nie oddala — przy kalkulatorze
     * z czternastoma polami oznaczało to ręczne oddalanie po każdym z nich. Jeden
     * selektor na korzeniu zamiast klasy w każdym polu: `.x input` wygrywa z `text-sm`
     * na samym polu, a nowe pola dostają to same.
     */
    <div className="space-y-5 max-md:[&_:is(input,select,textarea)]:text-base">
      <div>
        <h2 className="pe-display text-xl mb-1">Kalkulatory elektryczne</h2>
        <p className="text-sm text-slate-500">
          Szybkie, orientacyjne obliczenia pomocnicze do wstępnego projektowania instalacji.
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* Lista boczna: wyszukiwarka nad grupami. `sticky`, bo przy osiemnastu
            pozycjach i długim wyniku wybór kolejnego kalkulatora wymagał wcześniej
            przewinięcia całej strony z powrotem do góry.

            Na ekranie startowym jej NIE MA: te same pozycje są tam kafelkami, więc
            lista obok byłaby drugą kopią tej samej nawigacji — i zabierałaby jedną
            trzecią szerokości, która przydaje się kafelkom.

            Poniżej `lg` znika na rzecz `WyborKalkulatoraMobile`: przy zawijaniu
            siadała nad treścią i spychała właściwy kalkulator dwa ekrany w dół.

            Wysokość najwyżej okna: przyklejona lista wyższa od ekranu chowała dolne
            pozycje pod jego krawędzią. Jeśli po rozwinięciu wszystkich grup nadal się
            nie mieści, przewija się sama lista, a wyszukiwarka zostaje na górze. */}
        {activeCalc && (
        <div
          className="hidden self-start lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100vh-2rem)] lg:flex-col"
          style={{ width: 260, flexShrink: 0, flexGrow: 0 }}
          data-testid="lista-kalkulatorow"
        >
          <SzukajkaKalkulatorow
            fraza={frazaSzukania}
            onZmien={setFrazaSzukania}
            liczbaWynikow={filtruj(CALC_LIST, frazaSzukania).length}
          />
          <div className="-mx-1 min-h-0 overflow-y-auto px-1 pb-1">
          <ListaKalkulatorow
            zwarta
            lista={CALC_LIST}
            aktywny={activeCalc}
            fraza={frazaSzukania}
            zwiniete={zwinieteGrupy as GrupaId[]}
            onPrzelaczGrupe={(id) =>
              patch({
                zwinieteGrupy: zwinieteGrupy.includes(id)
                  ? zwinieteGrupy.filter((g) => g !== id)
                  : [...zwinieteGrupy, id],
              })
            }
            onWybierz={setActiveCalc}
          />
          </div>
        </div>
        )}

        {/* Kalkulator najwyżej 60rem. Na całą szerokość przy 1920 px pole „Moc" na
            „2000" miało 700 px, jednostka „W" stała daleko za nim, a „Rachunek krok po
            kroku" ciągnął się w wierszach po 200 znaków. Ekran startowy (bez listy
            bocznej) zostaje szeroki — tam miejsce zajmują kafelki w trzech kolumnach. */}
        <div style={{ flex: "1 1 480px", minWidth: 320, maxWidth: activeCalc ? "60rem" : undefined }} data-testid="kalkulator">
          {activeCalc && (
            <WyborKalkulatoraMobile
              lista={CALC_LIST}
              aktywny={activeCalc}
              fraza={frazaSzukania}
              onZmienFraze={setFrazaSzukania}
              zwiniete={zwinieteGrupy as GrupaId[]}
              onPrzelaczGrupe={(id) =>
                patch({
                  zwinieteGrupy: zwinieteGrupy.includes(id)
                    ? zwinieteGrupy.filter((g) => g !== id)
                    : [...zwinieteGrupy, id],
                })
              }
              onWybierz={setActiveCalc}
            />
          )}
          {/* Bez wybranego kalkulatora pokazujemy, CO tu w ogóle jest — zamiast
              wrzucać w ostatnio otwarty, którego nowy użytkownik nie wybierał. */}
          {!activeCalc && (
            <>
              <div className="mb-4 max-w-sm">
                <SzukajkaKalkulatorow
                  fraza={frazaSzukania}
                  onZmien={setFrazaSzukania}
                  liczbaWynikow={filtruj(CALC_LIST, frazaSzukania).length}
                />
              </div>
              <EkranStartowy
                lista={filtruj(CALC_LIST, frazaSzukania)}
                ostatnie={frazaSzukania.trim() ? [] : zapisaneOstatnie}
                onWybierz={setActiveCalc}
              />
            </>
          )}
          {/* `key` przemontowuje kartę przy zmianie kalkulatora i odpala przenikanie od nowa.
              Bezpieczne: wartości pól są w store, a lokalny stan (rozwinięte „Jak to działa")
              i tak był osobny dla każdego kalkulatora — każdy stoi we własnej gałęzi JSX.
              Przełącznik trybu obwodu NIE zmienia `activeCalc`, więc nie przemontowuje. */}
          <div
            key={activeCalc ?? "start"}
            data-karta-kalkulatora
            className="motion-safe:animate-przenikanie-szybko"
          >
          {activeCalc === "obwod" && <KalkulatorDoboruObwodu label={active.label} />}

          {activeCalc === "gGWkladka" && <KalkulatorWkladkiGG label={active.label} />}

          {activeCalc === "spadek" && <KalkulatorSpadku label={active.label} />}

          {activeCalc === "dlugosc" && <KalkulatorDlugosci label={active.label} />}

          {activeCalc === "zwarcie" && <KalkulatorZwarcia label={active.label} />}

          {activeCalc === "uziom" && <KalkulatorUziomu label={active.label} />}

          {activeCalc === "bilansFaz" && <KalkulatorBilansuFaz label={active.label} />}

          {activeCalc === "silnik" && <KalkulatorSilnika label={active.label} />}

          {activeCalc === "impedancja" && <KalkulatorImpedancji label={active.label} />}

          {activeCalc === "peN" && <KalkulatorPeN label={active.label} />}

          {activeCalc === "spd" && <KalkulatorSPD label={active.label} />}

          {activeCalc === "pv" && <KalkulatorPV label={active.label} />}

          {activeCalc === "ev" && <KalkulatorEV label={active.label} />}

          {activeCalc === "kompensacja" && <KalkulatorKompensacji label={active.label} />}

          {activeCalc === "moc" && <KalkulatorBilansuMocy label={active.label} />}

          {activeCalc === "petla" && <KalkulatorPetli label={active.label} />}

          {activeCalc === "uziemienieTT" && <KalkulatorUziemieniaTT label={active.label} />}

          {activeCalc === "oswietlenie" && <KalkulatorOswietlenia label={active.label} />}

          {activeCalc === "rcd" && <KalkulatorRCD label={active.label} />}
          </div>
        </div>
      </div>
    </div>
  );
}
