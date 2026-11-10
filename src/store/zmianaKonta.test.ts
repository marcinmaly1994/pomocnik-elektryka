import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Wylogowanie i zmiana konta w tej samej karcie (audyt kont 10.11.2026).
 *
 * 1. Wylogowanie unieważnia sesję na serwerze — wcześniej czyściło tylko
 *    `localStorage`, a token odnawiający zostawał ważny bez końca.
 * 2. Po zalogowaniu INNEGO konta `cloudId` poprzedniego nie może przetrwać — zapis
 *    celowałby w cudzy wiersz, RLS odrzucał go pustą odpowiedzią, a aplikacja
 *    pokazywała fałszywy konflikt albo fałszywe „Zapisano”.
 * 3. Pusta odpowiedź na PATCH bez warunku to błąd, nie sukces.
 */

const supa = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
  list: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase", async (importOriginal) => {
  const oryginal = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...oryginal,
    SUPABASE_CONFIGURED: true,
    supaUpdateProject: supa.update,
    supaInsertProject: supa.insert,
    supaListProjects: supa.list,
    supaLogout: supa.logout,
    supaRefresh: supa.refresh,
  };
});

const { useProjectStore } = await import("./useProjectStore");

const za = (ms: number) => Date.now() + ms;
const sesja = (id: string, token = `t-${id}`, expiresAt = za(3_600_000)) => ({
  token,
  user: { id, email: `${id}@example.com` },
  refreshToken: `r-${id}`,
  expiresAt,
});

describe("wylogowanie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supa.logout.mockResolvedValue(undefined);
  });

  it("czyści sesję lokalnie i unieważnia ją na serwerze jej tokenem", async () => {
    useProjectStore.getState().setSession(sesja("u1"));
    await useProjectStore.getState().wyloguj();
    expect(useProjectStore.getState().session).toBeNull();
    expect(supa.logout).toHaveBeenCalledWith("t-u1");
  });

  it("wygasły token najpierw odświeża — inaczej /logout odbiłby się, a token odnawiający przeżył", async () => {
    useProjectStore.getState().setSession(sesja("u1", "stary", Date.now() - 1000));
    supa.refresh.mockResolvedValueOnce({ access_token: "swiezy", refresh_token: "r2", expires_in: 3600, user: { id: "u1" } });
    await useProjectStore.getState().wyloguj();
    expect(supa.refresh).toHaveBeenCalledWith("r-u1");
    expect(supa.logout).toHaveBeenCalledWith("swiezy");
  });

  it("brak sieci nie zatrzymuje wylogowania lokalnego", async () => {
    useProjectStore.getState().setSession(sesja("u1"));
    supa.logout.mockRejectedValueOnce(new Error("Brak połączenia"));
    await expect(useProjectStore.getState().wyloguj()).resolves.toBeUndefined();
    expect(useProjectStore.getState().session).toBeNull();
  });
});

describe("zmiana konta w tej samej karcie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().resetProject();
  });

  it("inne konto zaczyna bez powiązań z chmurą poprzedniego", () => {
    const { setSession } = useProjectStore.getState();
    setSession(sesja("u1"));
    useProjectStore.setState({ cloudId: "wiersz-u1", protokolyId: "protokoly-u1" });
    setSession(null);
    setSession(sesja("u2"));
    expect(useProjectStore.getState().cloudId).toBeNull();
    expect(useProjectStore.getState().protokolyId).toBeNull();
  });

  it("powrót TEGO SAMEGO konta zachowuje powiązanie — bez drugiego wiersza dla tego samego projektu", () => {
    const { setSession } = useProjectStore.getState();
    setSession(sesja("u1"));
    useProjectStore.setState({ cloudId: "wiersz-u1" });
    setSession(null);
    setSession(sesja("u1"));
    expect(useProjectStore.getState().cloudId).toBe("wiersz-u1");
  });

  it("odświeżenie tokenu tego samego konta niczego nie zeruje", () => {
    const { setSession } = useProjectStore.getState();
    setSession(sesja("u1"));
    useProjectStore.setState({ cloudId: "wiersz-u1" });
    setSession(sesja("u1", "nowy-token"));
    expect(useProjectStore.getState().cloudId).toBe("wiersz-u1");
  });
});

describe("pusta odpowiedź na zapis bez warunku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.getState().resetProject();
    useProjectStore.getState().setSession(sesja("u1"));
  });

  it("„nadpisz mimo to” w wiersz, którego nie ma, to błąd, a nie „Zapisano”", async () => {
    useProjectStore.setState({ cloudId: "p1", lastCloudSaveAt: null });
    supa.list.mockResolvedValueOnce([{ id: "p1", name: "Mój dom", updated_at: "x", kind: "projekt" }]);
    supa.update.mockResolvedValueOnce([]);
    await useProjectStore.getState().saveToCloud({ reczny: true, nadpiszId: "p1" });
    const s = useProjectStore.getState();
    expect(s.lastCloudSaveAt).toBeNull();
    expect(s.cloudSaveError).toMatch(/Nie znaleziono tego zapisu/);
    expect(s.cloudId).toBeNull();
  });
});
