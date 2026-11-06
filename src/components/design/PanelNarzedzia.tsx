import { Layers, Plus } from "lucide-react";
import type { ToolMode } from "./DesignCanvas";
import { RAIL_TOOLS } from "./railTools";

/**
 * Nagłówek panelu obok paska narzędzi: nazwa wybranego narzędzia i jedno zdanie, co
 * ono robi.
 *
 * Panel pokazywał dotąd zawsze zakładki „Elementy / Pomieszczenia", niezależnie od
 * narzędzia. Po wybraniu „Drzwi i okna", „Przesuń widok" czy „Kalibracja skali" pod
 * ich opcjami dalej wisiał katalog od poprzedniego wyboru, więc wyglądało to tak,
 * jakby menu nie reagowało na pasek. Teraz panel pokazuje wyłącznie to, co dotyczy
 * wybranego narzędzia — a nagłówek mówi wprost, które to jest.
 *
 * Nazwa i opis z `RAIL_TOOLS`, czyli z tego samego miejsca co podpowiedź paska —
 * żeby się nie rozjechały.
 */
export function NaglowekNarzedzia({ narzedzie }: { narzedzie: ToolMode }) {
  const t = RAIL_TOOLS.find((x) => x.id === narzedzie);
  if (!t) return null;
  const Ikona = t.icon;
  return (
    <div className="mb-2 flex items-start gap-2 px-0.5" data-testid="naglowek-narzedzia">
      <Ikona size={15} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />
      <div className="min-w-0">
        {/* h2, nie h3: logo w nagłówku strony jest przyciskiem, więc jego <h1> nie liczy się jako
            nagłówek, a ten jest pierwszym na ekranie edytora — przeskok od zera do h3 psuł
            hierarchię dla czytnika ekranu. */}
        <h2 className="text-sm font-semibold leading-tight text-ink">{t.label}</h2>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{t.hint}</p>
      </div>
    </div>
  );
}

/**
 * Treść panelu przy „Zaznacz", gdy nic nie jest zaznaczone.
 *
 * Na pustej kondygnacji — dwa przyciski startu. To zastępuje dawną regułę, według
 * której pusty rzut otwierał panel na zakładce „Pomieszczenia": nowy użytkownik
 * dostawał tam wskazówkę, od czego zacząć, i ta wskazówka nie może zniknąć razem
 * z zakładkami.
 */
export function PodpowiedzZaznacz({
  pustaKondygnacja,
  naDotyku,
  onWybierz,
}: {
  pustaKondygnacja: boolean;
  naDotyku: boolean;
  onWybierz: (narzedzie: ToolMode) => void;
}) {
  if (pustaKondygnacja) {
    return (
      <div className="space-y-2 text-xs leading-snug text-slate-500" data-testid="panel-zaznacz">
        <p>
          Na tej kondygnacji nic jeszcze nie ma. Zacznij od obrysowania pomieszczeń — od nich zależy podział na
          obwody, a w kuchni i łazience także strefy ochronne. Osprzęt możesz też stawiać od razu.
        </p>
        <button
          onClick={() => onWybierz("pomieszczenie")}
          className="pe-btn-copper flex w-full items-center justify-center gap-1.5 py-1.5 text-xs"
        >
          <Layers size={13} /> Obrysuj pierwsze pomieszczenie
        </button>
        <button onClick={() => onWybierz("elementy")} className="pe-btn-ghost flex w-full items-center justify-center gap-1.5 py-1.5 text-xs">
          <Plus size={13} /> Postaw pierwszy element
        </button>
      </div>
    );
  }
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs leading-snug text-slate-500" data-testid="panel-zaznacz">
      <li>{naDotyku ? "Stuknij" : "Kliknij"} element, ścianę, pomieszczenie albo trasę, żeby ją zaznaczyć — tu pojawią się jej opcje.</li>
      <li>{naDotyku ? "Przytrzymaj palec na obiekcie" : "Prawy przycisk myszy na obiekcie"}, żeby otworzyć menu z akcjami.</li>
      {!naDotyku && <li>Przeciągnij ramkę po pustym miejscu, żeby zaznaczyć kilka elementów naraz.</li>}
      {/* Skróty schowka (F2/F4 z audytu 5.11.2026) — bez tej linijki nikt by ich nie
          odkrył; tylko na klawiaturze, bo na dotyku nie ma czym ich nacisnąć. */}
      {!naDotyku && (
        <li>Ctrl+A zaznacza wszystko, Ctrl+C i Ctrl+V kopiują i wklejają — także na inną kondygnację.</li>
      )}
    </ul>
  );
}

/** Treść panelu przy „Przesuń widok" — narzędzie bez opcji, więc tylko jak go używać. */
export function PodpowiedzPrzesun({ naDotyku }: { naDotyku: boolean }) {
  return (
    <ul className="list-disc space-y-1 pl-4 text-xs leading-snug text-slate-500" data-testid="panel-przesun">
      <li>{naDotyku ? "Przesuwaj rzut palcem." : "Przeciągaj rzut myszą."}</li>
      <li>
        {naDotyku
          ? "Rozsuń albo zsuń dwa palce, żeby powiększyć lub pomniejszyć."
          : "Kółko myszy z Ctrl powiększa i pomniejsza; przytrzymana rolka przesuwa widok w każdym narzędziu."}
      </li>
      <li>„Dopasuj widok do planu” w pasku nad rzutem pokazuje cały rysunek.</li>
    </ul>
  );
}
