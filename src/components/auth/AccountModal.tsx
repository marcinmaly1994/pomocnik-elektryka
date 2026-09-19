import { useEffect, useState } from "react";
import { AlertTriangle, Check, Download, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/store/useProjectStore";
import {
  supaDeleteAccount,
  supaDeleteProject,
  supaListProjects,
  supaSignIn,
  supaUpdateUser,
  type Session,
} from "@/lib/supabase";
import { zapiszKopie } from "@/lib/kopiaProjektu";

export type AccountModalTab = "profil" | "ustawienia";

interface AccountModalProps {
  open: boolean;
  initialTab: AccountModalTab;
  session: Session;
  onClose: () => void;
}

/** Dane WYKONAWCY (nie obiektu pomiaru!) — te same pola co w Protokołach, ten sam
 *  `docHeader` w store. Celowo tylko podzbiór: „obiekt/adres/data pomiaru" dotyczy
 *  KONKRETNEGO zlecenia i zostaje wyłącznie w Protokołach, ale nazwisko, uprawnienia
 *  i miernik są Twoje własne i takie same przy każdym zleceniu — stąd żyją tu, w
 *  profilu, jako jedno źródło prawdy współdzielone z formularzem w Protokołach. */
const WYKONAWCA_FIELDS: [string, string][] = [
  ["wykonawca", "Imię i nazwisko"],
  ["uprawnienia", "Nr uprawnień (SEP E/D)"],
  ["przyrzad", "Przyrząd pomiarowy"],
  ["nrFabryczny", "Nr fabryczny przyrządu"],
  ["swiadectwo", "Świadectwo wzorcowania"],
];

function ProfilTab({ session }: { session: Session }) {
  const docHeader = useProjectStore((s) => s.docHeader);
  const setDocHeader = useProjectStore((s) => s.setDocHeader);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);

  const createdAt = typeof session.user.created_at === "string" ? session.user.created_at : null;

  async function changePassword() {
    setErr("");
    setOk(false);
    if (newPassword.length < 6) {
      setErr("Hasło musi mieć co najmniej 6 znaków.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr("Hasła nie są takie same.");
      return;
    }
    setBusy(true);
    try {
      await supaUpdateUser(session.token, { password: newPassword });
      setOk(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się zmienić hasła.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
          style={{ background: "#2D5A8C" }}
        >
          {(session.user.email ?? "?").charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-ink">{session.user.email}</div>
          {createdAt && (
            <div className="text-xs text-slate-400">
              Konto od {new Date(createdAt).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })}
            </div>
          )}
        </div>
      </div>

      <div className="pe-card p-4">
        <h3 className="mb-1 text-sm font-semibold text-ink">Dane wykonawcy</h3>
        <p className="mb-3 text-xs text-slate-500">
          Używane w protokołach pomiarowych — wpisz raz, żeby nie przepisywać przy każdym zleceniu. Dane samego
          obiektu (adres, data pomiaru) wpisujesz osobno w zakładce Protokoły.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {WYKONAWCA_FIELDS.map(([k, label]) => (
            <label key={k} className="block">
              <div className="mb-1 text-xs text-slate-500">{label}</div>
              <input
                value={docHeader[k as keyof typeof docHeader] as string}
                onChange={(e) => setDocHeader({ [k]: e.target.value })}
                className="pe-input w-full text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="pe-card p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <KeyRound size={14} /> Zmiana hasła
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Nowe hasło</div>
            <input
              type="password"
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pe-input w-full text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Powtórz nowe hasło</div>
            <input
              type="password"
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pe-input w-full text-sm"
            />
          </label>
        </div>
        {err && <div className="mt-2 text-xs text-red-600">{err}</div>}
        {ok && (
          <div className="mt-2 flex items-center gap-1 text-xs" style={{ color: "#2C6B4A" }}>
            <Check size={13} /> Hasło zmienione.
          </div>
        )}
        <Button variant="copper" size="sm" className="mt-3" onClick={changePassword} disabled={busy || !newPassword}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          Zmień hasło
        </Button>
      </div>
    </div>
  );
}

/**
 * Potwierdzenie usunięcia konta. Osobne okno, a nie `confirm()` jak przy kasowaniu
 * projektów, bo skutek jest nieodwracalny i trzeba go WYPISAĆ — razem z tym, co
 * zostaje. Hasło jest tu bramką, nie formalnością: sesja bywa otwarta na cudzym
 * albo wspólnym komputerze, a wtedy samo kliknięcie to za mało.
 */
function UsunKontoDialog({ open, session, onClose, onUsuniete }: {
  open: boolean;
  session: Session;
  onClose: () => void;
  onUsuniete: () => void;
}) {
  const [haslo, setHaslo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open) {
      setHaslo("");
      setErr("");
    }
  }, [open]);

  async function usunKonto() {
    const email = session.user.email;
    if (!email) {
      setErr("Brak adresu e-mail w sesji — zaloguj się ponownie i spróbuj jeszcze raz.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // Logowanie pełni tu dwie role naraz: sprawdza hasło i daje ŚWIEŻY token.
      // Token z sesji mógł już wygasnąć, a wtedy kasowanie odbiłoby się o 401
      // dopiero po potwierdzeniu — w najgorszym możliwym momencie.
      const swieza = await supaSignIn(email, haslo);
      await supaDeleteAccount(swieza.access_token);
      onUsuniete();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(
        status === 400
          ? "Nieprawidłowe hasło."
          : e instanceof Error
            ? e.message
            : "Nie udało się usunąć konta."
      );
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Usuń konto na zawsze">
        <div className="space-y-4">
          <p className="text-sm font-medium text-red-600">Tej operacji nie da się cofnąć.</p>
          <div className="text-xs text-slate-600">
            <p className="mb-1">Bezpowrotnie znikną:</p>
            <ul className="mb-3 list-disc space-y-0.5 ps-5">
              <li>konto <span className="font-medium">{session.user.email}</span> — nie zalogujesz się nim ponownie,</li>
              <li>wszystkie projekty i zestawy protokołów zapisane w chmurze.</li>
            </ul>
            <p>
              Zostaje bieżący projekt w tej przeglądarce (autozapis lokalny). Jeśli chcesz zachować resztę pracy,
              najpierw zamknij to okno i pobierz kopię danych.
            </p>
          </div>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Aktualne hasło</div>
            <input
              type="password"
              value={haslo}
              onChange={(e) => setHaslo(e.target.value)}
              className="pe-input w-full text-sm"
              autoComplete="current-password"
            />
          </label>

          {err && <div className="text-xs text-red-600">{err}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Anuluj
            </Button>
            <Button variant="destructive" size="sm" onClick={usunKonto} disabled={busy || !haslo}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Usuń konto na zawsze
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UstawieniaTab({ session, onClose }: { session: Session; onClose: () => void }) {
  const getProjectPayload = useProjectStore((s) => s.getProjectPayload);
  const projectName = useProjectStore((s) => s.projectName);
  const setSession = useProjectStore((s) => s.setSession);
  const setCloudId = useProjectStore((s) => s.setCloudId);

  const [usuwanieOtwarte, setUsuwanieOtwarte] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  /** Ta sama kopia, co „Kopia zapasowa" w pasku projektu — jedna implementacja
   *  (`lib/kopiaProjektu.ts`), dwa wejścia. Tutaj zostaje, bo w ustawieniach konta ma
   *  wymowę RODO-wą („pobierz kopię swoich danych"); tam jest po to, żeby dało się
   *  zabezpieczyć pracę BEZ konta. Dwie kopie tego samego kodu rozjechałyby się przy
   *  pierwszej zmianie formatu pliku. */
  function exportData() {
    zapiszKopie(getProjectPayload(), projectName);
  }

  async function deleteAllCloudProjects() {
    if (!confirm("Usunąć WSZYSTKIE projekty zapisane w chmurze? Projekt otwarty teraz w tej przeglądarce zostanie — to kasuje tylko kopie w chmurze.")) {
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const items = await supaListProjects(session.token, session.user.id);
      for (const item of items) {
        await supaDeleteProject(session.token, item.id);
      }
      setMsg(items.length > 0 ? `Usunięto ${items.length} projektów z chmury.` : "Nie było żadnych projektów w chmurze.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Nie udało się usunąć projektów.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="pe-card p-4">
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Download size={14} /> Twoje dane
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Pobierz kopię bieżącego projektu (plan, elementy, ceny, protokoły) jako plik JSON — na wszelki wypadek albo
          do przeniesienia gdzie indziej.
        </p>
        <Button variant="ghost" size="sm" onClick={exportData}>
          <Download size={14} /> Pobierz kopię danych
        </Button>
      </div>

      <div className="pe-card p-4" style={{ borderColor: "#C6433A40" }}>
        <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-600">
          <AlertTriangle size={14} /> Strefa zagrożenia
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Usuwa TRWALE wszystkie projekty zapisane na Twoim koncie w chmurze. Projekt w tej przeglądarce (lokalny
          autozapis) nie jest ruszany — to dotyczy tylko kopii w chmurze.
        </p>
        {msg && (
          <div className="mb-2 flex items-center gap-1 text-xs" style={{ color: "#2C6B4A" }}>
            <Check size={13} /> {msg}
          </div>
        )}
        {err && <div className="mb-2 text-xs text-red-600">{err}</div>}
        <Button variant="destructive" size="sm" onClick={deleteAllCloudProjects} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Usuń wszystkie projekty z chmury
        </Button>

        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-xs text-slate-500">
            Usuwa całe konto razem ze wszystkim, co na nim zapisane. Nie da się tego cofnąć.
          </p>
          <Button variant="destructive" size="sm" onClick={() => setUsuwanieOtwarte(true)}>
            <Trash2 size={14} /> Usuń konto
          </Button>
        </div>
      </div>

      <UsunKontoDialog
        open={usuwanieOtwarte}
        session={session}
        onClose={() => setUsuwanieOtwarte(false)}
        onUsuniete={() => {
          setUsuwanieOtwarte(false);
          // `cloudId` MUSI zniknąć razem z sesją: wskazuje wiersz, którego już nie
          // ma, a zostawiony wskazywałby go dalej po zalogowaniu się na inne konto
          // w tej samej karcie — autozapis próbowałby nadpisywać cudzy/nieistniejący
          // zapis. Samo `setSession(null)` tego nie robi (patrz store: wylogowanie
          // celowo zachowuje `cloudId`).
          setCloudId(null);
          setSession(null);
          onClose();
        }}
      />
    </div>
  );
}

/** Panel konta: „Profil" (tożsamość, dane wykonawcy, hasło) i „Ustawienia" (dane i
 *  strefa zagrożenia) — dwie zakładki zamiast osobnych modali, bo to jedno miejsce
 *  „wszystko o moim koncie", tak jak w typowych panelach kont na innych stronach. */
export function AccountModal({ open, initialTab, session, onClose }: AccountModalProps) {
  const [tab, setTab] = useState<AccountModalTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Twoje konto" className="max-w-lg">
        <Tabs value={tab} onValueChange={(v) => setTab(v as AccountModalTab)}>
          <TabsList>
            <TabsTrigger value="profil">Profil</TabsTrigger>
            <TabsTrigger value="ustawienia">Ustawienia</TabsTrigger>
          </TabsList>
          <TabsContent value="profil">
            <ProfilTab session={session} />
          </TabsContent>
          <TabsContent value="ustawienia">
            <UstawieniaTab session={session} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
