import { useCallback, useEffect, useMemo } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { scaleOf } from "@/lib/design";
import {
  activeStepId,
  isComplete,
  reconcile,
  shouldShowCard,
  stepsFor,
  type OnboardingFacts,
  type Step,
  type StepId,
} from "@/lib/onboarding";

/**
 * Spina zapisany postęp onboardingu z tym, co faktycznie jest w projekcie.
 *
 * Rolę „OnboardingProvider" ze specyfikacji pełni tu store Zustanda plus ten hook,
 * a nie osobny Context — projekt trzyma cały stan globalny w Zustandzie i dokładanie
 * drugiego mechanizmu tylko po to, żeby nazwa się zgadzała, rozjechałoby konwencję.
 *
 * Uzgodnienie faktów z flagami dzieje się w efekcie, a nie przy renderze, bo zapis
 * do store'a w trakcie renderowania to pętla aktualizacji.
 */
export interface OnboardingProgress {
  steps: Step[];
  activeStep: StepId | null;
  complete: boolean;
  /** Czy pokazać pełną kartę (kontra sam dyskretny przycisk „?"). */
  showCard: boolean;
  skipped: boolean;
  /** Świadome „Pomiń" na EKRANIE STARTOWYM — patrz `ekranStartowyPominiety` w
   *  lib/onboarding.ts. W odróżnieniu od `skipped`, `reopen()` tego NIE zdejmuje. */
  entryScreenDismissed: boolean;
  dismissEntryScreen: () => void;
  /** Skala straciła ważność po podmianie podkładu. */
  scaleStale: boolean;
  /** Projekt ma elementy, ale nie ma skali — powód trwałego banera. */
  missingScaleWarning: boolean;
  /** Kolejna kondygnacja odziedziczyła skalę, ale nie ma jeszcze pomieszczeń.
   *  Przewodnik dotyczy pierwszej kondygnacji — tu wystarczy krótka prośba. */
  needsRoomConfirmation: boolean;
  facts: OnboardingFacts;
  completeStep: (id: StepId) => void;
  skip: () => void;
  reopen: () => void;
  collapse: () => void;
  dismissScaleStale: () => void;
}

/** Klucz w localStorage: „ten użytkownik widział już przewodnik kiedykolwiek". */
export const SEEN_ONBOARDING_KEY = "pomocnikelektryka_onboarding_seen";

export function hasSeenOnboarding(): boolean {
  try {
    return localStorage.getItem(SEEN_ONBOARDING_KEY) === "1";
  } catch {
    // prywatny tryb przeglądarki potrafi rzucać przy dostępie do localStorage —
    // brak tej flagi jest nieszkodliwy, więc nie psujemy przez to całej zakładki
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    localStorage.setItem(SEEN_ONBOARDING_KEY, "1");
  } catch {
    /* patrz wyżej */
  }
}

export function useOnboardingProgress(): OnboardingProgress {
  const saved = useProjectStore((s) => s.onboarding);
  const setOnboarding = useProjectStore((s) => s.setOnboarding);
  const elements = useProjectStore((s) => s.draft.elements);
  const roomShapes = useProjectStore((s) => s.draft.roomShapes);
  const scales = useProjectStore((s) => s.scales);
  const bgImages = useProjectStore((s) => s.bgImages);
  const activeFloorId = useProjectStore((s) => s.activeFloorId);
  const floors = useProjectStore((s) => s.floors);

  const facts = useMemo<OnboardingFacts>(
    () => ({
      maSkale: scaleOf(scales, activeFloorId) !== null,
      // „nazwane" to nie to samo co „istniejące": obrys bez nazwy nie niesie
      // informacji o typie pomieszczenia, a to ona wpływa później na reguły
      maNazwanePomieszczenie: roomShapes.some((r) => r.floor === activeFloorId && r.name.trim().length > 0),
      maElement: elements.some((e) => e.floor === activeFloorId),
      maPodklad: !!bgImages[activeFloorId],
    }),
    [scales, roomShapes, elements, bgImages, activeFloorId]
  );

  // Fakty zapalają flagi (lepko). Zapisujemy tylko wtedy, gdy coś się realnie
  // zmieniło — inaczej każdy render pisałby do store'a.
  useEffect(() => {
    const next = reconcile(saved, facts);
    if (next.krok1Done !== saved.krok1Done || next.krok2Done !== saved.krok2Done || next.krok3Done !== saved.krok3Done || next.skalaNieaktualna !== saved.skalaNieaktualna) {
      setOnboarding(next);
    }
  }, [saved, facts, setOnboarding]);

  const merged = useMemo(() => reconcile(saved, facts), [saved, facts]);

  const completeStep = useCallback(
    (id: StepId) => {
      const key = ({ skala: "krok1Done", pomieszczenia: "krok2Done", element: "krok3Done" } as const)[id];
      setOnboarding({ [key]: true });
    },
    [setOnboarding]
  );

  const skip = useCallback(() => {
    markOnboardingSeen();
    setOnboarding({ pominiety: true, ostatnioOtwarty: false });
  }, [setOnboarding]);

  const reopen = useCallback(() => setOnboarding({ pominiety: false, ostatnioOtwarty: true, otwartyRecznie: true }), [setOnboarding]);
  const collapse = useCallback(() => setOnboarding({ ostatnioOtwarty: false, otwartyRecznie: false }), [setOnboarding]);
  const dismissScaleStale = useCallback(() => setOnboarding({ skalaNieaktualna: false }), [setOnboarding]);
  const dismissEntryScreen = useCallback(() => {
    // Pominięcie ekranu startowego pomija onboarding W CAŁOŚCI (nie tylko jego
    // pierwszy krok) — kto odrzucił JEDEN wybór, nie chce być pytany o kolejne
    // trzy zaraz potem. `pominiety`/`ostatnioOtwarty` jak w `skip()` (zostaje
    // dyskretny przycisk „?"), plus WŁASNA flaga, której `reopen()` nie zdejmuje.
    markOnboardingSeen();
    setOnboarding({ ekranStartowyPominiety: true, pominiety: true, ostatnioOtwarty: false });
  }, [setOnboarding]);

  return {
    steps: stepsFor(merged),
    activeStep: activeStepId(merged),
    complete: isComplete(merged),
    showCard: shouldShowCard(merged),
    skipped: merged.pominiety,
    entryScreenDismissed: merged.ekranStartowyPominiety,
    dismissEntryScreen,
    scaleStale: merged.skalaNieaktualna,
    // Baner ma sens dopiero, gdy jest co mierzyć — pusty projekt bez skali
    // nie jest jeszcze problemem, tylko stanem wyjściowym.
    missingScaleWarning: !facts.maSkale && facts.maElement,
    // Tylko na kondygnacjach POZA pierwszą i dopiero gdy przewodnik przeszedł już
    // krok „pomieszczenia" — na parterze tę rolę pełni sama karta onboardingu.
    needsRoomConfirmation:
      floors.length > 1 && floors[0]?.id !== activeFloorId && merged.krok2Done && !facts.maNazwanePomieszczenie,
    facts,
    completeStep,
    skip,
    reopen,
    collapse,
    dismissScaleStale,
  };
}
