import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("stare nazwy wariantów dają te same klasy co nowe (aliasy, nie osobne style)", () => {
    expect(buttonVariants({ variant: "copper" })).toBe(buttonVariants({ variant: "primary" }));
    expect(buttonVariants({ variant: "ghost" })).toBe(buttonVariants({ variant: "secondary" }));
    expect(buttonVariants({ variant: "destructive" })).toBe(buttonVariants({ variant: "danger" }));
  });

  it("rozmiary mają wysokości 32 / 40 / 48 px", () => {
    expect(buttonVariants({ size: "sm" })).toContain("h-8");
    expect(buttonVariants({ size: "md" })).toContain("h-10");
    expect(buttonVariants({ size: "lg" })).toContain("h-12");
    expect(buttonVariants({ size: "icon" })).toContain("h-8 w-8");
  });

  it("link nie dostaje wysokości ani wcięć przycisku, nawet z rozmiarem", () => {
    render(
      <Button variant="link" size="md">
        Regulamin
      </Button>
    );
    const klasy = screen.getByRole("button", { name: "Regulamin" }).className;
    expect(klasy).toContain("h-auto");
    expect(klasy).not.toContain("h-10");
  });

  it("akcja główna na telefonie ma co najmniej 44 px", () => {
    expect(buttonVariants({ variant: "primary" })).toContain("max-md:min-h-11");
  });

  it("każdy wariant ma widoczny pierścień fokusu z klawiatury", () => {
    for (const variant of ["primary", "secondary", "subtle", "danger", "link"] as const) {
      expect(buttonVariants({ variant })).toContain("focus-visible:ring-2");
    }
  });

  it("w trakcie ładowania: zablokowany, aria-busy, nazwa dostępna bez zmian", () => {
    const klik = vi.fn();
    render(
      <Button loading onClick={klik}>
        Zapisz
      </Button>
    );
    const przycisk = screen.getByRole("button", { name: "Zapisz" });
    expect(przycisk).toBeDisabled();
    expect(przycisk).toHaveAttribute("aria-busy", "true");
    // jsdom nie liczy visibility, więc nazwy nie sprawdzimy wprost: pilnujemy klasy.
    // `invisible` wyrzuca etykietę z nazwy dostępnej w przeglądarkach, `opacity-0` nie.
    const etykieta = screen.getByText("Zapisz");
    expect(etykieta).not.toHaveClass("invisible");
    expect(etykieta).toHaveClass("opacity-0");
    fireEvent.click(przycisk);
    expect(klik).not.toHaveBeenCalled();
  });

  it("bez ładowania nie ma aria-busy", () => {
    render(<Button>Zapisz</Button>);
    expect(screen.getByRole("button", { name: "Zapisz" })).not.toHaveAttribute("aria-busy");
  });
});
