import { afterEach, describe, expect, it, vi } from "vitest";
import { idZNazwyPliku, linkPodgladu, sciezkaPliku, udostepnienieZAdresu } from "./udostepnianie";
import { supaListaUdostepnien, supaUsunUdostepnienie, supaWgrajUdostepnienie } from "./supabase";

const UID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const ID = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";

describe("adres udostępnienia", () => {
  it("link i ścieżka pliku składają się z obu identyfikatorów", () => {
    expect(linkPodgladu("https://pomocnik-elektryka.pages.dev/", { uid: UID, id: ID })).toBe(
      `https://pomocnik-elektryka.pages.dev/udostepnione/${UID}/${ID}`
    );
    expect(sciezkaPliku({ uid: UID, id: ID })).toBe(`${UID}/${ID}.pdf`);
  });

  it("strona podglądu rozpoznaje tylko dwa UUID-y — nic innego nie trafi do ścieżki pliku", () => {
    expect(udostepnienieZAdresu(`/udostepnione/${UID}/${ID}`)).toEqual({ uid: UID, id: ID });
    expect(udostepnienieZAdresu(`/udostepnione/${UID.toUpperCase()}/${ID}/`)).toEqual({ uid: UID, id: ID });
    expect(udostepnienieZAdresu(`/udostepnione/${UID}/../${ID}`)).toBeNull();
    expect(udostepnienieZAdresu(`/udostepnione/${UID}`)).toBeNull();
    expect(udostepnienieZAdresu("/rozdzielnica")).toBeNull();
    expect(udostepnienieZAdresu(`/udostepnione/x/${ID}`)).toBeNull();
  });

  it("id z nazwy pliku w koszyku", () => {
    expect(idZNazwyPliku(`${ID}.pdf`)).toBe(ID);
    expect(idZNazwyPliku("cos.pdf")).toBeNull();
  });
});

describe("Storage: udostępnienia", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("wgrywa PDF pod ścieżkę właściciela, z tokenem sesji i bez nadpisywania", async () => {
    let url = "";
    let init: RequestInit = {};
    vi.stubGlobal("fetch", (u: string, i: RequestInit) => {
      url = String(u);
      init = i;
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    await supaWgrajUdostepnienie("tok", `${UID}/${ID}.pdf`, new Uint8Array([37, 80, 68, 70]));
    expect(url).toContain(`/storage/v1/object/udostepnienia/${UID}/${ID}.pdf`);
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer tok");
    expect(h["Content-Type"]).toBe("application/pdf");
    expect(h["x-upsert"]).toBe("false");
  });

  it("brak koszyka to zrozumiały komunikat o konfiguracji", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ error: "Bucket not found", statusCode: "404" }), { status: 400 })));
    await expect(supaWgrajUdostepnienie("tok", "a/b.pdf", new Uint8Array(1))).rejects.toThrow(/nie jest jeszcze skonfigurowane/);
  });

  it("odmowa reguł RLS to komunikat o uprawnieniach", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(JSON.stringify({ message: "new row violates row-level security policy" }), { status: 403 })));
    await expect(supaWgrajUdostepnienie("tok", "a/b.pdf", new Uint8Array(1))).rejects.toThrow(/Brak uprawnień/);
  });

  it("lista pyta tylko o folder właściciela; wyłączenie kasuje plik", async () => {
    const wywolania: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", (u: string, i: RequestInit) => {
      wywolania.push({ url: String(u), init: i });
      return Promise.resolve(new Response(JSON.stringify([{ name: `${ID}.pdf`, created_at: "2026-11-07T12:00:00Z" }]), { status: 200 }));
    });
    const lista = await supaListaUdostepnien("tok", UID);
    expect(lista[0].name).toBe(`${ID}.pdf`);
    expect(wywolania[0].url).toContain("/storage/v1/object/list/udostepnienia");
    expect(JSON.parse(String(wywolania[0].init.body)).prefix).toBe(`${UID}/`);
    await supaUsunUdostepnienie("tok", `${UID}/${ID}.pdf`);
    expect(wywolania[1].init.method).toBe("DELETE");
    expect(wywolania[1].url).toContain(`/udostepnienia/${UID}/${ID}.pdf`);
  });
});
