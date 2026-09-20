import { useCallback, useState } from "react";
import { useActiveFloorRoomShapes, useProjectStore } from "@/store/useProjectStore";
import { guessRoomType, nextRoomName, ROOM_TYPE_LABELS } from "@/lib/design";
import type { RoomDrawMode } from "@/components/design/DesignCanvas";
import type { Point, RoomType } from "@/types";

/** Pomieszczenie CZEKAJĄCE na nazwę — obrys jest już narysowany, ale do projektu
 *  trafia dopiero po zatwierdzeniu w oknie „Nazwij pomieszczenie". */
export interface PropozycjaPomieszczenia {
  points: Point[];
  name: string;
  type: RoomType;
  /** Czy typ został wybrany RĘCZNIE z listy. Dopóki nie był, podpowiedź typu śledzi
   *  wpisywaną nazwę; po ręcznym wyborze przestaje, żeby kolejna litera w nazwie nie
   *  nadpisała cicho decyzji użytkownika. */
  typeTouched: boolean;
}

/**
 * Rysowanie pomieszczeń: szkic figury, tryb rysowania i propozycja czekająca na nazwę.
 *
 * Drugie skupisko stanu wyjęte z `DesignTab` (po `useRysowanieScian`). Tutaj przeprowadzka
 * jest przy okazji odchudzeniem: konstrukcja propozycji stała w CZTERECH miejscach
 * komponentu, za każdym razem identyczna, a w dwóch towarzyszył jej ten sam
 * trzywierszowy komentarz przepisany słowo w słowo.
 *
 * Z zewnątrz hook nie potrzebuje niczego — wszystko, czego używa (dodawanie pokoju,
 * aktywna kondygnacja, obrysy do numerowania nazw), bierze wprost ze store'a.
 */
export interface RysowaniePomieszczenApi {
  /** Punkty stawiane klikaniem. W trybie prostokąta ta sama tablica trzyma KOTWICĘ,
   *  czyli pierwszy narożnik — patrz `porzucSzkic`. */
  drawingRoomPoints: Point[];
  setDrawingRoomPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  /** Porzuca szkic figury. Wołane po domknięciu prostokąta, bo ta sama tablica trzyma
   *  jego kotwicę co punkty wieloboku — bez tego kolejny klik liczyłby się od
   *  nieaktualnej kotwicy poprzedniego pomieszczenia. */
  porzucSzkic: () => void;
  roomMode: RoomDrawMode;
  /** Zmiana trybu PRZERYWA figurę zaczętą w poprzednim — z tego samego powodu. */
  ustawTryb: (tryb: RoomDrawMode) => void;
  pendingRoom: PropozycjaPomieszczenia | null;
  /** Otwiera propozycję dla gotowego obrysu: nazwa zastępcza z licznika pokoi, typ
   *  zgadnięty z tej nazwy. NIE czyszczy szkicu — kto go ma, woła `porzucSzkic` sam,
   *  bo nie każda droga do propozycji zaczyna się od rysowania (patrz konwersja
   *  ściany zamkniętej w pętlę). */
  zaproponuj: (punkty: Point[]) => void;
  /** Zamyka okno bez tworzenia pomieszczenia. */
  zamknijPropozycje: () => void;
  zmienNazwe: (name: string) => void;
  zmienTyp: (type: RoomType) => void;
  /** Zatwierdza propozycję — pomieszczenie trafia na aktywną kondygnację. */
  zapisz: () => void;
  /** Zamyka rysowany wielobok: od trzech punktów robi z niego propozycję, krótszy
   *  szkic znika bez śladu. */
  zakonczRysowanie: () => void;
}

export function useRysowaniePomieszczen(): RysowaniePomieszczenApi {
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const addRoomShape = useProjectStore((s) => s.addRoomShape);
  const roomShapes = useActiveFloorRoomShapes();

  const [drawingRoomPoints, setDrawingRoomPoints] = useState<Point[]>([]);
  const [roomMode, setRoomMode] = useState<RoomDrawMode>("prostokat");
  const [pendingRoom, setPendingRoom] = useState<PropozycjaPomieszczenia | null>(null);

  const porzucSzkic = useCallback(() => setDrawingRoomPoints([]), []);

  const ustawTryb = useCallback((tryb: RoomDrawMode) => {
    setRoomMode(tryb);
    setDrawingRoomPoints([]);
  }, []);

  const zaproponuj = useCallback(
    (punkty: Point[]) => {
      const name = nextRoomName(roomShapes.length);
      setPendingRoom({ points: punkty, name, type: guessRoomType(name), typeTouched: false });
    },
    [roomShapes.length]
  );

  const zamknijPropozycje = useCallback(() => setPendingRoom(null), []);

  const zmienNazwe = useCallback((name: string) => {
    // Podpowiedź typu śledzi nazwę tylko dopóki użytkownik sam niczego nie wybrał
    // z listy — inaczej ręczny wybór zostałby cicho nadpisany przy kolejnej literze
    // wpisywanej w polu nazwy.
    setPendingRoom((p) => (p ? { ...p, name, type: p.typeTouched ? p.type : guessRoomType(name) } : p));
  }, []);

  const zmienTyp = useCallback((type: RoomType) => {
    // Wybór z listy ustawia też nazwę na etykietę tego typu — dla zdecydowanej
    // większości pomieszczeń to i tak docelowa nazwa („Kuchnia", „Łazienka"…), więc bez
    // tego trzeba było wpisać to samo słowo DWA razy: raz w polu nazwy, raz w tej
    // liście. Kto chce inną nazwę (np. „Łazienka rodziców"), nadal może ją dopisać
    // w polu nazwy PO wybraniu typu — nic mu tego nie zabrania.
    setPendingRoom((p) => (p ? { ...p, type, typeTouched: true, name: ROOM_TYPE_LABELS[type] } : p));
  }, []);

  const zapisz = useCallback(() => {
    if (!pendingRoom) return;
    addRoomShape(activeFloorId, pendingRoom.points, pendingRoom.name, pendingRoom.type);
    setPendingRoom(null);
  }, [pendingRoom, addRoomShape, activeFloorId]);

  const zakonczRysowanie = useCallback(() => {
    if (drawingRoomPoints.length >= 3) zaproponuj(drawingRoomPoints);
    setDrawingRoomPoints([]);
  }, [drawingRoomPoints, zaproponuj]);

  return {
    drawingRoomPoints,
    setDrawingRoomPoints,
    porzucSzkic,
    roomMode,
    ustawTryb,
    pendingRoom,
    zaproponuj,
    zamknijPropozycje,
    zmienNazwe,
    zmienTyp,
    zapisz,
    zakonczRysowanie,
  };
}
