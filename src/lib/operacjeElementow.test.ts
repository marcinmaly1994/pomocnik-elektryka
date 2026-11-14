import { describe, it, expect } from "vitest";
import { kopieElementow, obroconeO90, poPrzesunieciu, uzyteNumeryObwodow, zObwodem } from "./operacjeElementow";
import { NO_ROOM } from "@/lib/elements";
import type { InstallationElement, RoomShape } from "@/types";

function el(p: Partial<InstallationElement> & { id: string }): InstallationElement {
  return { type: "gniazdko", x: 50, y: 50, room: "Salon", floor: "f1", dedicated: false, note: "", gangs: 1, ...p };
}

function prostokat(id: string, floor: string, name: string, x0: number, x1: number): RoomShape {
  return {
    id,
    floor,
    name,
    color: "#ccc",
    points: [
      { x: x0, y: 0 },
      { x: x1, y: 0 },
      { x: x1, y: 100 },
      { x: x0, y: 100 },
    ],
  };
}

const PARTER = [prostokat("r-salon", "f1", "Salon", 0, 100), prostokat("r-kuchnia", "f1", "Kuchnia", 100, 200)];
const PIETRO = [prostokat("r-pokoj", "f2", "Pokój", 0, 100)];

describe("kopieElementow — wspólne dla Ctrl+D i Ctrl+V", () => {
  it("kopia ma nowe id, odsunięcie i NIE ma roomId (setDraft wylicza je z nazwy)", () => {
    const zrodlo = [el({ id: "a", roomId: "r-salon" })];
    const [k] = kopieElementow(zrodlo, { floor: "f1", odsuniecie: 10, roomShapes: PARTER, mpu: null });
    expect(k.id).not.toBe("a");
    expect(k).toMatchObject({ x: 60, y: 60, floor: "f1", room: "Salon" });
    expect(k).not.toHaveProperty("roomId");
  });

  it("nie zmienia elementów źródłowych", () => {
    const zrodlo = [el({ id: "a", obwod: 3 })];
    kopieElementow(zrodlo, { floor: "f2", odsuniecie: 10, roomShapes: PIETRO, mpu: null });
    expect(zrodlo[0]).toMatchObject({ id: "a", x: 50, floor: "f1", obwod: 3 });
  });

  it("odsunięcie, które wypycha kopię do sąsiedniego pokoju, przelicza pomieszczenie", () => {
    const [k] = kopieElementow([el({ id: "a", x: 95 })], { floor: "f1", odsuniecie: 10, roomShapes: PARTER, mpu: null });
    expect(k.room).toBe("Kuchnia");
  });

  it("na tej samej kondygnacji zostaje ręczny numer obwodu i grupa świateł", () => {
    const [k] = kopieElementow([el({ id: "a", obwod: 4, lightGroup: [1] })], {
      floor: "f1",
      odsuniecie: 0,
      roomShapes: PARTER,
      mpu: null,
    });
    expect(k.obwod).toBe(4);
    expect(k.lightGroup).toEqual([1]);
  });

  it("na INNEJ kondygnacji numer obwodu i grupa przepadają — numer znaczy to samo w całym budynku", () => {
    const [k] = kopieElementow([el({ id: "a", obwod: 4, lightGroup: [1] })], {
      floor: "f2",
      odsuniecie: 0,
      roomShapes: PIETRO,
      mpu: null,
    });
    expect(k).not.toHaveProperty("obwod");
    expect(k).not.toHaveProperty("lightGroup");
    expect(k).toMatchObject({ floor: "f2", room: "Pokój" });
  });

  it("na INNEJ kondygnacji nazwa pokoju z piętra źródłowego nie jest chroniona jak ręczna", () => {
    // „Garderoba" nie ma obrysu na f1, więc na tej samej kondygnacji byłaby nazwą wpisaną
    // ręcznie i zostałaby. Na f2 to tylko pozostałość z innego piętra.
    const [poza] = kopieElementow([el({ id: "a", x: 500, room: "Garderoba" })], {
      floor: "f2",
      odsuniecie: 0,
      roomShapes: PIETRO,
      mpu: null,
    });
    expect(poza.room).toBe(NO_ROOM);
    const [tuSamo] = kopieElementow([el({ id: "a", x: 500, room: "Garderoba" })], {
      floor: "f1",
      odsuniecie: 0,
      roomShapes: PARTER,
      mpu: null,
    });
    expect(tuSamo.room).toBe("Garderoba");
  });
});

describe("zObwodem", () => {
  it("przypisuje numer gniazdom i oświetleniu, pomija to, co do obwodu nie należy", () => {
    const wynik = zObwodem(
      [el({ id: "g" }), el({ id: "o", type: "oswietlenie" }), el({ id: "w", type: "wlacznik" }), el({ id: "x" })],
      ["g", "o", "w"],
      7
    );
    expect(wynik.map((e) => e.obwod)).toEqual([7, 7, undefined, undefined]);
  });

  it("pomija odbiorniki z własnym obwodem z definicji (ładowarka, gniazdo dedykowane)", () => {
    const wynik = zObwodem(
      [el({ id: "ev", type: "ladowarkaEV" }), el({ id: "ded", dedicated: true }), el({ id: "g" })],
      ["ev", "ded", "g"],
      2
    );
    expect(wynik.map((e) => e.obwod)).toEqual([undefined, undefined, 2]);
  });

  it("undefined oddaje element automatowi", () => {
    const [e] = zObwodem([el({ id: "g", obwod: 5 })], ["g"], undefined);
    expect(e.obwod).toBeUndefined();
  });
});

describe("obroconeO90", () => {
  it("obraca o 90° w prawo, po 270° wraca do 0, nie rusza niezaznaczonych", () => {
    const wynik = obroconeO90([el({ id: "a" }), el({ id: "b", rotation: 270 }), el({ id: "c", rotation: 90 })], ["a", "b"]);
    expect(wynik.map((e) => e.rotation)).toEqual([90, 0, 90]);
  });
});

describe("poPrzesunieciu", () => {
  it("przesuwa wskazane elementy i przelicza im pomieszczenie", () => {
    const wynik = poPrzesunieciu(
      [el({ id: "a" }), el({ id: "b" })],
      [{ id: "a", x: 150, y: 50 }],
      PARTER,
      null
    );
    expect(wynik[0]).toMatchObject({ x: 150, y: 50, room: "Kuchnia" });
    expect(wynik[1]).toMatchObject({ x: 50, room: "Salon" });
  });
});

describe("uzyteNumeryObwodow", () => {
  it("numery z całego budynku, posortowane, z oznaczeniem tych spoza bieżącej kondygnacji", () => {
    const parter = [el({ id: "a", obwod: 3 }), el({ id: "b", obwod: 1 }), el({ id: "c" })];
    const pietro = [el({ id: "d", floor: "f2", obwod: 5 }), el({ id: "e", floor: "f2", obwod: 3 })];
    expect(uzyteNumeryObwodow(parter, [...parter, ...pietro])).toEqual([
      { numer: 1, gdzieIndziej: false },
      { numer: 3, gdzieIndziej: false },
      { numer: 5, gdzieIndziej: true },
    ]);
  });
});
