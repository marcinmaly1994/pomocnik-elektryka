import { useRef, useState } from "react";
import { Archive, Download, Upload } from "lucide-react";
import { useProjectStore, type ProjectPayload } from "@/store/useProjectStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { czytajKopie, zapiszKopie } from "@/lib/kopiaProjektu";

/**
 * „Kopia zapasowa" w pasku projektu: zapis projektu do pliku i powrót z pliku.
 *
 * Stoi TUTAJ, a nie w ustawieniach konta, i to jest cała rzecz. Eksport istniał
 * wcześniej wyłącznie w oknie konta, które renderuje się dopiero po zalogowaniu —
 * więc kopii nie mógł zrobić nikt bez konta, czyli dokładnie ta osoba, której
 * aplikacja pokazuje stały baner o tym, że projekt żyje wyłącznie w tej przeglądarce.
 * Odczytu nie było w ogóle.
 *
 * Wczytanie kopii PODMIENIA bieżący projekt bezpowrotnie, więc pyta o zgodę tak samo
 * jak „Nowy projekt" — z tą różnicą, że tu da się jeszcze zawrócić, bo plik leży na
 * dysku.
 */
export function KopiaZapasowa() {
  const getProjectPayload = useProjectStore((s) => s.getProjectPayload);
  const loadProjectPayload = useProjectStore((s) => s.loadProjectPayload);
  const projectName = useProjectStore((s) => s.projectName);
  const elementCount = useProjectStore((s) => s.draft.elements.length);

  const wejscieRef = useRef<HTMLInputElement>(null);
  /** Kopia przeczytana z pliku i czekająca na potwierdzenie podmiany. */
  const [doWczytania, setDoWczytania] = useState<ProjectPayload | null>(null);
  /** Powód odrzucenia wskazanego pliku. */
  const [blad, setBlad] = useState<string | null>(null);

  async function obsluzPlik(e: React.ChangeEvent<HTMLInputElement>) {
    const plik = e.target.files?.[0];
    // Czyścimy WARTOŚĆ pola, nie dopiero po sukcesie: bez tego wskazanie tego samego
    // pliku po raz drugi (np. po pomyłkowym „Anuluj") nie odpala już `change`,
    // bo dla przeglądarki nic się nie zmieniło.
    e.target.value = "";
    if (!plik) return;

    let tekst: string;
    try {
      tekst = await plik.text();
    } catch {
      setBlad("Nie udało się odczytać pliku. Sprawdź, czy nadal jest w tym samym miejscu.");
      return;
    }

    const wynik = czytajKopie(tekst);
    if (wynik.ok) setDoWczytania(wynik.payload);
    else setBlad(wynik.powod);
  }

  function potwierdzWczytanie() {
    if (!doWczytania) return;
    loadProjectPayload(doWczytania);
    setDoWczytania(null);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* `aria-label` NIE jest tu powtórzeniem napisu: poniżej `sm` sam napis
              znika (`hidden sm:inline`), więc bez tego nazwa dostępnościowa spadłaby
              do `title`, a przycisk nazywałby się całym zdaniem z podpowiedzi. Tak
              nazywa się tak samo przy każdej szerokości — również dla czytnika ekranu
              i dla testów.

              `whitespace-nowrap` pilnuje tego, co widać: przy długiej nazwie projektu
              obok (np. „Przykład: mieszkanie 70 m²") wiersz robił się ciasny i etykieta
              łamała się na dwie linie, spychając płótno o 48 px w dół — na telefonie,
              gdzie rysunku widać i tak tylko ~180 px bez przewijania. */}
          <button
            type="button"
            aria-label="Kopia zapasowa"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-sm text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            title="Zapisz projekt do pliku albo przywróć go z pliku"
          >
            <Archive size={14} aria-hidden="true" /> <span className="hidden sm:inline">Kopia zapasowa</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => zapiszKopie(getProjectPayload(), projectName)}>
            <Download size={14} /> Zapisz kopię do pliku
          </DropdownMenuItem>
          {/* `setTimeout`, bo menu Radiksa przywraca skupienie do przycisku przy
              zamykaniu — otwarcie okna wyboru pliku w tym samym takcie bywa przez to
              anulowane. Zero milisekund wystarczy: chodzi o następny takt, nie o zwłokę. */}
          <DropdownMenuItem onSelect={() => setTimeout(() => wejscieRef.current?.click(), 0)}>
            <Upload size={14} /> Wczytaj kopię z pliku
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={wejscieRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={obsluzPlik}
      />

      <Dialog
        open={!!doWczytania || !!blad}
        onOpenChange={(o) => {
          if (o) return;
          setDoWczytania(null);
          setBlad(null);
        }}
      >
        <DialogContent title={blad ? "Nie ten plik" : "Wczytać kopię zapasową?"}>
          {blad ? (
            <>
              <p className="mb-4 text-sm text-slate-600">{blad}</p>
              <div className="flex justify-end">
                <DialogClose asChild>
                  <Button variant="copper" size="sm">
                    Zamknij
                  </Button>
                </DialogClose>
              </div>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Bieżący projekt{" "}
                {elementCount > 0
                  ? `(${elementCount} ${elementCount === 1 ? "element" : elementCount < 5 ? "elementy" : "elementów"} na planie)`
                  : ""}{" "}
                zostanie zastąpiony zawartością pliku. Tej operacji nie da się cofnąć —
                ale plik zostaje na dysku, więc zawsze można wrócić.
              </p>
              <p className="mb-4 text-xs text-slate-500">
                Zastąpione zostaną też ceny, protokoły i rozdzielnica — kopia obejmuje cały projekt.
              </p>
              <div className="flex justify-end gap-2">
                <DialogClose asChild>
                  <Button variant="ghost" size="sm">
                    Anuluj
                  </Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="copper" size="sm" onClick={potwierdzWczytanie}>
                    Tak, wczytaj kopię
                  </Button>
                </DialogClose>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
