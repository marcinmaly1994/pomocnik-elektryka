import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
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
  const removeFloor = useProjectStore((s) => s.removeFloor);
  const elements = useProjectStore((s) => s.draft.elements);
  const [newFloorName, setNewFloorName] = useState("Piętro 1");

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
