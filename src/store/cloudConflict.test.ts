import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Konflikt zapisu w chmurze: w bazie stoi nowsza wersja niż ta, od której zaczynaliśmy.
 *
 * Zanim to powstało, zapis szedł ślepym PATCH-em po samym `id` — dwa urządzenia
 * z otwartym tym samym projektem kasowały sobie pracę nawzajem, a autozapis chodzi
 * co 2,5 s, więc przegrywał ten, kto zapisał wcześniej, i nie dowiadywał się o tym
 * nigdy. Teraz PATCH niesie warunek na `updated_at` i pusta odpowiedź znaczy „ktoś
 * był szybszy".
 */

const supa = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/lib/supabase", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...oryginal,
    SUPABASE_CONFIGURED: true,
    supaUpdateProject: supa.update,
    supaInsertProject: supa.insert,
    supaListProjects: supa.list,
  };
});

const { useProjectStore } = await import("./useProjectStore");

const SESJA = {
  token: "t",
  user: { id: "u1" },
  refreshToken: "r",
  expiresAt: Date.now() + 3_600_000,
};

/** Doprowadza store do stanu „projekt jest już w chmurze i znamy jego `updated_at`". */
async function zapiszPierwszyRaz(updatedAt: string) {
  supa.insert.mockResolvedValueOnce([{ id: "p1", name: "Mój dom", data: {}, updated_at: updatedAt }]);
  supa.list.mockResolvedValueOnce([]);
  await useProjectStore.getState().saveToCloud({ reczny: true });
}

describe("optimistic locking zapisu projektu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().resetProject();
    useProjectStore.setState({ session: SESJA, cloudId: null, konfliktChmury: null, autozapisWstrzymany: false });
  });

  it("pierwszy zapis zapamietuje znacznik z odpowiedzi bazy i uzywa go przy kolejnym", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    expect(useProjectStore.getState().cloudId).toBe("p1");

    supa.update.mockResolvedValueOnce([{ id: "p1", name: "Mój dom", data: {}, updated_at: "2026-09-06T10:05:00+00:00" }]);
    await useProjectStore.getState().saveToCloud({ reczny: true });

    // Czwarty argument to warunek — bez niego zapis byłby znowu ślepy.
    expect(supa.update).toHaveBeenCalledWith("t", "p1", expect.anything(), "2026-09-06T10:00:00+00:00");
  });

  it("pusta odpowiedz to konflikt: zglaszamy go i wstrzymujemy autozapis", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");

    const przedKonfliktem = useProjectStore.getState().lastCloudSaveAt;

    supa.update.mockResolvedValueOnce([]); // ktoś zapisał w międzyczasie
    await useProjectStore.getState().saveToCloud();

    const stan = useProjectStore.getState();
    expect(stan.konfliktChmury).toEqual({ rodzaj: "projekt", id: "p1", nazwa: "Mój dom" });
    // Bez wstrzymania autozapis wracałby z tym samym pytaniem co 2,5 s.
    expect(stan.autozapisWstrzymany).toBe(true);
    // Konflikt to NIE jest udany zapis — godzina „zapisano" nie ma prawa drgnąć,
    // bo na jej podstawie pasek stanu mówi użytkownikowi, że praca jest w chmurze.
    expect(stan.lastCloudSaveAt).toBe(przedKonfliktem);
  });

  /** Gdyby konflikt zaliczał się jako zapis, lokalna zmiana przepadłaby po cichu:
   *  autozapis uznałby ją za wysłaną i nigdy by do niej nie wrócił. */
  it("po konflikcie kolejny zapis nadal probuje wyslac te sama zmiane", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    supa.update.mockResolvedValueOnce([]);
    await useProjectStore.getState().saveToCloud();

    supa.update.mockResolvedValueOnce([{ id: "p1", name: "Mój dom", data: {}, updated_at: "2026-09-06T11:00:00+00:00" }]);
    await useProjectStore.getState().saveToCloud({ reczny: true });
    expect(supa.update).toHaveBeenCalledTimes(2);
    expect(useProjectStore.getState().lastCloudSaveAt).not.toBe(null);
  });

  it("swiadome „nadpisz moja wersja\" idzie bez warunku", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    supa.update.mockResolvedValueOnce([]);
    await useProjectStore.getState().saveToCloud();

    supa.update.mockResolvedValueOnce([{ id: "p1", name: "Mój dom", data: {}, updated_at: "2026-09-06T12:00:00+00:00" }]);
    await useProjectStore.getState().saveToCloud({ reczny: true, nadpiszId: "p1" });

    expect(supa.update).toHaveBeenLastCalledWith("t", "p1", expect.anything(), null);
    expect(useProjectStore.getState().konfliktChmury).toBe(null);
  });

  it("nowy projekt zapomina znacznik — inaczej pierwszy zapis celowalby w cudzy wiersz", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    useProjectStore.getState().resetProject();
    useProjectStore.setState({ session: SESJA });

    supa.list.mockResolvedValueOnce([]);
    supa.insert.mockResolvedValueOnce([{ id: "p2", name: "Mój dom", data: {}, updated_at: "2026-09-06T13:00:00+00:00" }]);
    await useProjectStore.getState().saveToCloud({ reczny: true });

    expect(supa.insert).toHaveBeenCalledTimes(2);
    expect(useProjectStore.getState().cloudId).toBe("p2");
  });
});

