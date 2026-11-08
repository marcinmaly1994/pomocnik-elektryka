import { Alert } from "@/components/ui/alert";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Download, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { downloadPdfBytes } from "@/lib/pdf/download";
import { zaladujPdfjs } from "@/lib/pdf/pdfjs";
import { Button } from "@/components/ui/button";

/**
 * Podgląd gotowego PDF-a przed pobraniem — wspólny dla wszystkich eksportów.
 *
 * Strony rysujemy SAMI, przez `pdfjs-dist` na zwykłe <canvas>, zamiast wstawiać plik
 * do <iframe> i liczyć na wbudowany czytnik przeglądarki. Pierwsza wersja robiła to
 * drugie i u użytkownika wyszedł czarny prostokąt: pomiar w DOM pokazał, że dokument
 * w ramce owszem dostaje typ `application/pdf`, ale wtyczka NIE tworzy elementu
 * <embed> — czyli nic nie renderuje, a widać samo jej ciemne tło (#525659).
 *
 * Rysowanie po swojemu wycina całą tę klasę problemów: nie zależy od wtyczki, działa
 * tak samo na telefonie (gdzie ramka z PDF-em bywa po prostu pusta) i daje się
 * sprawdzić testem, bo piksele są nasze.
 *
 * `pdfjs-dist` jest już zależnością — tą samą drogą aplikacja rasteryzuje wgrywane
 * rzuty w `lib/detect/source.ts`. Ładujemy go DYNAMICZNIE, żeby ~1 MB nie wchodziło
 * do głównej paczki.
 *
 * Sedno pozostaje bez zmian: dokument składamy RAZ, a przycisk „Pobierz" zapisuje
 * dokładnie te bajty, które widać. Gdyby budował plik po raz drugi, podgląd
 * przestałby być dowodem na to, co użytkownik dostanie.
 */

export interface PdfPreviewProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nagłówek okna — mówi, CO się podgląda (np. „Pomiar rezystancji izolacji"). */
  title: string;
  /** Nazwa pliku użyta przy pobraniu z poziomu podglądu. */
  filename: string;
  /** Składa dokument. Wywoływane raz na otwarcie okna. */
  build: () => Promise<Uint8Array>;
  /**
   * Znacznik WARIANTU składanego dokumentu. Zmiana wartości przebudowuje podgląd —
   * po to, żeby okno mogło mieć własne przełączniki treści (patrz `opcje`), a nie
   * tylko pokazywać to, co ustawiono przed jego otwarciem.
   *
   * Osobno od `build`, bo tamto bywa świeżym domknięciem przy każdym renderze
   * rodzica i w zależnościach zapętliłoby składanie.
   */
  wariant?: string | number;
  /** Przełączniki treści dokumentu, pokazywane nad podglądem. */
  opcje?: ReactNode;
}

/** Zapas na pasek przewijania i oddech przy krawędziach kontenera stron. */
const MARGINES_WEWN = 24;

