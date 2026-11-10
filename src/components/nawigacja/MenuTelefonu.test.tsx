import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MenuTelefonu } from "./MenuTelefonu";

describe("MenuTelefonu", () => {
  it("przycisk „Menu” otwiera arkusz z pozycjami, wybór pozycji go zamyka", async () => {
    const klik = vi.fn();
    render(
      <MenuTelefonu>
        <button onClick={klik}>Kalkulatory</button>
      </MenuTelefonu>
    );
    expect(screen.queryByRole("button", { name: "Kalkulatory" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    await screen.findByRole("dialog", { name: "Menu" });
    fireEvent.click(screen.getByRole("button", { name: "Kalkulatory" }));
    expect(klik).toHaveBeenCalled();
    // Radix zamyka okno przez stan i animację wyjścia — sprawdzamy po ustaleniu się DOM.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("arkusz ma przycisk zamknięcia z nazwą", async () => {
    render(<MenuTelefonu><button>Pomoc</button></MenuTelefonu>);
    fireEvent.click(screen.getByRole("button", { name: "Menu" }));
    expect(await screen.findByRole("button", { name: "Zamknij" })).toBeInTheDocument();
  });
});
