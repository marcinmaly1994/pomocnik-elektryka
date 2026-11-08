import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { CloudSaveIndicator } from "./CloudSaveIndicator";
import { useProjectStore } from "@/store/useProjectStore";

const SESJA = { token: "t", user: { id: "u", email: "a@b.pl" } } as never;

describe("CloudSaveIndicator na wąskim ekranie", () => {
  beforeEach(() => {
    useProjectStore.setState({
      session: SESJA,
      cloudBusy: false,
      cloudSaveError: null,
      konfliktChmury: null,
      lastCloudSaveAt: Date.now(),
    } as never);
  });

  it("napis stanu jest chowany wizualnie poniżej sm, ale zostaje dla czytników", () => {
    render(<CloudSaveIndicator />);
    const napis = screen.getByText(/^Zapisano \d/);
    expect(napis.className).toContain("max-sm:sr-only");
  });

  it("zapisywanie też jest samą ikoną na telefonie", () => {
    useProjectStore.setState({ cloudBusy: true } as never);
    render(<CloudSaveIndicator />);
    expect(screen.getByText("Zapisywanie w chmurze…").className).toContain("max-sm:sr-only");
  });

  it("błąd zapisu zostaje WIDOCZNYM słowem na telefonie, a czytnik dostaje pełne zdanie", () => {
    useProjectStore.setState({ cloudSaveError: "boom" } as never);
    render(<CloudSaveIndicator />);
    const krotko = screen.getByText("Błąd zapisu");
    expect(krotko.className).toContain("sm:hidden");
    expect(krotko.className).not.toContain("sr-only");
    expect(krotko.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Nie udało się zapisać w chmurze").className).toContain("max-sm:sr-only");
  });

  it("konflikt zostaje WIDOCZNYM słowem na telefonie, a czytnik dostaje pełne zdanie", () => {
    useProjectStore.setState({ konfliktChmury: { rodzaj: "projekt" } } as never);
    render(<CloudSaveIndicator />);
    const krotko = screen.getByText("Konflikt");
    expect(krotko.className).toContain("sm:hidden");
    expect(krotko.className).not.toContain("sr-only");
    expect(krotko.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("Zmiany niezapisane — konflikt").className).toContain("max-sm:sr-only");
  });
});
