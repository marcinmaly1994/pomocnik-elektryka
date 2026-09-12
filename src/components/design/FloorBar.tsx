import { useState } from "react";
import { Copy, Layers, Trash2 } from "lucide-react";
import { useProjectStore } from "@/store/useProjectStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogClose } from "@/components/ui/dialog";

/**
 * Wybór kondygnacji — przeniesiony z powłoki aplikacji do paska edytora, bo dotyczy
 * wyłącznie rysowania planu i nigdzie indziej nie ma znaczenia. Przy okazji odzyskuje
 * to cały rząd wysokości nad płótnem.
 */

/** Usunięcie kondygnacji kasuje razem z nią wszystkie postawione na niej elementy,
 *  ściany i pomieszczenia — a tego nie widać po samej nazwie przycisku, więc okno
 *  podaje wprost, ile elementów przepadnie. */
function DeleteFloorButton({ name, elementCount, onConfirm }: { name: string; elementCount: number; onConfirm: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-500"
          title={`Usuń kondygnację „${name}"`}
          aria-label={`Usuń kondygnację ${name}`}
        >
          <Trash2 size={13} />
        </button>
      </DialogTrigger>
      <DialogContent title={`Usunąć kondygnację „${name}"?`}>
        <p className="mb-4 text-sm text-slate-600">
          {elementCount > 0
            ? `Razem z nią zniknie ${elementCount} ${elementCount === 1 ? "element" : elementCount < 5 ? "elementy" : "elementów"} oraz narysowane na niej ściany i pomieszczenia.`
            : "Kondygnacja jest pusta — zniknie razem z narysowanymi na niej ścianami i pomieszczeniami."}{" "}
          Tej operacji nie da się cofnąć.
        </p>
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm">
              Anuluj
            </Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" size="sm" onClick={onConfirm}>
              Usuń kondygnację
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FloorBar() {
  const floors = useProjectStore((s) => s.floors);
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setActiveFloorId = useProjectStore((s) => s.setActiveFloorId);
  const addFloor = useProjectStore((s) => s.addFloor);
  const duplicateFloor = useProjectStore((s) => s.duplicateFloor);
  const removeFloor = useProjectStore((s) => s.removeFloor);
  const setFloorHeight = useProjectStore((s) => s.setFloorHeight);
  const elements = useProjectStore((s) => s.draft.elements);
  const [newFloorName, setNewFloorName] = useState("Piętro 1");
  const aktywna = floors.find((f) => f.id === activeFloorId);
  const [nazwaKopii, setNazwaKopii] = useState("");

  const counts = elements.reduce<Record<string, number>>((acc, e) => {
    acc[e.floor] = (acc[e.floor] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Layers size={14} className="text-slate-400" aria-hidden="true" />
      {floors.map((f) => (
        <span key={f.id} className="flex items-center">
          <Button variant={f.id === activeFloorId ? "copper" : "ghost"} size="sm" onClick={() => setActiveFloorId(f.id)}>
            {f.name}
          </Button>
          {/* Usuwanie tylko przy więcej niż jednej kondygnacji — ostatniej nie ma jak
              skasować (plan musi mieć gdzie istnieć), więc przycisk znika zamiast być
              wyszarzony bez wyjaśnienia. */}
          {floors.length > 1 && (
            <DeleteFloorButton name={f.name} elementCount={counts[f.id] ?? 0} onConfirm={() => removeFloor(f.id)} />
          )}
        </span>
      ))}

      {/* Duplikowanie BIEŻĄCEJ kondygnacji. Piętra w budynku wielorodzinnym bywają
          identyczne albo różnią się kilkoma elementami — przerysowywanie ich od zera to
          najdłuższa i najbardziej bezmyślna czynność w całej aplikacji, a przy okazji
          jedyna, przy której piony na pewno się rozjadą. */}
      <Dialog>
        <DialogTrigger asChild>
          {/* Nazwa proponowana przy OTWARCIU okna, nie w stanie początkowym: bieżąca
              kondygnacja zmienia się w trakcie pracy, a propozycja ma dotyczyć tej,
              którą użytkownik właśnie kopiuje. */}
          <Button
            variant="ghost"
            size="sm"
            title="Skopiuj bieżącą kondygnację razem z geometrią i osprzętem"
            onClick={() => setNazwaKopii(`${aktywna?.name ?? "Kondygnacja"} — kopia`)}
          >
            <Copy size={13} /> Duplikuj
          </Button>
        </DialogTrigger>
        <DialogContent title="Nazwij kopię kondygnacji">
          <input
            autoFocus
            value={nazwaKopii}
            onChange={(e) => setNazwaKopii(e.target.value)}
            aria-label="Nazwa kopii kondygnacji"
            className="mb-3 w-full rounded border border-border px-3 py-1.5 text-sm"
          />
          <p className="mb-4 text-xs text-slate-400">
            Kopia dostaje wszystkie ściany, pomieszczenia, drzwi, okna i elementy z „{aktywna?.name}", a także
            jej skalę i podkład. Ręczne poprawki tras przewodów nie są kopiowane — trasy policzą się od nowa.
          </p>
          <DialogTrigger asChild>
            <Button
              variant="copper"
              className="w-full"
              onClick={() => duplicateFloor(activeFloorId, nazwaKopii || `${aktywna?.name ?? "Kondygnacja"} — kopia`)}
            >
              Duplikuj kondygnację
            </Button>
          </DialogTrigger>
        </DialogContent>
      </Dialog>

      {/*
        Wysokość BIEŻĄCEJ kondygnacji. Puste pole = wartość typowa (2,8 m), tak samo jak
        puste pole wysokości montażu przy elemencie — liczba nie ma stanu „nie podano",
        a to on odróżnia projekt, w którym nikt tego nie ruszał.

        Stoi przy kondygnacjach, a nie w ustawieniach planu, bo dotyczy JEDNEJ z nich
        i zmienia się razem z przełączeniem piętra.
      */}
      <label
        className="ml-1 flex items-center gap-1 text-xs text-slate-500"
        title="Wysokość bieżącej kondygnacji w świetle stropów. Wchodzi w DŁUGOŚĆ przewodu: podejście pod strop, zejście do puszki i przejście na sąsiednie piętro. Za mała wysokość zaniża policzony spadek napięcia, więc przy wysokim parterze albo poddaszu warto ją podać. Puste pole oznacza wartość typową 2,8 m."
      >
        <span className="whitespace-nowrap">Wys. kondygnacji</span>
        <input
          type="number"
          min={1.5}
          max={6}
          step={0.1}
          value={aktywna?.heightM ?? ""}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(",", "."));
            setFloorHeight(activeFloorId, Number.isFinite(v) && v > 0 ? v : undefined);
          }}
          placeholder="2,8"
          aria-label="Wysokość kondygnacji w metrach"
          className="w-14 rounded border border-border px-1.5 py-1 text-xs tabular-nums"
        />
        <span aria-hidden="true">m</span>
      </label>

      <Dialog>
        <DialogTrigger asChild>
          {/* Etykieta zawiera „+" jako TEKST, nie ikonę: to nazwa dostępnościowa tego
              przycisku i punkt zaczepienia testów e2e od kilku kroków wstecz. */}
          <Button variant="ghost" size="sm">+ Dodaj kondygnację</Button>
        </DialogTrigger>
        <DialogContent title="Nazwij kondygnację">
          <input
            autoFocus
            value={newFloorName}
            onChange={(e) => setNewFloorName(e.target.value)}
            aria-label="Nazwa kondygnacji"
            className="mb-4 w-full rounded border border-border px-3 py-1.5 text-sm"
          />
          <DialogTrigger asChild>
            <Button variant="copper" className="w-full" onClick={() => addFloor(newFloorName || `Piętro ${floors.length}`)}>
              Dodaj
            </Button>
          </DialogTrigger>
        </DialogContent>
      </Dialog>
    </div>
  );
}
