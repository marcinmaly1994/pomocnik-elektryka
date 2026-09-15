import { useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supaUpdateUser } from "@/lib/supabase";

interface NoweHasloDialogProps {
  open: boolean;
  /** Token z linku w mailu — uprawnia do JEDNEJ zmiany hasła i niczego więcej. */
  token: string;
  onClose: () => void;
  onZmienione: () => void;
}

/**
 * Dokończenie resetu hasła po kliknięciu w link z maila.
 *
 * Supabase przy resecie NIE zmienia hasła — wystawia tylko tymczasowy token
 * uprawniający do jego zmiany i wkleja go w adres. Bez tego okna użytkownik
 * lądował na zwykłym ekranie startowym z ważnym tokenem w pasku adresu i bez
 * żadnego sposobu, by dokończyć to, po co przyszedł.
 *
 * Osobny komponent, a nie tryb w `AuthModal`: tam wszystko kręci się wokół pary
 * e-mail + hasło, a tutaj tożsamość jest już dowiedziona linkiem i pytamy
 * wyłącznie o nowe hasło.
 */
export function NoweHasloDialog({ open, token, onClose, onZmienione }: NoweHasloDialogProps) {
  const [haslo, setHaslo] = useState("");
  const [powtorz, setPowtorz] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function zapisz() {
    setErr("");
    // Ta sama para reguł co przy zmianie hasła w panelu konta — rozjazd między
    // tymi miejscami znaczyłby, że hasło przyjęte tu bywa odrzucane tam.
    if (haslo.length < 6) {
      setErr("Hasło musi mieć co najmniej 6 znaków.");
      return;
    }
    if (haslo !== powtorz) {
      setErr("Hasła nie są takie same.");
      return;
    }
    setBusy(true);
    try {
      await supaUpdateUser(token, { password: haslo });
      onZmienione();
    } catch (e) {
      const status = (e as { status?: number }).status;
      setErr(
        status === 401 || status === 403
          ? "Link wygasł lub został już użyty. Poproś o nowy."
          : e instanceof Error
            ? e.message
            : "Nie udało się zmienić hasła."
      );
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title="Ustaw nowe hasło">
        <div className="space-y-4">
          <p className="text-xs text-slate-500">
            Wpisz nowe hasło do swojego konta. Po zapisaniu zalogujesz się nim jak zwykle.
          </p>

          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Nowe hasło</div>
            <input
              type="password"
              minLength={6}
              value={haslo}
              onChange={(e) => setHaslo(e.target.value)}
              className="pe-input w-full text-sm"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs text-slate-500">Powtórz nowe hasło</div>
            <input
              type="password"
              minLength={6}
              value={powtorz}
              onChange={(e) => setPowtorz(e.target.value)}
              className="pe-input w-full text-sm"
              autoComplete="new-password"
            />
          </label>

          {err && <div className="text-xs text-red-600">{err}</div>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Anuluj
            </Button>
            <Button variant="copper" size="sm" onClick={zapisz} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Zapisz nowe hasło
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