export function PdfPreview({ open, onOpenChange, title, filename, build, wariant, opcje }: PdfPreviewProps) {
  const [gotowe, setGotowe] = useState(false);
  const [blad, setBlad] = useState<string | null>(null);
  const [zablokowane, setZablokowane] = useState(false);
  const [adres, setAdres] = useState<string | null>(null);
  const bajtyRef = useRef<Uint8Array | null>(null);
  const kontenerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let aktualne = true;
    let url: string | null = null;
    setGotowe(false);
    setBlad(null);
    setZablokowane(false);
    setAdres(null);

    (async () => {
      try {
        const bajty = await build();
        if (!aktualne) return;
        bajtyRef.current = bajty;

        // Adres blob służy już tylko przyciskowi „Otwórz w nowej karcie" — sam podgląd
        // rysujemy z bajtów, więc nie zależy od tego, czy przeglądarka umie pokazać PDF.
        url = URL.createObjectURL(new Blob([bajty] as BlobPart[], { type: "application/pdf" }));
        setAdres(url);

        const pdfjs = await zaladujPdfjs();
        // `getDocument` przejmuje bufor na własność (odpina go), więc oddajemy KOPIĘ.
        // Inaczej `bajtyRef` zostaje pustą skorupą i pobieranie zapisuje zerowy plik.
        const dokument = await pdfjs.getDocument({ data: bajty.slice() }).promise;
        if (!aktualne) return;

        const kontener = kontenerRef.current;
        if (!kontener) return;
        kontener.replaceChildren();
        const dostepna = Math.max(200, kontener.clientWidth - MARGINES_WEWN);

        for (let nr = 1; nr <= dokument.numPages; nr++) {
          const strona = await dokument.getPage(nr);
          if (!aktualne) return;
          const baza = strona.getViewport({ scale: 1 });
          const viewport = strona.getViewport({ scale: dostepna / baza.width });

          const canvas = document.createElement("canvas");
          // Mnożnik gęstości pikseli — bez niego tekst 8 pt na ekranie HiDPI rozmywa
          // się do nieczytelności, a to właśnie drobny druk sprawdza się w podglądzie.
          const gestosc = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.round(viewport.width * gestosc);
          canvas.height = Math.round(viewport.height * gestosc);
          canvas.style.width = Math.round(viewport.width) + "px";
          canvas.style.height = Math.round(viewport.height) + "px";
          canvas.className = "mx-auto mb-3 block bg-white shadow-sm";
          canvas.setAttribute("data-strona", String(nr));

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Przeglądarka nie udostępniła kontekstu 2D");
          ctx.scale(gestosc, gestosc);
          // Biel pod spodem: strona PDF bywa przezroczysta, a przezroczystość na
          // canvasie wychodzi CZARNA — ten sam mechanizm, co przy rasteryzacji rzutów
          // w `lib/detect/source.ts`. Sam dokument też maluje sobie białe tło (patrz
          // `engine.ts`), ale podgląd nie ma powodu na tym polegać.
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, viewport.width, viewport.height);
          await strona.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (!aktualne) return;
          kontener.appendChild(canvas);
        }
        setGotowe(true);
      } catch (e) {
        if (aktualne) setBlad(e instanceof Error ? e.message : "Nie udało się złożyć dokumentu.");
      }
    })();

    return () => {
      aktualne = false;
      // Adres blob trzyma cały plik w pamięci karty do czasu zwolnienia.
      if (url) URL.revokeObjectURL(url);
      bajtyRef.current = null;
    };
    // `build` bywa świeżym domknięciem przy każdym renderze rodzica — gdyby trafiło do
    // zależności, podgląd przebudowywałby się w kółko. Otwarcie okna jest tu jedynym
    // zdarzeniem, które ma uruchamiać składanie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wariant]);

  const pobierz = () => {
    if (!bajtyRef.current) return;
    setZablokowane(!downloadPdfBytes(bajtyRef.current, filename));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="flex h-[88vh] max-w-5xl flex-col">
        {/* Przełączniki treści NAD podglądem, nie w stopce: zmiana ma być widoczna
            w tym samym ruchu oka, w którym patrzy się na wynik. */}
        {opcje && <div className="mb-2 flex flex-wrap items-center gap-4">{opcje}</div>}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-slate-200">
          <div ref={kontenerRef} data-podglad-stron className="h-full w-full overflow-y-auto p-3" />
          {!gotowe && !blad && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-200 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Składanie dokumentu…
            </div>
          )}
          {blad && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-200 p-6 text-center text-sm text-red-600">
              <span>
                <AlertTriangle size={18} className="mx-auto mb-2" />
                {blad}
              </span>
            </div>
          )}
        </div>

        {zablokowane && (
          <Alert variant="caution" className="mt-3 text-xs">
            Przeglądarka zablokowała pobieranie w tym widoku. Spróbuj ponownie lub otwórz plik w nowej karcie.
          </Alert>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {adres && (
            <a
              href={adres}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-blueprint hover:underline"
            >
              <ExternalLink size={14} /> Otwórz w nowej karcie
            </a>
          )}
          <Button variant="subtle" size="md" onClick={() => onOpenChange(false)}>
            Zamknij
          </Button>
          <Button variant="primary" size="md"
            onClick={pobierz}
            disabled={!gotowe}
          >
            <Download size={14} /> Pobierz PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
