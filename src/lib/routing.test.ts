import { describe, it, expect } from "vitest";
import { buildPath, dopasujParam, parsePath, zakladkaZParametrem, ZAKLADKA_DOMYSLNA } from "./routing";

describe("parsePath", () => {
  it("„/” to zakładka startowa bez parametru", () => {
    expect(parsePath("/")).toEqual({ tab: "projekt", param: null, rozpoznana: true });
    expect(parsePath("")).toEqual({ tab: "projekt", param: null, rozpoznana: true });
  });

  it("rozpoznaje zakładki po pierwszym segmencie", () => {
    expect(parsePath("/rozdzielnica").tab).toBe("rozdzielnica");
    expect(parsePath("/schemat").tab).toBe("schemat");
    expect(parsePath("/kosztorys").tab).toBe("kosztorys");
    expect(parsePath("/kalkulatory").tab).toBe("kalkulatory");
    expect(parsePath("/protokoly").tab).toBe("protokoly");
  });

  it("czyta drugi segment jako parametr", () => {
    expect(parsePath("/kalkulatory/spadek")).toEqual({ tab: "kalkulatory", param: "spadek", rozpoznana: true });
    expect(parsePath("/protokoly/izolacja")).toEqual({ tab: "protokoly", param: "izolacja", rozpoznana: true });
  });

  it("znosi ukośnik na końcu i podwojone ukośniki", () => {
    expect(parsePath("/kalkulatory/")).toEqual({ tab: "kalkulatory", param: null, rozpoznana: true });
    expect(parsePath("//kalkulatory//spadek//")).toEqual({ tab: "kalkulatory", param: "spadek", rozpoznana: true });
  });

  it("nieznany adres cofa do zakładki domyślnej zamiast pustki i mówi, że go nie rozpoznał", () => {
    // Literówka w ręcznie wpisanym adresie ma wylądować na czymś sensownym —
    // ta sama zasada, co przy nieistniejącym id kalkulatora w localStorage.
    expect(parsePath("/kalkulatry")).toEqual({ tab: ZAKLADKA_DOMYSLNA, param: null, rozpoznana: false });
    expect(parsePath("/cokolwiek/glebiej")).toEqual({ tab: ZAKLADKA_DOMYSLNA, param: null, rozpoznana: false });
  });

  it("„rozpoznana” odróżnia prawdziwe „/” od cofnięcia się do niego", () => {
    // Bez tego rozróżnienia powłoka nie wiedziałaby, kiedy poprawić adres w pasku:
    // oba przypadki dają tę samą zakładkę, ale tylko jeden z nich jest kłamstwem.
    expect(parsePath("/").rozpoznana).toBe(true);
    expect(parsePath("/nie-ma-takiej-strony").rozpoznana).toBe(false);
  });

  it("nie rozróżnia wielkości liter w nazwie zakładki", () => {
    expect(parsePath("/Kalkulatory/Spadek").tab).toBe("kalkulatory");
  });

  it("rozpoznaje stronę „Prywatność i dane” jako osobny widok, nie jako literówkę", () => {
    // Prywatność jest widokiem najwyższego poziomu, ale NIE krokiem przepływu —
    // musi mieć własny adres do podlinkowania (ze stopki, z Pomocy i z formularza
    // rejestracji, gdzie link otwiera się w nowej karcie, więc dostaje goły URL).
    expect(parsePath("/prywatnosc")).toEqual({ tab: "prywatnosc", param: null, rozpoznana: true });
    expect(buildPath("prywatnosc")).toBe("/prywatnosc");
  });

  it("rozpoznaje regulamin jako osobny widok", () => {
    // Drugi dokument formalny, ten sam mechanizm — też musi dać się podlinkować
    // ze stopki i z formularza rejestracji (tam w nowej karcie).
    expect(parsePath("/regulamin")).toEqual({ tab: "regulamin", param: null, rozpoznana: true });
    expect(buildPath("regulamin")).toBe("/regulamin");
  });

  it("dekoduje procenty, a niepoprawna sekwencja nie wywraca parsowania", () => {
    expect(parsePath("/protokoly/ogl%C4%99dziny").param).toBe("oględziny");
    // „%" bez dwóch cyfr za nim wywraca decodeURIComponent — ma przejść jak leci
    expect(parsePath("/kalkulatory/100%").param).toBe("100%");
  });
});

describe("buildPath", () => {
  it("zakładka startowa to „/”, bez własnego segmentu", () => {
    expect(buildPath("projekt")).toBe("/");
    // parametr przy zakładce startowej nie ma sensu i nie powstaje
    expect(buildPath("projekt", "cokolwiek")).toBe("/");
  });

  it("składa adres z parametrem i bez", () => {
    expect(buildPath("kalkulatory")).toBe("/kalkulatory");
    expect(buildPath("kalkulatory", "spadek")).toBe("/kalkulatory/spadek");
    expect(buildPath("protokoly", "izolacja")).toBe("/protokoly/izolacja");
  });

  it("jest odwrotnością parsePath dla adresów, które sam tworzy", () => {
    for (const [tab, param] of [
      ["kalkulatory", "gGWkladka"],
      ["protokoly", "ogledziny"],
      ["rozdzielnica", null],
      ["projekt", null],
    ] as const) {
      const wynik = parsePath(buildPath(tab, param));
      expect(wynik.tab).toBe(tab);
      expect(wynik.param).toBe(param);
    }
  });
});

describe("zakladkaZParametrem", () => {
  it("tylko kalkulatory i protokoły niosą drugi segment", () => {
    expect(zakladkaZParametrem("kalkulatory")).toBe(true);
    expect(zakladkaZParametrem("protokoly")).toBe(true);
    expect(zakladkaZParametrem("rozdzielnica")).toBe(false);
    expect(zakladkaZParametrem("projekt")).toBe(false);
  });
});

describe("dopasujParam", () => {
  const kalkulatory = ["spadek", "gGWkladka", "bilansFaz"] as const;

  it("zwraca postać KANONICZNĄ, nie to, co wpisano", () => {
    // Sedno: id bywa camelCase, a nikt nie przepisze „gGWkladka" z pamięci —
    // adres ma zadziałać, ale w pasku ma się pokazać jedna postać.
    expect(dopasujParam("ggwkladka", kalkulatory)).toBe("gGWkladka");
    expect(dopasujParam("GGWKLADKA", kalkulatory)).toBe("gGWkladka");
    expect(dopasujParam("spadek", kalkulatory)).toBe("spadek");
  });

  it("nieznana i pusta wartość dają null", () => {
    expect(dopasujParam("nie-ma-takiego", kalkulatory)).toBeNull();
    expect(dopasujParam(null, kalkulatory)).toBeNull();
  });
});
