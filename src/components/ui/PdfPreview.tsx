import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Download, ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { downloadPdfBytes } from "@/lib/pdf/download";

/**
 * Podgląd gotowego PDF-a przed pobraniem — wspólny dla wszystkich eksportów.
 *
 * Sedno: podgląd pokazuje DOKŁADNIE te bajty, które potem lecą na dysk. Plik składamy
 * raz, trzymamy w `bajtyRef` i przycisk „Pobierz" zapisuje właśnie je, zamiast budować
 * dokument po raz drugi. Gdyby budował od nowa, podgląd przestałby być dowodem na to,
 * co użytkownik dostanie — a to jedyny powód, dla którego ta funkcja istnieje.
 *
 * Renderujemy natywną przeglądarką PDF w <iframe>, bez doklejania pdf.js: silnik i tak
 * produkuje prawdziwy plik, więc przeglądarka pokaże go tak samo jak po pobraniu —
 * razem z podziałem na strony, czyli tym, co najczęściej trzeba sprawdzić przed drukiem.
 */

export interface PdfPreviewProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nagłówek okna — mówi, CO się podgląda (np. „Protokół z pomiaru rezystancji izolacji"). */
  title: string;
  /** Nazwa pliku użyta przy pobraniu z poziomu podglądu. */
  filename: string;
  /** Składa dokument. Wywoływane raz na otwarcie okna. */
  build: () => Promise<Uint8Array>;
}

export function PdfPreview({ open, onOpenChange, title, filename, build }: PdfPreviewProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [zablokowane, setZablokowane] = useState(false);
  const bajtyRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!open) return;
    let aktualne = true;
    let adres: string | null = null;
    setUrl(null);
    setBlad(null);
    setZablokowane(false);

    (async () => {
      try {
        const bajty = await build();
        // Okno mogło zostać zamknięte w trakcie składania — wtedy nie ma po co
        // tworzyć adresu, którego nikt już nie zwolni.
        if (!aktualne) return;
        bajtyRef.current = bajty;
        adres = URL.createObjectURL(new Blob([bajty] as BlobPart[], { type: "application/pdf" }));
        setUrl(adres);
      } catch (e) {
        if (aktualne) setBlad(e instanceof Error ? e.message : "Nie udało się złożyć dokumentu.");
      }
    })();

    return () => {
      aktualne = false;
      // Adres blob trzyma cały plik w pamięci karty do czasu zwolnienia. Przy kilku
      // otwarciach podglądu bez tego rosłoby to w nieskończoność.
      if (adres) URL.revokeObjectURL(adres);
      bajtyRef.current = null;
    };
    // `build` bywa świeżą domknięciową funkcją przy każdym renderze rodzica — gdyby
    // trafiło do zależności, podgląd przebudowywałby się w kółko. Otwarcie okna jest
    // tu jedynym zdarzeniem, które ma uruchamiać składanie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pobierz = () => {
    if (!bajtyRef.current) return;
    setZablokowane(!downloadPdfBytes(bajtyRef.current, filename));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} className="flex h-[88vh] max-w-5xl flex-col">
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border bg-slate-100">
          {url ? (
            <iframe src={url} title={`Podgląd: ${title}`} className="h-full w-full border-0" />
          ) : blad ? (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-red-600">
              <span>
                <AlertTriangle size={18} className="mx-auto mb-2" />
                {blad}
              </span>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> Składanie dokumentu…
            </div>
          )}
        </div>

        {zablokowane && (
          <div className="mt-3 flex gap-2 rounded-md p-2.5 text-xs" style={{ background: "#C1793F14", color: "#8A5526" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Przeglądarka zablokowała pobieranie w tym widoku. Spróbuj ponownie lub otwórz plik w nowej karcie.
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {/* Wyjście awaryjne dla przeglądarek (głównie na telefonach), które nie
              renderują PDF-a w ramce — tam podgląd zostaje pusty i bez tego przycisku
              nie dałoby się dojść do dokumentu inaczej niż na ślepo go pobierając. */}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-xs text-blueprint hover:underline"
            >
              <ExternalLink size={14} /> Otwórz w nowej karcie
            </a>
          )}
          <button onClick={() => onOpenChange(false)} className="rounded-md px-3 py-2 text-xs text-slate-500 hover:text-ink">
            Zamknij
          </button>
          <button
            onClick={pobierz}
            disabled={!url}
            className="pe-btn-copper flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50"
          >
            <Download size={14} /> Pobierz PDF
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
