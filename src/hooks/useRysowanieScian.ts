import { useCallback, useState } from "react";
import { useActiveFloorRoomShapes, useProjectStore } from "@/store/useProjectStore";
import { DEFAULT_WALL_THICKNESS, wierzcholkiZamknietejSciany } from "@/lib/design";
import type { Point } from "@/types";

/**
 * Rysowanie ścian: szkic w trakcie, ustawienia nowej ściany i trzy sposoby, na jakie
 * ściana trafia do projektu.
 *
 * Pierwsze skupisko stanu wyjęte z `DesignTab` do własnego hooka. Sens nie leży
 * w liczbie przeniesionych wierszy (jest ich kilkadziesiąt na blisko cztery tysiące),
 * tylko w tym, że to skupisko daje się teraz czytać i testować bez całego komponentu —
 * a poprzednie podejście, cięcie po szwach JSX-a, wymagało przepchnięcia ~30 propsów
 * i dawało komponent o gorszej sygnaturze niż sam problem.
 *
 * Zależności hook bierze WPROST ze store'a (`setDraft`, aktywna kondygnacja, obrysy
 * jej pomieszczeń), więc z zewnątrz nie trzeba mu nic podawać poza jednym callbackiem.
 */
export interface RysowanieScianApi {
  /** Szkic ściany w trakcie rysowania — punkty postawione klikaniem po planie.
   *  Pusty = nic się właśnie nie rysuje. */
  drawingWall: Point[];
  setDrawingWall: React.Dispatch<React.SetStateAction<Point[]>>;
  /** Grubość NOWEJ ściany (jedn. planu) — ustawienie edytora jak przyciąganie,
   *  nie część zapisywanego projektu. Trafia na ścianę dopiero przy zatwierdzeniu. */
  wallThickness: number;
  setWallThickness: React.Dispatch<React.SetStateAction<number>>;
  /** Wymuszanie kątów prostych: każdy kolejny odcinek jest albo poziomy, albo pionowy
   *  względem poprzedniego punktu — przydatne przy ścianach nośnych i działowych,
   *  które niemal zawsze są prostopadłe. */
  orthoWalls: boolean;
  setOrthoWalls: React.Dispatch<React.SetStateAction<boolean>>;
  /** Zatwierdza szkic (od dwóch punktów) i czyści go. Krótszy szkic znika bez śladu. */
  finishWall: () => void;
  /** Zatwierdza szkic domknięty kliknięciem w jego pierwszy punkt. */
  closeWall: (domykajacy: Point) => void;
  /** Buduje ścianę o kształcie IDENTYCZNYM z obrysem pomieszczenia. */
  createWallFromRoom: (roomId: string) => void;
}

export function useRysowanieScian(opcje: {
  /** Woła się, gdy zatwierdzona ściana domknęła się w pętlę o niezerowym polu —
   *  czyli narysowano murem obrys pomieszczenia. Kto to dostaje, decyduje, czy
   *  zaproponować zrobienie z tego pokoju; hook nie zna tamtego stanu. */
  onPetlaZamknieta?: (wallId: string) => void;
}): RysowanieScianApi {
  const { onPetlaZamknieta } = opcje;
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const setDraft = useProjectStore((s) => s.setDraft);
  const roomShapes = useActiveFloorRoomShapes();

  const [drawingWall, setDrawingWall] = useState<Point[]>([]);
  const [wallThickness, setWallThickness] = useState(DEFAULT_WALL_THICKNESS);
  const [orthoWalls, setOrthoWalls] = useState(false);

  const finishWall = useCallback(() => {
    if (drawingWall.length >= 2) {
      setDraft((d) => ({
        ...d,
        walls: [...d.walls, { id: crypto.randomUUID(), floor: activeFloorId, points: drawingWall, thickness: wallThickness }],
      }));
    }
    setDrawingWall([]);
  }, [drawingWall, wallThickness, activeFloorId, setDraft]);

  /**
   * Klik, który zamyka wielobok ściany (przyciągnięty do jej pierwszego punktu —
   * `onCloseWall` z DesignCanvas), zatwierdza ścianę OD RAZU, z domykającym punktem
   * dołożonym na koniec — bez czekania na osobne „Zakończ"/Enter. Nie da się tu użyć
   * `finishWall`: ten czyta `drawingWall` ze stanu, które w momencie tego kliknięcia
   * jeszcze NIE zawiera punktu domykającego (`setDrawingWall` jest asynchroniczny),
   * więc zamknięcie buduje listę punktów jawnie, tak jak `createWallFromRoom`.
   */
  const closeWall = useCallback(
    (domykajacy: Point) => {
      const points = [...drawingWall, domykajacy];
      if (points.length >= 2) {
        const id = crypto.randomUUID();
        setDraft((d) => ({ ...d, walls: [...d.walls, { id, floor: activeFloorId, points, thickness: wallThickness }] }));
        // Domknięta pętla to obrys pomieszczenia narysowany murem — proponujemy zrobić
        // z niej pokój OD RAZU, zamiast kazać przejechać po raz drugi tę samą figurę.
        if (wierzcholkiZamknietejSciany(points)) onPetlaZamknieta?.(id);
      }
      setDrawingWall([]);
    },
    [drawingWall, wallThickness, activeFloorId, setDraft, onPetlaZamknieta]
  );

  /** Dla planów, które zaczęły się od samego obrysu pokoju (skrót „obrysuj
   *  pomieszczenie", bez osobnego rysowania ścian) i teraz mają dociągnąć plan do stanu
   *  z prawdziwymi ścianami: routowanie przewodów wzdłuż ścian (`buildCableRoutes`),
   *  grubość na rzucie do PDF itd. Zamknięty wielokąt — ostatni punkt domyka się
   *  z powrotem do pierwszego, tak samo jak ściana zamknięta ręcznie.
   *
   *  Osobny przycisk, NIE automat przy każdym narysowanym pomieszczeniu: automatyczne
   *  tworzenie ściany zdublowałoby ją u tych, którzy rysują obrys pomieszczenia
   *  WEWNĄTRZ już postawionych ścian — a to jest częsty, sprawdzony w testach
   *  przepływ, nie przypadek brzegowy. */
  const createWallFromRoom = useCallback(
    (roomId: string) => {
      const room = roomShapes.find((r) => r.id === roomId);
      if (!room || room.points.length < 3) return;
      setDraft((d) => ({
        ...d,
        walls: [
          ...d.walls,
          { id: crypto.randomUUID(), floor: activeFloorId, points: [...room.points, room.points[0]], thickness: wallThickness },
        ],
      }));
    },
    [roomShapes, wallThickness, activeFloorId, setDraft]
  );

  return {
    drawingWall,
    setDrawingWall,
    wallThickness,
    setWallThickness,
    orthoWalls,
    setOrthoWalls,
    finishWall,
    closeWall,
    createWallFromRoom,
  };
}
