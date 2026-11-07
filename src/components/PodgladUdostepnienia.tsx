import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { adresPlikuUdostepnienia } from "@/lib/supabase";
import { sciezkaPliku, type Udostepnienie } from "@/lib/udostepnianie";
import { zaladujPdfjs } from "@/lib/pdf/pdfjs";
import { downloadPdfBytes } from "@/lib/pdf/download";

/**
 * Strona udostępnionej dokumentacji (F14 z audytu 5.11.2026) — tylko do odczytu.
 *
 * Renderowana ZAMIAST aplikacji (patrz `main.tsx`), nie w jej środku: odbiorca nie
 * jest użytkownikiem edytora, więc nie może dostać jego zakładek, autozapisu ani
 * — co najważniejsze — nadpisania własnego projektu, gdyby sam z aplikacji korzystał.
 * Nic tu nie dotyka `localStorage` ani magazynu projektu.
 */
export function PodgladUdostepnienia({ udostepnienie }: { udostepnienie: Udostepnienie }) {
  const [stan, setStan] = useState<"laduje" | "gotowe" | "brak" | "blad">("laduje");
  const [stron, setStron] = useState(0);
  const bajtyRef = useRef<Uint8Array | null>(null);
  const kontenerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let aktualne = true;
    (async () => {
      let odp: Response;
      try {
        // Parametr omija pamięć CDN-u Supabase: Cloudflare trzyma tam kopię pliku po
        // pierwszym otwarciu i podawał ją dalej także PO wyłączeniu linku (sprawdzone na
        // żywo 7.11.2026: usunięty plik — „cf-cache-status: HIT", 200), mimo nagłówka
        // no-cache. Z unikalnym adresem wyłączenie działa od razu.
        odp = await fetch(`${adresPlikuUdostepnienia(sciezkaPliku(udostepnienie))}?v=${Date.now()}`, { cache: "no-store" });
      } catch {
        if (aktualne) setStan("blad");
        return;
      }
      // Storage odpowiada 400 albo 404 na brakujący plik — dla odbiorcy to jedno:
      // link wyłączony albo przepisany z błędem.
      if (!odp.ok) {
        if (aktualne) setStan(odp.status === 400 || odp.status === 404 ? "brak" : "blad");
        return;
      }
      try {
        const bajty = new Uint8Array(await odp.arrayBuffer());
        bajtyRef.current = bajty;
        const pdfjs = await zaladujPdfjs();
        const dokument = await pdfjs.getDocument({ data: bajty.slice() }).promise;
        const kontener = kontenerRef.current;
        if (!aktualne || !kontener) return;
        kontener.replaceChildren();
        const dostepna = Math.max(280, Math.min(1100, kontener.clientWidth));
        for (let nr = 1; nr <= dokument.numPages; nr++) {
          const strona = await dokument.getPage(nr);
          const baza = strona.getViewport({ scale: 1 });
          const viewport = strona.getViewport({ scale: dostepna / baza.width });
          const canvas = document.createElement("canvas");
          const gestosc = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.round(viewport.width * gestosc);
          canvas.height = Math.round(viewport.height * gestosc);
          canvas.style.width = Math.round(viewport.width) + "px";
          canvas.style.height = Math.round(viewport.height) + "px";
          canvas.className = "mx-auto mb-4 block max-w-full bg-white shadow-sm";
          canvas.setAttribute("data-strona", String(nr));
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("brak kontekstu 2D");
          ctx.scale(gestosc, gestosc);
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, viewport.width, viewport.height);
          await strona.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (!aktualne) return;
          kontener.appendChild(canvas);
        }
        setStron(dokument.numPages);
        setStan("gotowe");
      } catch {
        if (aktualne) setStan("blad");
      }
    })();
    return () => {
      aktualne = false;
    };
  }, [udostepnienie]);

  return (
    <div className="min-h-screen bg-[#F4F1EC]">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-white px-4 py-3">
        <a href="/" className="text-base font-semibold text-ink">
          pomocnikelektryka<span className="text-copper">.pl</span>
        </a>
        <span className="text-sm text-slate-500">Dokumentacja instalacji — podgląd tylko do odczytu</span>
        {stan === "gotowe" && (
          <Button
            variant="copper"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={() => bajtyRef.current && downloadPdfBytes(bajtyRef.current, "dokumentacja-instalacji.pdf")}
          >
            <Download size={14} /> Pobierz PDF
          </Button>
        )}
      </header>
      <main className="mx-auto max-w-[1140px] px-4 py-6" data-testid="podglad-udostepnienia" data-stan={stan} data-stron={stron}>
        {stan === "laduje" && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={15} className="animate-spin" /> Wczytuję dokumentację…
          </p>
        )}
        {stan === "brak" && (
          <div className="rounded-card border border-border bg-white p-6 text-sm text-slate-600">
            <p className="font-semibold text-ink">Tego dokumentu już tu nie ma.</p>
            <p className="mt-1">Link został wyłączony przez autora albo jest niekompletny. Poproś o nowy.</p>
          </div>
        )}
        {stan === "blad" && (
          <div className="rounded-card border border-border bg-white p-6 text-sm text-slate-600">
            Nie udało się wczytać dokumentacji. Sprawdź połączenie z internetem i odśwież stronę.
          </div>
        )}
        <div ref={kontenerRef} />
      </main>
    </div>
  );
}
