import { AlertTriangle, Calculator, ClipboardList, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { wrocFokusDoOtwieracza } from "@/lib/wrocFokus";
import { KROKI, SKROTY } from "./pomocTresc";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
  /** Przejście do polityki prywatności. Okno zamyka się samo — zostawione nad stroną
   *  zasłaniałoby dokument, po który się kliknęło. */
  onOtworzPrywatnosc: () => void;
}

function Key({ children }: { children: string }) {
  return (
    <span className="pe-mono rounded border border-border bg-white px-1.5 py-0.5 text-xs text-ink shadow-sm">
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
export function HelpModal({ open, onClose, onOtworzPrywatnosc }: HelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* Bez DialogTrigger (sterowane z App) — patrz `wrocFokusDoOtwieracza`. */}
      <DialogContent
        title="Pomoc"
        className="max-h-[85vh] max-w-2xl overflow-y-auto"
        onCloseAutoFocus={wrocFokusDoOtwieracza("pomoc")}
      >
        <div className="space-y-6 text-sm leading-relaxed text-slate-600">
          <p>
            <strong className="text-ink">pomocnikelektryka.pl</strong> pomaga zaprojektować
            instalację elektryczną w domu albo mieszkaniu — od rzutu pomieszczeń, przez
            rozstawienie gniazdek i oświetlenia, po dobór zabezpieczeń, schemat jednokreskowy
            i kosztorys. Nie trzeba być elektrykiem, żeby zacząć: aplikacja prowadzi krok po
            kroku i sama uzupełnia to, co da się policzyć automatycznie.
          </p>

          <section>
            <h3 className="pe-display mb-3 text-base text-ink">Jak zacząć — krok po kroku</h3>
            <ol className="space-y-3">
              {KROKI.map((k, i) => (
                <li key={k.tytul} className="flex gap-3">
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: "#9A5A27" }}
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
            <h3 className="pe-display mb-2 text-base text-ink">Dodatkowe narzędzia</h3>
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
            <h3 className="pe-display mb-2 text-base text-ink">Przydatne skróty klawiszowe</h3>
            <ul className="space-y-1.5">
              {SKROTY.map((s) => (
                <li key={s.klawisz} className="flex items-center gap-2">
                  <Key>{s.klawisz}</Key> {s.opis}
                </li>
              ))}
              <li>Prawy przycisk myszy pokazuje menu z dalszymi opcjami (usuń, edytuj, obróć).</li>
            </ul>
          </section>

          {/* „Twoje dane" zamiast dawnej, bezimiennej ramki o zapisie lokalnym.
              Ta sama informacja jest w polityce prywatności, ale tam trafia ktoś, kto
              już ma pytanie — a tu ktoś, kto dopiero zaczyna i właśnie decyduje, czy
              zakładać konto. Pełny dokument zostaje jeden (link na końcu), żeby nie
              powstała druga wersja prawdy, która z czasem rozjedzie się z pierwszą. */}
          <section className="rounded-lg border border-border p-3" style={{ background: "#F7F9FB" }}>
            <h3 className="pe-display mb-2 flex items-center gap-2 text-base text-ink">
              <ShieldCheck size={16} className="shrink-0 text-ok" />
              Twoje dane
            </h3>
            <div className="space-y-2">
              <p>
                Bez konta projekt jest zapisywany tylko w tej przeglądarce — wyczyszczenie danych
                albo otwarcie na innym urządzeniu oznacza jego utratę. Załóż konto („Zabezpiecz
                kontem” / „Zaloguj się”), żeby zapisywać projekt w chmurze i mieć do niego dostęp
                z każdego urządzenia.
              </p>
              <p>
                Dopiero konto sprawia, że cokolwiek trafia na serwer: adres e-mail i zapisane
                projekty. Aplikacja <strong className="text-ink">nie używa ciasteczek</strong> ani
                narzędzi śledzących, a konto razem ze wszystkimi projektami możesz skasować sam
                w każdej chwili („Ustawienia konta” → „Usuń konto”).
              </p>
              <p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOtworzPrywatnosc();
                  }}
                  className="text-blueprint underline decoration-blueprint/40 underline-offset-2 hover:decoration-blueprint"
                >
                  Przeczytaj politykę prywatności
                </button>
              </p>
            </div>
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
