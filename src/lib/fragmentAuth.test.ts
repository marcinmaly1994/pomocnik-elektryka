import { describe, it, expect } from "vitest";
import { odczytajFragmentAuth } from "./fragmentAuth";

/**
 * Supabase odsyła użytkownika z maila pod adres aplikacji, a wynik wkleja we
 * FRAGMENT adresu (za `#`), nie w zapytanie. Fragment nigdy nie leci na serwer,
 * więc to jedyne miejsce, z którego da się odczytać, po co ktoś tu przyszedł.
 */
describe("odczytajFragmentAuth", () => {
  it("fragment resetu hasła daje token do zmiany hasła", () => {
    const hash =
      "#access_token=eyJabc&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery";
    expect(odczytajFragmentAuth(hash)).toEqual({ rodzaj: "reset", token: "eyJabc" });
  });

  /** Prawdziwy fragment zaobserwowany na tym projekcie przy zużytym linku. */
  it("fragment wygasłego linku daje kod błędu", () => {
    const hash =
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=";
    expect(odczytajFragmentAuth(hash)).toEqual({ rodzaj: "blad", kod: "otp_expired" });
  });

  it("błąd bez `error_code` spada na samo `error`", () => {
    expect(odczytajFragmentAuth("#error=server_error")).toEqual({ rodzaj: "blad", kod: "server_error" });
  });

  /**
   * Potwierdzenie Supabase załatwia po swojej stronie ZANIM przekieruje. Aplikacja
   * ma tylko zdjąć fragment (niesie tokeny) i powiedzieć, co się stało — wcześniej
   * fragment rejestracji zostawał w pasku adresu razem z tokenem sesji.
   */
  it("fragment potwierdzenia rejestracji → potwierdzono rejestrację", () => {
    expect(odczytajFragmentAuth("#access_token=eyJabc&type=signup")).toEqual({ rodzaj: "potwierdzono", co: "rejestracja" });
  });

  it("fragment potwierdzenia zmiany adresu → potwierdzono e-mail", () => {
    expect(odczytajFragmentAuth("#access_token=eyJabc&type=email_change")).toEqual({ rodzaj: "potwierdzono", co: "email" });
  });

  it("pierwszy z dwóch linków bezpiecznej zmiany adresu → połowa", () => {
    const hash = "#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email";
    expect(odczytajFragmentAuth(hash)).toEqual({ rodzaj: "potwierdzono", co: "email_polowa" });
  });

  /** Bez tokenu nie da się zmienić hasła — otwarcie okna byłoby ślepym zaułkiem. */
  it("typ `recovery` bez tokenu jest ignorowany", () => {
    expect(odczytajFragmentAuth("#type=recovery")).toBeNull();
  });

  it("zwykłe wejście na stronę nic nie uruchamia", () => {
    expect(odczytajFragmentAuth("")).toBeNull();
    expect(odczytajFragmentAuth("#")).toBeNull();
    expect(odczytajFragmentAuth("#sekcja-pomoc")).toBeNull();
  });

  it("radzi sobie z fragmentem bez wiodącego `#`", () => {
    expect(odczytajFragmentAuth("access_token=eyJabc&type=recovery")).toEqual({
      rodzaj: "reset",
      token: "eyJabc",
    });
  });
});
