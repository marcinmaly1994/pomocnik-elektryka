import { AlertTriangle, Calculator, ClipboardList, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

/** Kroki odpowiadają 1:1 nazwom narzędzi/zakładek w interfejsie (patrz `ToolRail.tsx`
 *  i `FlowCard` w `App.tsx`) — laik szukający pomocy musi rozpoznać to, co widzi na
 *  ekranie, w tekście, który czyta. */
const KROKI: { tytul: string; opis: string }[] = [
  {
    tytul: "Wgraj rzut albo narysuj dom",
    opis: "W zakładce „Instalacja” wgraj zdjęcie lub skan rzutu mieszkania. Nie masz rzutu? Narysuj ściany od zera narzędziem „Narysuj Ścianę”.",
  },
  {
    tytul: "Ustaw skalę",
    opis: "Narzędziem „Kalibracja skali” wskaż na rzucie odcinek o znanej długości (np. szerokość drzwi) i podaj, ile ma metrów. Bez tego aplikacja nie policzy długości przewodów ani powierzchni pomieszczeń.",
  },
  {
    tytul: "Obrysuj i nazwij pomieszczenia",
    opis: "Narzędziem „Narysuj Pomieszczenie” obrysuj każde pomieszczenie i nadaj mu nazwę. Łazienka i kuchnia mają własne wymagania — aplikacja uwzględni je automatycznie po rozpoznaniu nazwy.",
  },
  {
    tytul: "Rozstaw gniazdka, łączniki i oświetlenie",
    opis: "Narzędziem „Wstaw Element” wybierz element z listy i kliknij na rzucie, żeby go postawić. Drzwi dodasz narzędziem „Drzwi”, klikając w ścianę albo krawędź pomieszczenia, w które mają być wstawione.",
  },
  {
    tytul: "Sprawdź rozdzielnicę i schemat",
    opis: "Zakładki „Rozdzielnica” i „Schemat” uzupełniają się same na podstawie tego, co postawiono na planie — dobór zabezpieczeń i schemat jednokreskowy nie wymagają osobnej pracy.",
  },
  {
    tytul: "Sprawdź kosztorys",
    opis: "Zakładka „Kosztorys” zestawia materiały i orientacyjny koszt instalacji na podstawie projektu — przydatne do rozmowy z wykonawcą albo własnej wyceny.",
  },
];

function Key({ children }: { children: string }) {
  return (
    <span className="pe-mono rounded border border-border bg-white px-1.5 py-0.5 text-[11px] text-ink shadow-sm">
      {children}
    </span>
  );
}

/**
 * Okno „Pomoc" — statyczna treść (nie zależy od store'a ani sesji), więc modal jest
 * lekki i można go otworzyć w dowolnym momencie bez efektów ubocznych. Zastępuje
 * dawny (i martwy — sekcja `#pomoc`, do której przewijał, nigdy nie istniała) link
 * przewijający stronę.
 */
export function HelpModal({ open, onClose }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Pomoc" className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <div className="space-y-6 text-[13px] leading-relaxed text-slate-600">
          <p>
            <strong className="text-ink">pomocnikelektryka.pl</strong> pomaga zaprojektować
            instalację elektryczną w domu albo mieszkaniu — od rzutu pomieszczeń, przez
            rozstawienie gniazdek i oświetlenia, po dobór zabezpieczeń, schemat jednokreskowy
            i kosztorys. Nie trzeba być elektrykiem, żeby zacząć: aplikacja prowadzi krok po
            kroku i sama uzupełnia to, co da się policzyć automatycznie.
          </p>

          <section>
            <h3 className="pe-display mb-3 text-[15px] text-ink">Jak zacząć — krok po kroku</h3>
            <ol className="space-y-3">
              {KROKI.map((k, i) => (
                <li key={k.tytul} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                    style={{ background: "#C1793F" }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <div className="font-semibold text-ink">{k.tytul}</div>
                    <p className="mt-0.5">{k.opis}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="pe-display mb-2 text-[15px] text-ink">Dodatkowe narzędzia</h3>
            <div className="space-y-2.5">
              <div className="flex gap-2.5">
                <Calculator size={16} className="mt-0.5 shrink-0 text-blueprint" />
                <p>
                  <strong className="text-ink">Kalkulatory</strong> — dobór przekroju
                  przewodu, spadki napięć, obciążenie przyłącza, natężenie oświetlenia i inne.
                  Działają niezależnie od projektu na planie.
                </p>
              </div>
              <div className="flex gap-2.5">
                <ClipboardList size={16} className="mt-0.5 shrink-0 text-blueprint" />
                <p>
                  <strong className="text-ink">Protokoły</strong> — protokoły z pomiarów
                  odbiorczych instalacji (rezystancja izolacji, pętla zwarcia i inne), do
                  wypełnienia po wykonaniu prac.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="pe-display mb-2 text-[15px] text-ink">Przydatne skróty klawiszowe</h3>
            <ul className="space-y-1.5">
              <li className="flex items-center gap-2">
                <Key>R</Key> obraca zaznaczony element albo otwór (drzwi) o 180°
              </li>
              <li className="flex items-center gap-2">
                <Key>Delete</Key> usuwa zaznaczenie
              </li>
              <li className="flex items-center gap-2">
                <Key>Enter</Key> zatwierdza rysowaną ścianę albo zaznaczony obszar
              </li>
              <li className="flex items-center gap-2">
                <Key>Esc</Key> anuluje bieżącą operację
              </li>
              <li>Prawy przycisk myszy pokazuje menu z dalszymi opcjami (usuń, edytuj, obróć).</li>
            </ul>
          </section>

          <section className="flex gap-2.5 rounded-lg border border-border p-3" style={{ background: "#F7F9FB" }}>
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ok" />
            <p>
              Bez konta projekt jest zapisywany tylko w tej przeglądarce — wyczyszczenie danych
              albo otwarcie na innym urządzeniu oznacza jego utratę. Załóż konto („Zabezpiecz
              kontem” / „Zaloguj się”), żeby zapisywać projekt w chmurze i mieć do niego dostęp
              z każdego urządzenia.
            </p>
          </section>

          <section
            className="flex gap-2.5 rounded-lg border p-3"
            style={{ borderColor: "#F0D9C8", background: "#FDF6F0" }}
          >
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
            <p>
              To narzędzie wspomaga projektowanie i naukę — nie zastępuje wiedzy ani
              odpowiedzialności osoby uprawnionej. Przed realizacją instalacji skonsultuj
              projekt z elektrykiem z uprawnieniami SEP.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
