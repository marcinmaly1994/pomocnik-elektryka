import { describe, it, expect } from "vitest";
import type { ElementType, InstallationElement, RoomShape, RoomType } from "@/types";
import { NO_ROOM } from "./elements";
import { checkPlan, podsumowanieProblemow, type PlanIssue } from "./planCheck";

/** 1 jedn. = 5 cm (MANUAL_DRAW_SCALE_MPU), więc 0,65 m = 13 jedn., a 1,25 m = 25 jedn. */
const MPU = 0.05;

function el(type: ElementType, x: number, y: number, room = "Łazienka", over: Partial<InstallationElement> = {}): InstallationElement {
  return {
    id: `${type}-${x}-${y}`,
    type,
    x,
    y,
    room,
    floor: "f1",
    dedicated: false,
    note: "",
    gangs: 1,
    ...over,
  };
}

function pokoj(name: string, type: RoomType): RoomShape {
  return {
    id: `r-${name}`,
    floor: "f1",
    name,
    color: "#2D5A8C",
    type,
    points: [
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 400, y: 400 },
      { x: 0, y: 400 },
    ],
  };
}

const LAZIENKA = pokoj("Łazienka", "lazienka");

function reguly(issues: PlanIssue[]): string[] {
  return issues.map((i) => i.rule);
}

function sprawdz(elements: InstallationElement[], roomShapes: RoomShape[] = [LAZIENKA], metersPerUnit: number | null = MPU) {
  return checkPlan({ elements, roomShapes, metersPerUnit });
}

describe("checkPlan — strefy ochronne", () => {
  const wanna = el("wanna", 100, 100);

  it("gniazdo w strefie 1 to BŁĄD, nie ostrzeżenie", () => {
    // 5 jedn. = 0,25 m od wanny, czyli głęboko w strefie 1 (0,65 m)
    const wynik = sprawdz([wanna, el("gniazdko", 105, 100)]);
    const strefa1 = wynik.find((i) => i.rule === "strefa1");
    expect(strefa1?.level).toBe("error");
    expect(strefa1?.detail).toContain("PN-HD 60364-7-701");
  });

  it("łącznik w strefie 1 też jest błędem", () => {
    expect(reguly(sprawdz([wanna, el("wlacznik", 105, 100)]))).toContain("strefa1");
  });

  it("gniazdo w strefie 2 to ostrzeżenie", () => {
    // 20 jedn. = 1,0 m — poza strefą 1 (0,65 m), wewnątrz strefy 2 (1,25 m)
    const wynik = sprawdz([wanna, el("gniazdko", 120, 100)]);
    expect(wynik.find((i) => i.rule === "strefa2")?.level).toBe("warn");
    expect(reguly(wynik)).not.toContain("strefa1");
  });

  it("łącznik w strefie 2 jest DOZWOLONY — norma traktuje go inaczej niż gniazdo", () => {
    expect(reguly(sprawdz([wanna, el("wlacznik", 120, 100)]))).not.toContain("strefa2");
  });

  it("gniazdo hermetyczne w strefie 1 nadal jest błędem — IP44 nie legalizuje strefy", () => {
    expect(reguly(sprawdz([wanna, el("gniazdkoHerm", 105, 100)]))).toContain("strefa1");
  });

  it("osprzęt poza wszystkimi strefami nie jest zgłaszany", () => {
    const wynik = reguly(sprawdz([wanna, el("gniazdko", 300, 100)]));
    expect(wynik).not.toContain("strefa1");
    expect(wynik).not.toContain("strefa2");
    expect(wynik).not.toContain("umywalka");
  });

  it("element blisko DWÓCH przyborów trafia na jedną listę — tę od ostrzejszej strefy", () => {
    // gniazdo 0,25 m od wanny i 0,25 m od umywalki: strefa 1 wygrywa, bez dublowania
    const wynik = sprawdz([wanna, el("umywalka", 110, 100), el("gniazdko", 105, 100)]);
    expect(reguly(wynik)).toContain("strefa1");
    expect(reguly(wynik)).not.toContain("umywalka");
    expect(wynik.find((i) => i.rule === "strefa1")!.elementIds).toHaveLength(1);
  });

  it("umywalka ma własną regułę odstępu, nie komunikat o strefie 2 wanny", () => {
    // umywalka: zone1 = 0, zone2 = 0,6 m → 5 jedn. = 0,25 m
    const wynik = sprawdz([el("umywalka", 100, 100), el("gniazdko", 105, 100)]);
    expect(reguly(wynik)).toContain("umywalka");
    expect(reguly(wynik)).not.toContain("strefa2");
    expect(wynik.find((i) => i.rule === "umywalka")!.detail).toContain("0,6 m");
  });

  it("bez skali reguły metryczne są POMIJANE i aplikacja mówi o tym wprost", () => {
    const wynik = reguly(sprawdz([wanna, el("gniazdko", 105, 100)], [LAZIENKA], null));
    expect(wynik).toContain("strefy-bez-skali");
    expect(wynik).not.toContain("strefa1");
  });

  it("spostrzeżenie o strefie niesie id elementu, żeby dało się go pokazać na planie", () => {
    const gniazdo = el("gniazdko", 105, 100);
    const wynik = sprawdz([wanna, gniazdo]);
    expect(wynik.find((i) => i.rule === "strefa1")!.elementIds).toEqual([gniazdo.id]);
  });
});

