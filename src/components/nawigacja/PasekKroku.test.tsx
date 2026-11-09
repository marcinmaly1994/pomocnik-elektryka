import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PasekKroku } from "./PasekKroku";

describe("PasekKroku", () => {
  it("prowadzi wstecz i dalej, nazwy jak dawne pigułki", () => {
    const onPick = vi.fn();
    render(
      <PasekKroku
        poprzedni={{ id: "projekt", tytul: "Instalacja" }}
        nastepny={{ id: "schemat", tytul: "Schemat" }}
        onPick={onPick}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cofnij: Instalacja" }));
    fireEvent.click(screen.getByRole("button", { name: "Dalej: Schemat" }));
    expect(onPick.mock.calls).toEqual([["projekt"], ["schemat"]]);
  });

  it("jest nawigacją z nazwą (landmark dla czytnika)", () => {
    render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.getByRole("navigation", { name: "Kroki projektu" })).toBeInTheDocument();
  });

  it("na ostatnim kroku jest tylko „Cofnij”, „Dalej” to akcja główna", () => {
    const { rerender } = render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /^Dalej:/ })).toBeNull();
    rerender(<PasekKroku nastepny={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Dalej: Schemat" }).className).toContain("bg-copper");
  });

  it("pobiera kod następnej zakładki zawczasu — po najechaniu i po fokusie", () => {
    const onPrefetch = vi.fn();
    render(<PasekKroku nastepny={{ id: "kosztorys", tytul: "Kosztorys" }} onPick={vi.fn()} onPrefetch={onPrefetch} />);
    const dalej = screen.getByRole("button", { name: "Dalej: Kosztorys" });
    fireEvent.pointerEnter(dalej);
    fireEvent.focus(dalej);
    expect(onPrefetch).toHaveBeenCalledWith("kosztorys");
  });

  it("przedrostek leży W przycisku: nazwa i tekst zostają pełne, także gdy na telefonie jest ukryty", () => {
    render(<PasekKroku poprzedni={{ id: "projekt", tytul: "Instalacja" }} onPick={vi.fn()} />);
    const b = screen.getByRole("button", { name: "Cofnij: Instalacja" });
    expect(b.textContent).toBe("Cofnij: Instalacja");
  });

  it("ma gniazdo na środku dla treści zakładki (np. sumy kosztorysu)", () => {
    const { container } = render(<PasekKroku poprzedni={{ id: "schemat", tytul: "Schemat" }} onPick={vi.fn()} />);
    const slot = container.querySelector("#pasek-kroku-srodek");
    expect(slot).not.toBeNull();
    expect(slot!.parentElement!.tagName).toBe("NAV");
  });

  it("bez kroków nie renderuje niczego", () => {
    const { container } = render(<PasekKroku onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
