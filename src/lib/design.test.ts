import { describe, it, expect } from "vitest";
import type { RoomShape } from "@/types";
import {
  ROOM_COLORS,
  roomColorForIndex,
  nextRoomName,
  nextRoomColor,
  colorForRoomName,
  NO_ROOM_COLOR,
  scaleOf,
  planSizeForImage,
  DEFAULT_PLAN_SIZE,
  GRID,
  defaultOpeningWidth,
  DEFAULT_DOOR_WIDTH_CM,
  DEFAULT_OPENING_WIDTH_UNITS,
} from "./design";

describe("roomColorForIndex", () => {
  it("cykluje przez paletę", () => {
    expect(roomColorForIndex(0)).toBe(ROOM_COLORS[0]);
    expect(roomColorForIndex(ROOM_COLORS.length)).toBe(ROOM_COLORS[0]);
    expect(roomColorForIndex(ROOM_COLORS.length + 2)).toBe(ROOM_COLORS[2]);
  });
});

describe("nextRoomName", () => {
  it("numeruje od 1", () => {
    expect(nextRoomName(0)).toBe("Pomieszczenie 1");
    expect(nextRoomName(4)).toBe("Pomieszczenie 5");
  });
});

describe("nextRoomColor", () => {
  it("przechodzi do kolejnego koloru w palecie", () => {
    expect(nextRoomColor(ROOM_COLORS[0])).toBe(ROOM_COLORS[1]);
  });

  it("zawija się na koniec palety", () => {
    expect(nextRoomColor(ROOM_COLORS[ROOM_COLORS.length - 1])).toBe(ROOM_COLORS[0]);
  });

  it("nieznany kolor -> pierwszy z palety", () => {
    expect(nextRoomColor("#000000")).toBe(ROOM_COLORS[0]);
  });
});

describe("colorForRoomName", () => {
  const salon: RoomShape = { id: "r1", floor: "f1", name: "Salon", color: "#3B8C63", points: [] };
  const kuchnia: RoomShape = { id: "r2", floor: "f1", name: "Kuchnia", color: "#C1793F", points: [] };

  it("dopasowuje po NAZWIE, nie po id", () => {
    expect(colorForRoomName("Salon", [salon, kuchnia])).toBe("#3B8C63");
    expect(colorForRoomName("Kuchnia", [salon, kuchnia])).toBe("#C1793F");
  });

  it("nazwa bez odpowiadającego obrysu (np. „Bez pomieszczenia”) dostaje neutralny szary", () => {
    expect(colorForRoomName("Bez pomieszczenia", [salon, kuchnia])).toBe(NO_ROOM_COLOR);
    expect(colorForRoomName("Sypialnia", [])).toBe(NO_ROOM_COLOR);
  });
});

describe("scaleOf", () => {
  it("zwraca skalę skalibrowanej kondygnacji", () => {
    expect(scaleOf({ f1: 0.02 }, "f1")).toBe(0.02);
  });

  it("brak wpisu -> null", () => {
    expect(scaleOf({}, "f1")).toBeNull();
  });

  it("nieprawidłowa wartość (0 lub ujemna) -> null", () => {
    expect(scaleOf({ f1: 0 }, "f1")).toBeNull();
    expect(scaleOf({ f1: -1 }, "f1")).toBeNull();
  });
});

describe("planSizeForImage", () => {
  it("zachowuje proporcje wgranego obrazu", () => {
    const s = planSizeForImage(1600, 900);
    expect(s.w / s.h).toBeCloseTo(16 / 9, 1);
  });

  it("trzyma pole powierzchni blisko domyślnego, żeby nie zmieniać gęstości siatki", () => {
    const base = DEFAULT_PLAN_SIZE.w * DEFAULT_PLAN_SIZE.h;
    [
      [1600, 900],
      [3, 4],
      [1000, 1000],
    ].forEach(([w, h]) => {
      const s = planSizeForImage(w, h);
      expect(s.w * s.h).toBeGreaterThan(base * 0.9);
      expect(s.w * s.h).toBeLessThan(base * 1.1);
    });
  });

  it("wymiary są wielokrotnością siatki, żeby kończyła się równo na krawędzi", () => {
    const s = planSizeForImage(1234, 567);
    expect(s.w % GRID).toBe(0);
    expect(s.h % GRID).toBe(0);
  });

  it("obraz kwadratowy daje kwadratowy plan", () => {
    const s = planSizeForImage(800, 800);
    expect(s.w).toBe(s.h);
  });

  it("bezsensowne wymiary cofają do domyślnego rozmiaru", () => {
    expect(planSizeForImage(0, 100)).toEqual(DEFAULT_PLAN_SIZE);
    expect(planSizeForImage(100, NaN)).toEqual(DEFAULT_PLAN_SIZE);
  });
});

describe("defaultOpeningWidth", () => {
  it("bez skali spada na stały fallback w jednostkach planu", () => {
    expect(defaultOpeningWidth(null)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
  });

  it("ze skalą przelicza realne centymetry na jednostki planu", () => {
    const mpu = 0.05; // 1 jedn. = 5 cm — MANUAL_DRAW_SCALE_MPU
    expect(defaultOpeningWidth(mpu)).toBeCloseTo(DEFAULT_DOOR_WIDTH_CM / 100 / mpu, 6);
  });

  it("nieprawidłowa skala (0 lub ujemna) też spada na fallback", () => {
    expect(defaultOpeningWidth(0)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
    expect(defaultOpeningWidth(-1)).toBe(DEFAULT_OPENING_WIDTH_UNITS);
  });
});
