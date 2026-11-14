import type { InstallationElement, RoomShape } from "@/types";
import type { Move } from "@/lib/align";
import { detectRoomName, roomNameAfterMove } from "@/lib/design";
import { maWlasnyObwodZDefinicji, wchodziDoObwodu } from "@/lib/panel/circuits";

/**
 * Operacje na elementach planu — czyste funkcje `elementy → elementy`, które edytor
 * (DesignTab) owija w `setDraft`. Wydzielone z komponentu w pozycji 8 przeglądu
 * z 12.11.2026: same przekształcenia danych nie mają powodu żyć w funkcji komponentu
 * z kilkudziesięcioma kawałkami stanu, a tu dają się sprawdzić testem bez renderu.
 *
 * `roomShapes` to — jak w edytorze — obrysy BIEŻĄCEJ kondygnacji, a `mpu` skala planu
 * (metry na jednostkę albo `null`, gdy plan nie jest skalibrowany).
 */

export interface CelKopii {
  /** Kondygnacja, na którą trafiają kopie (bieżąca w edytorze). */
  floor: string;
  /** Przesunięcie kopii w obu osiach, w jednostkach planu. */
  odsuniecie: number;
  roomShapes: RoomShape[];
  mpu: number | null;
}

/**
 * Kopie elementów — wspólne dla Ctrl+D (duplikowanie) i Ctrl+V (wklejanie ze schowka).
 *
 * Wcześniej każda z tych dróg budowała kopie po swojemu, a różnić się mają tylko tym,
 * co wynika z kondygnacji docelowej:
 * - kopia dostaje nowe `id`, położenie z odsunięciem i pomieszczenie przeliczone
 *   z położenia; `roomId` nie jest kopiowane — `setDraft` wylicza je z nazwy
 *   (`synchronizujRoomId`), więc stare id obrysu nie ma prawa przejść na kopię,
 * - na TEJ SAMEJ kondygnacji kopia zachowuje ręczny numer obwodu i grupy świateł,
 *   a pomieszczenie liczy `roomNameAfterMove` (chroni nazwę wpisaną ręcznie),
 * - na INNEJ — nie: numer obwodu znaczy to samo w całym budynku, więc gniazdo
 *   z piętra dołączyłoby do obwodu z parteru; pomieszczenie wprost z położenia
 *   (`detectRoomName`), bo nazwa z innego piętra nie jest tu „nazwą wpisaną ręcznie".
 */
export function kopieElementow(zrodlo: InstallationElement[], cel: CelKopii): InstallationElement[] {
  const { floor, odsuniecie, roomShapes, mpu } = cel;
  return zrodlo.map((e) => {
    const naTejSamej = e.floor === floor;
    const x = e.x + odsuniecie;
    const y = e.y + odsuniecie;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { roomId: _id, obwod, lightGroup, ...reszta } = e;
    return {
      ...reszta,
      ...(naTejSamej ? { obwod, lightGroup } : {}),
      id: crypto.randomUUID(),
      floor,
      x,
      y,
      room: naTejSamej ? roomNameAfterMove({ x, y }, e.room, roomShapes, mpu) : detectRoomName({ x, y }, roomShapes, mpu),
    };
  });
}

/**
 * Przypisuje elementom NUMER OBWODU — albo oddaje je automatowi (`undefined`).
 *
 * Odbiorniki z własnym obwodem z definicji (ładowarka EV, gniazdo trójfazowe, wypust
 * AGD, gniazdo dedykowane) są pomijane, nawet gdyby trafiły do zaznaczenia grupowego —
 * ich obwód ma inny przewód i inne zabezpieczenie, więc dołączenie do wspólnego dałoby
 * obwód z błędnym doborem. Pomijane są też elementy, które w ogóle nie wchodzą do
 * obwodów (`wchodziDoObwodu`).
 */
export function zObwodem(
  elements: InstallationElement[],
  ids: string[],
  numer: number | undefined
): InstallationElement[] {
  return elements.map((e) =>
    ids.includes(e.id) && wchodziDoObwodu(e) && !maWlasnyObwodZDefinicji(e) ? { ...e, obwod: numer } : e
  );
}

/** Obrót o 90° w prawo — np. gniazdko albo łącznik przy skośnej ścianie. */
export function obroconeO90(elements: InstallationElement[], ids: string[]): InstallationElement[] {
  return elements.map((e) => (ids.includes(e.id) ? { ...e, rotation: ((e.rotation ?? 0) + 90) % 360 } : e));
}

/**
 * Zastosowanie listy ruchów `{id, x, y}` — JEDNA droga dla wszystkiego, co przesuwa
 * elementy: przeciągnięcia grupy, strzałek i wyrównywania. Każde z nich musi przeliczyć
 * przypisanie do pomieszczenia (`roomNameAfterMove`) — wyrównanie rzędu gniazdek
 * potrafi wypchnąć skrajne z pokoju.
 */
export function poPrzesunieciu(
  elements: InstallationElement[],
  moves: Move[],
  roomShapes: RoomShape[],
  mpu: number | null
): InstallationElement[] {
  return elements.map((e) => {
    const m = moves.find((mv) => mv.id === e.id);
    return m ? { ...e, x: m.x, y: m.y, room: roomNameAfterMove(m, e.room, roomShapes, mpu) } : e;
  });
}

/**
 * Numery obwodów, które już gdzieś w PROJEKCIE są — do podpowiedzi w menu „Obwód".
 *
 * Z CAŁEGO budynku, nie z bieżącej kondygnacji: numer znaczy to samo w całym projekcie
 * (`computeCircuits` grupuje po nim elementy wszystkich pięter). Gdy lista pochodziła
 * z jednej kondygnacji, „+ nowy" na piętrze proponował numer zajęty na parterze —
 * i kliknięcie po cichu scalało dwa niezwiązane zestawy punktów w jeden obwód.
 * Numery używane WYŁĄCZNIE gdzie indziej są oznaczone (`gdzieIndziej`): scalenie przez
 * piętra bywa zamierzone (jeden pion), ale ma być wyborem, a nie przypadkiem.
 */
export function uzyteNumeryObwodow(
  naKondygnacji: InstallationElement[],
  wszystkie: InstallationElement[]
): { numer: number; gdzieIndziej: boolean }[] {
  const naTej = new Set<number>();
  for (const e of naKondygnacji) if (typeof e.obwod === "number") naTej.add(e.obwod);
  const wszystkieNumery = new Set<number>();
  for (const e of wszystkie) if (typeof e.obwod === "number") wszystkieNumery.add(e.obwod);
  return [...wszystkieNumery].sort((a, b) => a - b).map((numer) => ({ numer, gdzieIndziej: !naTej.has(numer) }));
}