describe("checkPlan — osprzęt w pomieszczeniach wilgotnych", () => {
  it("zwykłe gniazdo w łazience prosi o wersję bryzgoszczelną", () => {
    expect(reguly(sprawdz([el("gniazdko", 300, 300)]))).toContain("ip44");
  });

  it("gniazdo hermetyczne w łazience jest w porządku", () => {
    expect(reguly(sprawdz([el("gniazdkoHerm", 300, 300)]))).not.toContain("ip44");
  });

  it("zwykłe gniazdo w KUCHNI jest normalne — kuchnia nie wymaga IP44", () => {
    // Kuchnia liczy się jako „mokra" przy doborze przekroju (isWetRoomName),
    // ale to inna sprawa niż stopień ochrony osprzętu.
    const kuchnia = pokoj("Kuchnia", "kuchnia");
    expect(reguly(sprawdz([el("gniazdko", 300, 300, "Kuchnia")], [kuchnia]))).not.toContain("ip44");
  });
});

describe("checkPlan — oświetlenie i sterowanie", () => {
  it("pomieszczenie bez punktu świetlnego", () => {
    expect(reguly(sprawdz([el("gniazdko", 300, 300)]))).toContain("brak-swiatla");
  });

  it("oprawa bez łącznika w tym samym pomieszczeniu", () => {
    const wynik = reguly(sprawdz([el("oswietlenie", 200, 200)]));
    expect(wynik).toContain("brak-lacznika");
    expect(wynik).not.toContain("brak-swiatla");
  });

  it("czujnik ruchu wystarcza za łącznik", () => {
    expect(reguly(sprawdz([el("oswietlenie", 200, 200), el("czujnikRuchu", 210, 210)]))).not.toContain("brak-lacznika");
  });

  it("termostat NIE wystarcza — steruje ogrzewaniem, nie światłem", () => {
    expect(reguly(sprawdz([el("oswietlenie", 200, 200), el("termostat", 210, 210)]))).toContain("brak-lacznika");
  });

  it("łącznik bez oprawy do sterowania", () => {
    expect(reguly(sprawdz([el("wlacznik", 200, 200)]))).toContain("lacznik-bez-lampy");
  });

  it("komplet oprawa + łącznik nie zgłasza nic z tej rodziny", () => {
    const wynik = reguly(sprawdz([el("oswietlenie", 200, 200), el("wlacznik", 210, 210)]));
    expect(wynik).not.toContain("brak-swiatla");
    expect(wynik).not.toContain("brak-lacznika");
    expect(wynik).not.toContain("lacznik-bez-lampy");
  });
});

describe("checkPlan — pozostałe reguły", () => {
  it("pusta kondygnacja dostaje jedno spostrzeżenie informacyjne, nie ścianę zarzutów", () => {
    const wynik = checkPlan({ elements: [], roomShapes: [], metersPerUnit: MPU });
    expect(reguly(wynik)).toEqual(["pusto"]);
  });

  it("elementy poza obrysem pomieszczenia", () => {
    const wynik = sprawdz([el("gniazdko", 900, 900, NO_ROOM)]);
    const bez = wynik.find((i) => i.rule === "bez-pomieszczenia");
    expect(bez?.level).toBe("warn");
    expect(bez?.title).toContain("(1)");
  });

  it("brak rozdzielnicy to INFO, nie ostrzeżenie — na piętrze jej zwykle nie ma", () => {
    expect(sprawdz([el("gniazdko", 300, 300)]).find((i) => i.rule === "brak-rozdzielnicy")?.level).toBe("info");
  });

  it("kotłownia bez czujnika czadu", () => {
    const kotlownia = pokoj("Kotłownia", "kotlownia");
    expect(reguly(sprawdz([el("gniazdko", 300, 300, "Kotłownia")], [kotlownia]))).toContain("brak-czujnika-czadu");
  });

  it("czujnik czadu na kondygnacji zamyka sprawę", () => {
    const kotlownia = pokoj("Kotłownia", "kotlownia");
    const elements = [el("gniazdko", 300, 300, "Kotłownia"), el("czujnikCzadu", 310, 310, "Kotłownia")];
    expect(reguly(sprawdz(elements, [kotlownia]))).not.toContain("brak-czujnika-czadu");
  });

  it("czysty rzut kończy się potwierdzeniem, nie pustą listą", () => {
    const salon = pokoj("Salon", "salon");
    const elements = [
      el("oswietlenie", 200, 200, "Salon"),
      el("wlacznik", 210, 210, "Salon"),
      el("gniazdko", 300, 300, "Salon"),
      el("rozdzielnica", 50, 50, "Salon"),
    ];
    const wynik = sprawdz(elements, [salon]);
    expect(reguly(wynik)).toEqual(["ok"]);
    expect(wynik[0].level).toBe("ok");
  });

  it("potwierdzenie NIE pojawia się obok błędu", () => {
    const wynik = reguly(sprawdz([el("wanna", 100, 100), el("gniazdko", 105, 100)]));
    expect(wynik).toContain("strefa1");
    expect(wynik).not.toContain("ok");
  });
});

describe("podsumowanieProblemow", () => {
  function iss(level: PlanIssue["level"]): PlanIssue {
    return { rule: level, level, title: "", detail: "", elementIds: [] };
  }

  it("odmienia przez liczby", () => {
    expect(podsumowanieProblemow([iss("error")])).toBe("1 błąd");
    expect(podsumowanieProblemow([iss("warn")])).toBe("1 uwaga");
  });

  it("łączy błędy i uwagi", () => {
    const issues = [iss("error"), iss("warn"), iss("warn")];
    // dwa warny mają ten sam `rule`, ale tu liczy się tylko poziom
    expect(podsumowanieProblemow(issues)).toBe("1 błąd · 2 uwagi");
  });

  it("info i ok NIE liczą się jako problemy", () => {
    expect(podsumowanieProblemow([iss("info"), iss("ok")])).toBe("bez zastrzeżeń");
  });
});
