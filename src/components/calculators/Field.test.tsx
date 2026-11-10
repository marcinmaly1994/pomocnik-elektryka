import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field";

describe("Field", () => {
  it("pole ma nazwę z etykiety, a jednostkę w opisie (czytnik czyta „Moc odbiornika, W”)", () => {
    render(<Field label="Moc odbiornika" value={2000} onChange={vi.fn()} unit="W" />);
    const pole = screen.getByRole("spinbutton", { name: "Moc odbiornika" });
    expect(pole).toHaveAccessibleDescription("W");
  });

  it("jednostka stoi W ramce pola, nie obok niej", () => {
    render(<Field label="Długość" value={15} onChange={vi.fn()} unit="m" />);
    const pole = screen.getByRole("spinbutton", { name: "Długość" });
    const jednostka = screen.getByText("m");
    expect(pole.parentElement).toBe(jednostka.parentElement);
    expect(pole.className).toMatch(/\bpr-/);
  });

  it("pole bez jednostki nie ma opisu ani dodatkowego wcięcia", () => {
    render(<Field label="cos φ" value={1} onChange={vi.fn()} />);
    const pole = screen.getByRole("spinbutton", { name: "cos φ" });
    expect(pole).not.toHaveAttribute("aria-describedby");
  });

  it("na telefonie pole ma 16 px (iOS nie powiększa strony), od md 14 px", () => {
    render(<Field label="Długość" value={15} onChange={vi.fn()} unit="m" />);
    const klasy = screen.getByRole("spinbutton", { name: "Długość" }).className;
    expect(klasy).toContain("text-base");
    expect(klasy).toContain("md:text-sm");
  });

  it("lista wyboru dostaje wspólną klasę pe-select", () => {
    render(
      <Field
        label="Zasilanie"
        value="1"
        onChange={vi.fn()}
        options={[
          { value: "1", label: "1-fazowe" },
          { value: "3", label: "3-fazowe" },
        ]}
      />
    );
    expect(screen.getByRole("combobox", { name: "Zasilanie" }).className).toContain("pe-select");
  });
});