/**
 * Protokoly pomiarowe siedza w tej samej tabeli co projekty i szly tym samym slepym
 * PATCH-em. Zapisuja sie tylko na klikniecie, wiec okno na kolizje jest mniejsze niz
 * przy autozapisie co 2,5 s — ale konczy sie identycznie: pomiary wpisane na drugim
 * urzadzeniu znikaja bez sladu.
 */
describe("optimistic locking zapisu protokolow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().resetProject();
    useProjectStore.getState().nowyZestawProtokolow();
    useProjectStore.setState({ session: SESJA, konfliktChmury: null });
  });

  async function zapiszPierwszyRaz(updatedAt: string) {
    supa.list.mockResolvedValueOnce([]);
    supa.insert.mockResolvedValueOnce([{ id: "pr1", name: "Pomiary", data: {}, updated_at: updatedAt }]);
    await useProjectStore.getState().saveProtokolyToCloud("Pomiary");
  }

  it("kolejny zapis niesie znacznik z odpowiedzi bazy", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    expect(useProjectStore.getState().protokolyId).toBe("pr1");

    supa.list.mockResolvedValueOnce([{ id: "pr1", name: "Pomiary", updated_at: "x", kind: "protokoly" }]);
    supa.update.mockResolvedValueOnce([{ id: "pr1", name: "Pomiary", data: {}, updated_at: "2026-09-06T10:05:00+00:00" }]);
    await useProjectStore.getState().saveProtokolyToCloud("Pomiary");

    expect(supa.update).toHaveBeenCalledWith("t", "pr1", expect.anything(), "2026-09-06T10:00:00+00:00");
  });

  it("pusta odpowiedz zglasza konflikt opisany jako PROTOKOLY", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");

    supa.list.mockResolvedValueOnce([{ id: "pr1", name: "Pomiary", updated_at: "x", kind: "protokoly" }]);
    supa.update.mockResolvedValueOnce([]);
    await useProjectStore.getState().saveProtokolyToCloud("Pomiary");

    // Rodzaj decyduje o tresci okna i o tym, ktora akcje wywola „wczytaj"/„nadpisz".
    expect(useProjectStore.getState().konfliktChmury).toEqual({ rodzaj: "protokoly", id: "pr1", nazwa: "Pomiary" });
  });

  it("nowy zestaw zapomina znacznik — inaczej pierwszy zapis celowalby w cudzy wiersz", async () => {
    await zapiszPierwszyRaz("2026-09-06T10:00:00+00:00");
    useProjectStore.getState().nowyZestawProtokolow();

    supa.list.mockResolvedValueOnce([]);
    supa.insert.mockResolvedValueOnce([{ id: "pr2", name: "Pomiary 2", data: {}, updated_at: "2026-09-06T12:00:00+00:00" }]);
    await useProjectStore.getState().saveProtokolyToCloud("Pomiary 2");

    expect(useProjectStore.getState().protokolyId).toBe("pr2");
    expect(useProjectStore.getState().konfliktChmury).toBe(null);
  });
});
