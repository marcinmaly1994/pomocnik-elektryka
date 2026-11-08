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

  it("tryb compact chowa napis zawsze", () => {
    render(<CloudSaveIndicator compact />);
    expect(screen.getByText(/^Zapisano \d/).className).toContain("sr-only");
    expect(screen.getByText(/^Zapisano \d/).className).not.toContain("max-sm");
  });

  it("błąd zapisu też jest samą ikoną na telefonie, z pełnym opisem", () => {
    useProjectStore.setState({ cloudSaveError: "boom" } as never);
    render(<CloudSaveIndicator />);
    expect(screen.getByText("Nie udało się zapisać w chmurze").className).toContain("max-sm:sr-only");
  });
});
