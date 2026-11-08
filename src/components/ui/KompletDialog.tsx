import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/useProjectStore";
import { useRoute } from "@/hooks/useRoute";
import { resolveDocHeader } from "@/lib/docHeader";
import { PROTOCOL_DEFS, PROTOCOL_ORDER } from "@/lib/protocols";
import type { PdfDoc } from "@/lib/pdf/engine";
import { poczekajNaProducenta, producent } from "@/lib/pdf/rejestr";
import { buildKompletPdf, buildStronaTytulowaDoc, dostepneDokumenty, type PozycjaKompletu } from "@/lib/pdf/komplet";

/**
 * Wybór zawartości kompletu dokumentacji i jego złożenie.
 *
 * Okno mieszka w `App`, a nie w którejkolwiek zakładce — i to jest warunek działania,
 * nie kwestia porządku: składanie kompletu PRZEŁĄCZA zakładki (rzut i schemat
 * rasteryzują się z żywego rysunku, patrz `lib/pdf/rejestr.ts`), więc okno osadzone
 * w zakładce odmontowałoby się w połowie własnej pracy.
 */
export function KompletDialog({
  open,
  onOpenChange,
  onGotowe,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Gotowe bajty kompletu — dalej zajmuje się nimi podgląd w `App`. */
  onGotowe: (bytes: Uint8Array) => void;
}) {
  const floors = useProjectStore((s) => s.floors);
  const elements = useProjectStore((s) => s.draft.elements);
  const walls = useProjectStore((s) => s.draft.walls);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  const panelDevices = useProjectStore((s) => s.panelDevices);
  const protocols = useProjectStore((s) => s.protocols);
  const rawHeader = useProjectStore((s) => s.docHeader);
  const projectName = useProjectStore((s) => s.projectName);
  const setActiveFloorId = useProjectStore((s) => s.setActiveFloorId);
  const docHeader = resolveDocHeader(rawHeader, projectName);
  const [route, nawiguj] = useRoute();

  const pozycje = useMemo(
    () =>
      dostepneDokumenty({
        kondygnacje: floors.map((f) => ({
          id: f.id,
          nazwa: f.name,
          // Kondygnacja liczy się, gdy cokolwiek na niej narysowano — sama pusta
          // siatka to kartka z tabliczką i niczym więcej.
          maTresc:
            elements.some((e) => e.floor === f.id) ||
            walls.some((w) => w.floor === f.id) ||
            roomShapes.some((r) => r.floor === f.id),
        })),
        // Rozdzielnica wypełnia się sama z obwodów przy otwarciu zakładki, więc
        // wystarczy cokolwiek na planie — nie trzeba tam wcześniej zaglądać.
        maAparaty: panelDevices.length > 0 || elements.length > 0,
        maObwody: elements.length > 0,
        maKosztorys: elements.length > 0,
        protokoly: PROTOCOL_ORDER.map((k) => ({
          key: k,
          tytul: PROTOCOL_DEFS[k].title,
          wierszy: protocols[k]?.rows.length ?? 0,
        })),
      }),
    [floors, elements, walls, roomShapes, panelDevices, protocols]
  );

  const [zaznaczone, setZaznaczone] = useState<Record<string, boolean>>({});
  const [postep, setPostep] = useState<string | null>(null);
  const [blad, setBlad] = useState<string | null>(null);

  // Domyślny wybór ustawiany przy KAŻDYM otwarciu, nie raz na sesję: między jednym
  // a drugim otwarciem mogła dojść kondygnacja albo protokół.
  useEffect(() => {
    if (!open) return;
    setZaznaczone(Object.fromEntries(pozycje.map((p) => [p.id, p.domyslnie])));
    setBlad(null);
    setPostep(null);
  }, [open, pozycje]);

  const wybrane = pozycje.filter((p) => zaznaczone[p.id]);

  async function zloz() {
    setBlad(null);
    const wracamDo = route.tab;
    const wracamNaKondygnacje = useProjectStore.getState().activeFloorId;
    try {
      const dokumenty: PdfDoc[] = [];
      for (const p of wybrane) {
        setPostep(p.etykieta);
        // Rzut umie zbudować tylko kondygnację AKTYWNĄ — komplet przestawia je po
        // kolei i za każdym razem czeka na producenta z właściwym kluczem.
        if (p.floorId && p.floorId !== useProjectStore.getState().activeFloorId) setActiveFloorId(p.floorId);
        if (!producent(p.id)) nawiguj(p.zakladka, null, { replace: true });
        const fn = await poczekajNaProducenta(p.id);
        // Jedna klatka na domalowanie sceny: zakładka właśnie się zamontowała,
        // a rzut i schemat rasteryzują to, co JEST narysowane.
        await new Promise((r) => requestAnimationFrame(r));
        dokumenty.push(await fn());
      }
      setPostep("Składam dokument");
      const tytulowa = buildStronaTytulowaDoc(docHeader, wybrane.map((p) => p.etykieta));
      onGotowe(await buildKompletPdf([tytulowa, ...dokumenty]));
      onOpenChange(false);
    } catch (e) {
      setBlad(e instanceof Error ? e.message : "Nie udało się złożyć kompletu.");
    } finally {
      setPostep(null);
      // Powrót dokładnie tam, skąd użytkownik zaczął — przełączanie zakładek było
      // środkiem do celu, nie nawigacją, więc nie ma po nim zostać ślad.
      setActiveFloorId(wracamNaKondygnacje);
      nawiguj(wracamDo, null, { replace: true });
    }
  }

  const trwa = postep !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => (trwa ? null : onOpenChange(v))}>
      <DialogContent className="max-w-lg" title="Komplet dokumentacji">
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          Jeden plik PDF ze stroną tytułową i spisem treści. Zaznacz, co ma w nim być —
          rysunki i tabele powstaną dokładnie takie same jak przy pobieraniu ich osobno.
        </p>

        {pozycje.length === 0 ? (
          <Alert variant="caution" className="text-xs">
            Nie ma jeszcze czego złożyć — narysuj instalację albo wypełnij protokół.
          </Alert>
        ) : (
          <>
            <div className="pe-scroll max-h-[46vh] space-y-1 overflow-y-auto pr-1">
              {pozycje.map((p) => (
                <Wiersz
                  key={p.id}
                  pozycja={p}
                  zaznaczony={!!zaznaczone[p.id]}
                  wylaczony={trwa}
                  onZmien={(v) => setZaznaczone((z) => ({ ...z, [p.id]: v }))}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <button
                className="underline decoration-dotted hover:text-copper disabled:opacity-40"
                disabled={trwa}
                onClick={() => setZaznaczone(Object.fromEntries(pozycje.map((p) => [p.id, true])))}
              >
                Zaznacz wszystkie
              </button>
              <span aria-hidden="true">·</span>
              <button
                className="underline decoration-dotted hover:text-copper disabled:opacity-40"
                disabled={trwa}
                onClick={() => setZaznaczone({})}
              >
                Odznacz wszystkie
              </button>
              <span className="ml-auto tabular-nums">wybrano: {wybrane.length}</span>
            </div>
          </>
        )}

        {blad && (
          <Alert variant="danger" className="mt-3">
            {blad}
          </Alert>
        )}

        <div className="mt-4 flex items-center gap-2">
          {trwa && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" /> Przygotowuję: {postep}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" disabled={trwa} onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button variant="copper" size="sm" disabled={trwa || wybrane.length === 0} onClick={zloz}>
              Złóż dokumentację
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Wiersz({
  pozycja,
  zaznaczony,
  wylaczony,
  onZmien,
}: {
  pozycja: PozycjaKompletu;
  zaznaczony: boolean;
  wylaczony: boolean;
  onZmien: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50">
      <input
        type="checkbox"
        checked={zaznaczony}
        disabled={wylaczony}
        onChange={(e) => onZmien(e.target.checked)}
        className="h-4 w-4 accent-copper"
      />
      <span>{pozycja.etykieta}</span>
    </label>
  );
}
