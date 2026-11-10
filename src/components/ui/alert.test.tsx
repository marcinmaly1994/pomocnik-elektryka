import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert } from "./alert";

describe("Alert", () => {
  it("błąd ogłasza się od razu (role=alert)", () => {
    render(<Alert variant="danger">Moc musi być dodatnia</Alert>);
    expect(screen.getByRole("alert")).toHaveTextContent("Moc musi być dodatnia");
  });

  it("pozostałe warianty to status, nie przerywają czytnika", () => {
    render(<Alert variant="caution">Wynik graniczny</Alert>);
    expect(screen.getByRole("status")).toHaveTextContent("Wynik graniczny");
  });

  it("własna rola i data-testid wywołującego wygrywają", () => {
    render(
      <Alert variant="danger" role="note" data-testid="bledy-bilansu">
        x
      </Alert>
    );
    expect(screen.getByTestId("bledy-bilansu")).toHaveAttribute("role", "note");
  });

  it("tytuł jest pogrubiony nad treścią, tekst 14 px, ikona ukryta przed czytnikiem", () => {
    const { container } = render(
      <Alert variant="info" title="Uwaga">
        Treść
      </Alert>
    );
    expect(screen.getByText("Uwaga").className).toContain("font-semibold");
    expect(container.firstElementChild!.className).toContain("text-sm");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("role=note wywołującego wyłącza ogłaszanie (listy odświeżane przy pisaniu)", () => {
    render(
      <Alert variant="danger" role="note">
        Lista
      </Alert>
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("Lista");
  });
});
