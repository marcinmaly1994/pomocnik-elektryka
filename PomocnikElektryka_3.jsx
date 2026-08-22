import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Zap, Home, GitBranch, FileSpreadsheet, Calculator, Plus, Trash2,
  Upload, Download, RotateCcw,
  Save, FolderOpen, Info, AlertTriangle, ChevronRight, ChevronDown, X,
  LogIn, LogOut, Cloud, CloudOff, Undo2, Redo2, ZoomIn, ZoomOut,
  MousePointer2, PenLine, Hand, Layers, Loader2, Pencil, Search, ClipboardCheck, Check,
} from "lucide-react";

/* =========================================================================
   pomocnikelektryka.pl
   Paleta „schemat kreślarski + miedź”:
   ink #16202B · blueprint #2D5A8C · copper #C1793F · paper #EEF1F4
   ========================================================================= */

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
  .pe-root{ background:#EEF1F4; color:#16202B; font-family:'Inter Tight', ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; min-height:100%; -webkit-font-smoothing:antialiased; }
  .pe-display{ font-family:'Inter Tight', ui-sans-serif, system-ui, sans-serif; font-weight:600; letter-spacing:-0.015em; }
  .pe-mono{ font-family:'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric:tabular-nums; letter-spacing:-0.01em; }
  .pe-card{ background:#fff; border:1px solid #DFE4E9; border-radius:7px; }
  .pe-nav-btn{ transition: color .15s ease, border-color .15s ease; border-bottom:2px solid transparent; font-weight:500; }
  .pe-nav-btn.active{ color:#C1793F; border-bottom:2px solid #C1793F; }
  .pe-nav-btn:not(.active):hover{ color:#2D5A8C; }
  .pe-btn-copper{ background:#C1793F; color:#fff; border-radius:6px; font-weight:500; transition:background .15s; }
  .pe-btn-copper:hover{ background:#A9652F; }
  .pe-btn-copper:disabled{ opacity:.5; cursor:not-allowed; }
  .pe-btn-ghost{ background:#fff; border:1px solid #DFE4E9; border-radius:6px; font-weight:500; transition:all .15s; }
  .pe-btn-ghost:hover{ border-color:#2D5A8C; color:#2D5A8C; }
  .pe-btn-ghost:disabled{ opacity:.4; cursor:not-allowed; }
  .pe-btn-ghost.active{ border-color:#C1793F; color:#C1793F; background:#C1793F0D; }
  .pe-input{ border:1px solid #DFE4E9; border-radius:5px; padding:6px 10px; background:#fff; }
  .pe-input:focus{ outline:2px solid #2D5A8C33; border-color:#2D5A8C; }
  .pe-grid-paper{
    background-color:#F7F9FB;
    background-image: linear-gradient(#E1E7EC 1px, transparent 1px), linear-gradient(90deg, #E1E7EC 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .pe-chip{ display:inline-flex; align-items:center; gap:4px; padding:2px 7px; border-radius:3px; font-size:10.5px; font-weight:600; letter-spacing:.01em; }
  .pe-tag-blue{ background:#2D5A8C0F; color:#2D5A8C; border:1px solid #2D5A8C26; }
  .pe-tag-copper{ background:#C1793F0F; color:#A9652F; border:1px solid #C1793F26; }
  .pe-tag-green{ background:#3B8C630F; color:#2C6B4A; border:1px solid #3B8C6326; }
  .pe-scroll::-webkit-scrollbar{ width:8px; height:8px; }
  .pe-scroll::-webkit-scrollbar-thumb{ background:#C7D0D9; border-radius:8px; }
  .pe-modal-backdrop{ position:fixed; inset:0; background:#16202Bcc; display:flex; align-items:center; justify-content:center; z-index:50; padding:16px; }
  .pe-tab-floor{ border-bottom:2px solid transparent; }
  .pe-tab-floor.active{ border-bottom:2px solid #2D5A8C; color:#2D5A8C; font-weight:600; }
  .pe-result{ background:#fff; border:1px solid #DFE4E9; border-top:2px solid #2D5A8C; border-radius:4px; }
  .pe-section-label{ font-size:10.5px; font-weight:700; letter-spacing:.07em; text-transform:uppercase; color:#8492A0; }
`;

/* =========================================================================
   SUPABASE — integracja przez REST (fetch), bez SDK.
   Działa identycznie w podglądzie jak i po wdrożeniu na własnej domenie.

   KONFIGURACJA (wymagana, aby włączyć konta i zapis w chmurze):
   1) Załóż darmowy projekt na supabase.com, włącz logowanie e-mail/hasło.
   2) Wklej adres projektu i klucz "anon/public" poniżej.
   3) Utwórz tabelę i zasady dostępu (SQL Editor w Supabase):

      create table public.projects (
        id uuid primary key default gen_random_uuid(),
        user_id uuid references auth.users not null,
        name text not null,
        data jsonb not null,
        updated_at timestamptz default now()
      );
      alter table public.projects enable row level security;
      create policy "użytkownik zarządza własnymi projektami"
        on public.projects for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);

   Bez konfiguracji aplikacja działa w pełni lokalnie (zapis w localStorage),
   tak jak poprzednio — nic się nie psuje.
   ========================================================================= */

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co"; // TODO: podmień
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";          // TODO: podmień

const SUPABASE_CONFIGURED =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  !SUPABASE_ANON_KEY.includes("YOUR-ANON");

async function sbFetch(path, { method = "GET", body, token } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      ...(method !== "GET" ? { Prefer: "return=representation" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error_description || data?.msg || data?.message || `Błąd ${res.status}`);
  return data;
}

const supaSignUp = (email, password) => sbFetch("/auth/v1/signup", { method: "POST", body: { email, password } });
const supaSignIn = (email, password) => sbFetch("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
const supaListProjects = (token, userId) => sbFetch(`/rest/v1/projects?user_id=eq.${userId}&select=id,name,updated_at&order=updated_at.desc`, { token });
const supaInsertProject = (token, row) => sbFetch(`/rest/v1/projects`, { method: "POST", body: row, token });
const supaUpdateProject = (token, id, row) => sbFetch(`/rest/v1/projects?id=eq.${id}`, { method: "PATCH", body: row, token });
const supaGetProject = (token, id) => sbFetch(`/rest/v1/projects?id=eq.${id}&select=*`, { token });
const supaDeleteProject = (token, id) => sbFetch(`/rest/v1/projects?id=eq.${id}`, { method: "DELETE", token });

/* ---------- element / cable dictionaries ---------- */

/* role decydują o tym, jak element trafia do obwodów i kosztorysu:
   socket = gniazdo 230V · socketWet = gniazdo w strefie mokrej/zewnętrznej · socket3f = odbiór 400V
   dedicated = własny obwód (AGD, duży odbiornik) · ev = ładowarka samochodu
   light = punkt oświetleniowy · blind = napęd rolety · control = osprzęt sterujący (bez własnego obwodu)
   lv = instalacja niskoprądowa (teletechnika) · infra = element rozdziału, nie odbiornik */
const ELEMENT_TYPES = {
  // — gniazda i zasilanie odbiorników —
  gniazdko:      { label: "Gniazdko 230V",        code: "G",   color: "#2D5A8C", role: "socket" },
  gniazdkoHerm:  { label: "Gniazdko hermetyczne", code: "IP",  color: "#2D5A8C", role: "socketWet" },
  gniazdko400:   { label: "Gniazdko 400V",        code: "3F",  color: "#1F4470", role: "socket3f" },
  wypustAGD:     { label: "Wypust AGD",           code: "AGD", color: "#1F4470", role: "dedicated" },
  ladowarkaEV:   { label: "Ładowarka EV",         code: "EV",  color: "#1F4470", role: "ev" },

  // — łączniki i sterowanie —
  wlacznik:         { label: "Włącznik",           code: "SW", color: "#3B8C63", role: "control" },
  wlacznikSchodowy: { label: "Włącznik schodowy",  code: "S",  color: "#3B8C63", role: "control" },
  sciemniacz:       { label: "Ściemniacz",         code: "DIM",color: "#3B8C63", role: "control" },
  czujnikRuchu:     { label: "Czujnik ruchu",      code: "PIR",color: "#3B8C63", role: "control" },

  // — oświetlenie —
  oswietlenie:    { label: "Punkt sufitowy",     code: "L",  color: "#C1793F", role: "light" },
  kinkiet:        { label: "Kinkiet ścienny",    code: "LK", color: "#C1793F", role: "light" },
  oswietlenieZewn:{ label: "Oświetlenie zewn.",  code: "LZ", color: "#C1793F", role: "light" },
  tasmaLed:       { label: "Taśma LED",          code: "LED",color: "#C1793F", role: "light" },

  // — rolety i klimat —
  roleta:    { label: "Roleta / napęd", code: "R",   color: "#7C5CBF", role: "blind" },
  wentylator:{ label: "Wentylator",     code: "WEN", color: "#7C5CBF", role: "light" },
  termostat: { label: "Termostat",      code: "T",   color: "#7C5CBF", role: "control" },

  // — teletechnika (niskoprądowa) —
  rj45:       { label: "Gniazdo RJ45",   code: "LAN", color: "#0F8A9E", role: "lv" },
  rtvsat:     { label: "Gniazdo RTV/SAT",code: "TV",  color: "#0F8A9E", role: "lv" },
  domofon:    { label: "Domofon",        code: "DOM", color: "#0F8A9E", role: "lv" },
  dzwonek:    { label: "Dzwonek",        code: "DZW", color: "#0F8A9E", role: "lv" },
  czujnikDymu:{ label: "Czujnik dymu",   code: "SD",  color: "#0F8A9E", role: "lv" },

  // — rozdział i infrastruktura —
  rozdzielnica: { label: "Rozdzielnica", code: "TG", color: "#16202B", role: "infra" },
  puszka:       { label: "Puszka rozgał.", code: "J", color: "#16202B", role: "infra" },

  // — wyposażenie sanitarne: nie jest elementem instalacji, wyznacza strefy ochronne w łazience —
  wanna:     { label: "Wanna",     code: "WAN", color: "#0F8A9E", role: "sanitary" },
  prysznic:  { label: "Prysznic",  code: "PRY", color: "#0F8A9E", role: "sanitary" },
  umywalka:  { label: "Umywalka",  code: "UMY", color: "#0F8A9E", role: "sanitary" },
};

/* Promienie stref ochronnych [m] liczone od środka urządzenia (uproszczenie rzutu 2D).
   Wg PN-HD 60364-7-701: strefa 1 obejmuje przestrzeń nad wanną/brodzikiem, strefa 2 sięga
   0,6 m poza strefę 1. Dla umywalki stosuje się praktyczną zasadę 0,6 m odstępu. */
const SANITARY_ZONES = {
  wanna:    { zone1: 0.65, zone2: 1.25, label: "wanna" },
  prysznic: { zone1: 0.65, zone2: 1.25, label: "prysznic" },
  umywalka: { zone1: 0,    zone2: 0.60, label: "umywalka" },
};

/* Sekcje biblioteki elementów. `variants` = liczba gniazd/klawiszy w ramce (tylko tam, gdzie ma to sens). */
const ELEMENT_SECTIONS = [
  {
    title: "Gniazda i zasilanie",
    items: [
      { key: "gniazdko", variants: [1, 2, 3, 4, 5, 6] },
      { key: "gniazdkoHerm", variants: [1, 2] },
      { key: "gniazdko400" },
      { key: "wypustAGD" },
      { key: "ladowarkaEV" },
    ],
  },
  {
    title: "Łączniki i sterowanie",
    items: [
      { key: "wlacznik", variants: [1, 2] },
      { key: "wlacznikSchodowy", variants: [1, 2] },
      { key: "sciemniacz" },
      { key: "czujnikRuchu" },
    ],
  },
  {
    title: "Oświetlenie",
    items: [
      { key: "oswietlenie" },
      { key: "kinkiet" },
      { key: "oswietlenieZewn" },
      { key: "tasmaLed" },
    ],
  },
  {
    title: "Rolety i klimat",
    items: [{ key: "roleta" }, { key: "wentylator" }, { key: "termostat" }],
  },
  {
    title: "Teletechnika",
    items: [{ key: "rj45" }, { key: "rtvsat" }, { key: "domofon" }, { key: "dzwonek" }, { key: "czujnikDymu" }],
  },
  {
    title: "Rozdział",
    items: [{ key: "rozdzielnica" }, { key: "puszka" }],
  },
  {
    title: "Wyposażenie sanitarne",
    items: [{ key: "wanna" }, { key: "prysznic" }, { key: "umywalka" }],
  },
];

/* szybki dostęp do wariantów danego typu */
const VARIANTS_FOR = {};
ELEMENT_SECTIONS.forEach((s) => s.items.forEach((i) => { if (i.variants) VARIANTS_FOR[i.key] = i.variants; }));

const LIB_SUBTITLES = {
  gniazdko: "230V · podtynkowe",
  gniazdkoHerm: "IP44 · łazienka, taras",
  gniazdko400: "siła · 3-fazowe",
  wypustAGD: "własny obwód",
  ladowarkaEV: "wallbox · własny obwód",
  wlacznik: "pojedynczy / podwójny",
  wlacznikSchodowy: "sterowanie z 2 miejsc",
  sciemniacz: "regulacja jasności",
  czujnikRuchu: "automatyka światła",
  oswietlenie: "punkt sufitowy",
  kinkiet: "oprawa ścienna",
  oswietlenieZewn: "elewacja, taras",
  tasmaLed: "listwa / podświetlenie",
  roleta: "napęd rolety",
  wentylator: "wywiew łazienkowy",
  termostat: "ogrzewanie podłogowe",
  rj45: "sieć komputerowa",
  rtvsat: "antena / satelita",
  domofon: "wideodomofon",
  dzwonek: "przycisk / gong",
  czujnikDymu: "detekcja pożaru",
  rozdzielnica: "tablica główna",
  puszka: "połączenia przewodów",
  wanna: "wyznacza strefy ochronne",
  prysznic: "wyznacza strefy ochronne",
  umywalka: "wymaga 0,6 m odstępu",
};

function libSubtitle(key, g) {
  const base = LIB_SUBTITLES[key] || "";
  if (VARIANTS_FOR[key] && g > 1) return key === "gniazdko" || key === "gniazdkoHerm" ? `${g}× w ramce` : `${g}× klawisze`;
  return base;
}

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const snap = (v, grid = 20) => Math.round(v / grid) * grid;
const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

/* Wykrywanie, w którym narysowanym pomieszczeniu (wielokącie) leży punkt — algorytm ray-casting. */
function pointInPolygon(pt, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, yi = points[i].y, xj = points[j].x, yj = points[j].y;
    const intersect = (yi > pt.y) !== (yj > pt.y) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

const NO_ROOM = "Bez pomieszczenia";
const ROOM_COLORS = ["#2D5A8C", "#C1793F", "#3B8C63", "#7C5CBF", "#0F8A9E", "#C6433A", "#B98C2F", "#5B6B7E"];

/* Pobieranie pliku. Dwie rzeczy są tu istotne:
   1) kotwica MUSI być wstawiona do dokumentu przed kliknięciem — klik na oderwanym elemencie
      bywa ignorowany (m.in. w osadzonych podglądach w ramkach),
   2) w środowiskach z ograniczeniami (sandbox iframe bez allow-downloads) pobieranie i tak może
      zostać zablokowane — wtedy otwieramy plik w nowej karcie, skąd da się go zapisać ręcznie.
   Zwraca true, jeśli udało się choć jedną drogą. */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  let ok = false;
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    ok = true;
  } catch (e) {
    ok = false;
  }
  if (!ok) {
    try { ok = !!window.open(url, "_blank"); } catch (e) { ok = false; }
  }
  // URL zwalniamy z opóźnieniem — natychmiastowe revoke potrafi przerwać rozpoczęte pobieranie
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return ok;
}

/* ---------- circuit generation (heuristic — patrz zastrzeżenie w UI) ---------- */

const roleOf = (e) => ELEMENT_TYPES[e.type]?.role;

/* ---------- SKALA PLANU ----------
   Bez kalibracji długości są tylko w abstrakcyjnych jednostkach planu. Po wskazaniu
   na rzucie odcinka o znanej długości znamy przelicznik metry/jednostkę i możemy
   podawać realne metry przewodów, powierzchnie pomieszczeń i promienie stref. */
const DEFAULT_SCALE = null; // brak kalibracji

function scaleOf(scales, floorId) {
  const v = scales?.[floorId];
  return typeof v === "number" && v > 0 ? v : null; // metrów na jednostkę planu
}
const unitsToM = (units, mpu) => (mpu ? units * mpu : null);
const mToUnits = (meters, mpu) => (mpu ? meters / mpu : null);

/* Pole wielokąta (wzór Gaussa) w jednostkach planu */
function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(a / 2);
}

/* ---------- STREFY OCHRONNE W ŁAZIENCE ----------
   Wyznaczane wokół wanny/prysznica/umywalki. Reprezentacja 2D jest uproszczeniem —
   norma opisuje strefy przestrzennie, z uwzględnieniem wysokości i przegród. */
function computeSanitaryZones(elements, floorId, mpu) {
  return elements
    .filter((e) => e.floor === floorId && roleOf(e) === "sanitary" && SANITARY_ZONES[e.type])
    .map((e) => {
      const z = SANITARY_ZONES[e.type];
      // bez kalibracji przyjmujemy poglądowy przelicznik, żeby strefy w ogóle było widać
      const fallback = 0.02; // ~2 cm na jednostkę planu
      const m = mpu || fallback;
      return {
        id: e.id, type: e.type, label: z.label, x: e.x, y: e.y,
        r1: z.zone1 / m, r2: z.zone2 / m, calibrated: !!mpu,
      };
    });
}

/* Które elementy elektryczne wolno umieścić w danej strefie */
const ZONE_ALLOWED = {
  gniazdkoHerm: true, oswietlenieZewn: true, wentylator: true, // sprzęt o podwyższonym IP
};

function checkSanitaryZones(elements, zones, floorId) {
  const issues = [];
  const electric = elements.filter((e) => e.floor === floorId && !["sanitary", "infra"].includes(roleOf(e)));

  electric.forEach((e) => {
    zones.forEach((z) => {
      const d = Math.hypot(e.x - z.x, e.y - z.y);
      const inZone1 = d <= z.r1;
      const inZone2 = !inZone1 && d <= z.r2;
      if (!inZone1 && !inZone2) return;

      const def = ELEMENT_TYPES[e.type];
      if (inZone1) {
        issues.push({
          level: "error", elId: e.id,
          title: `${def.label} w strefie 1 (${z.label})`,
          detail: "W strefie bezpośrednio nad wanną/brodzikiem nie wolno montować gniazd ani łączników. Dopuszczalne są wyłącznie oprawy i urządzenia o odpowiednim stopniu ochrony, zasilane bardzo niskim napięciem. Przesuń element dalej.",
        });
      } else if (!ZONE_ALLOWED[e.type]) {
        issues.push({
          level: e.type === "gniazdko" || e.type.startsWith("wlacznik") ? "error" : "warn",
          elId: e.id,
          title: `${def.label} w strefie 2 (${z.label})`,
          detail: "W strefie 2 dopuszcza się osprzęt o podwyższonym stopniu ochrony (min. IP44). Zamień na gniazdko hermetyczne albo przesuń element poza strefę.",
        });
      }
    });
  });
  return issues;
}

/* ---------- KONTROLA KOMPLETNOŚCI PROJEKTU ----------
   Reguły odpowiadają praktyce projektowej dla domu jednorodzinnego. Mają podpowiedzieć
   osobie nietechnicznej, czego zwykle się nie pomija — nie zastępują projektu. */
const ROOM_RULES = [
  {
    match: /kuchni/i, name: "Kuchnia",
    checks: [
      { need: (c) => c.sockets >= 6, level: "warn", msg: "Nad blatem kuchennym zaleca się co najmniej 6 gniazd — obecnie: {sockets}." },
      { need: (c) => c.dedicated >= 2, level: "warn", msg: "Duże AGD (piekarnik, płyta, zmywarka, lodówka) powinno mieć własne obwody — oznacz gniazda jako dedykowane lub użyj wypustów AGD. Obecnie dedykowanych: {dedicated}." },
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.switches >= 1, level: "error", msg: "Brak włącznika oświetlenia." },
    ],
  },
  {
    match: /łazien|lazien|prysznic|wc|toalet/i, name: "Łazienka",
    checks: [
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.switches >= 1, level: "error", msg: "Brak włącznika (montowany zwykle na zewnątrz pomieszczenia)." },
      { need: (c) => c.sockets === 0 || c.hermetic >= 1, level: "error", msg: "W łazience gniazda muszą mieć podwyższony stopień ochrony — użyj gniazdek hermetycznych zamiast zwykłych." },
      { need: (c) => c.fans >= 1, level: "warn", msg: "Brak wentylatora — w łazience bez okna wentylacja mechaniczna jest zwykle konieczna." },
      { need: (c) => c.sanitary >= 1, level: "info", msg: "Dodaj wannę lub prysznic, aby aplikacja sprawdziła strefy ochronne." },
    ],
  },
  {
    match: /salon|pokój dzienny|pokoj dzienny|living/i, name: "Salon",
    checks: [
      { need: (c) => c.sockets >= 6, level: "warn", msg: "W salonie zaleca się co najmniej 6 gniazd (RTV, sprzęt audio, ładowarki) — obecnie: {sockets}." },
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.switches >= 1, level: "error", msg: "Brak włącznika oświetlenia." },
      { need: (c) => c.lv >= 1, level: "info", msg: "Rozważ gniazdo RTV/SAT lub RJ45 przy miejscu na telewizor." },
    ],
  },
  {
    match: /sypialni|pokój|pokoj|gabinet/i, name: "Sypialnia / pokój",
    checks: [
      { need: (c) => c.sockets >= 4, level: "warn", msg: "Zaleca się min. 4 gniazda (po 2 przy każdej stronie łóżka / biurko) — obecnie: {sockets}." },
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.switches >= 1, level: "error", msg: "Brak włącznika oświetlenia." },
    ],
  },
  {
    match: /korytarz|hol|przedpok|klatk|schod/i, name: "Korytarz",
    checks: [
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.switches >= 2 || c.stairSwitches >= 1, level: "warn", msg: "W ciągach komunikacyjnych zaleca się sterowanie z dwóch miejsc (łączniki schodowe)." },
    ],
  },
  {
    match: /garaż|garaz|kotłow|kotlow|pralni|piwnic|gospodarcz/i, name: "Pomieszczenie techniczne",
    checks: [
      { need: (c) => c.lights >= 1, level: "error", msg: "Brak punktu oświetleniowego." },
      { need: (c) => c.sockets + c.hermetic >= 2, level: "warn", msg: "Zaleca się min. 2 gniazda — obecnie: {sockets}." },
      { need: (c) => c.hermetic >= 1 || c.sockets === 0, level: "info", msg: "W pomieszczeniach wilgotnych i zapylonych rozważ gniazda hermetyczne." },
    ],
  },
];

function roomStats(elements, roomName, floorId) {
  const inRoom = elements.filter((e) => e.room === roomName && (floorId === undefined || e.floor === floorId));
  const count = (pred) => inRoom.filter(pred).length;
  const gangSum = (type) => inRoom.filter((e) => e.type === type).reduce((a, e) => a + Math.max(1, e.gangs || 1), 0);
  return {
    sockets: gangSum("gniazdko"),
    hermetic: gangSum("gniazdkoHerm"),
    dedicated: count((e) => e.dedicated || e.type === "wypustAGD" || e.type === "gniazdko400"),
    lights: count((e) => roleOf(e) === "light" && e.type !== "wentylator"),
    switches: count((e) => e.type.startsWith("wlacznik") || e.type === "sciemniacz" || e.type === "czujnikRuchu"),
    stairSwitches: count((e) => e.type === "wlacznikSchodowy"),
    fans: count((e) => e.type === "wentylator"),
    lv: count((e) => roleOf(e) === "lv"),
    sanitary: count((e) => roleOf(e) === "sanitary"),
    total: inRoom.length,
  };
}

function checkCompleteness(elements, roomShapes, floors) {
  const issues = [];
  const roomNames = Array.from(new Set([
    ...roomShapes.map((r) => r.name),
    ...elements.map((e) => e.room),
  ])).filter((n) => n && n !== NO_ROOM);

  roomNames.forEach((name) => {
    const rule = ROOM_RULES.find((r) => r.match.test(name));
    const c = roomStats(elements, name);
    if (c.total === 0 && !roomShapes.some((r) => r.name === name)) return;

    if (!rule) {
      // pomieszczenie bez dopasowanej reguły — sprawdzamy tylko podstawy
      if (c.lights === 0) issues.push({ room: name, level: "warn", msg: "Brak punktu oświetleniowego." });
      else if (c.switches === 0) issues.push({ room: name, level: "warn", msg: "Brak włącznika oświetlenia." });
      return;
    }
    rule.checks.forEach((chk) => {
      if (!chk.need(c)) {
        issues.push({
          room: name, level: chk.level,
          msg: chk.msg.replace("{sockets}", c.sockets + c.hermetic).replace("{dedicated}", c.dedicated),
        });
      }
    });
  });

  // sprawdzenia obejmujące cały projekt
  const all = roomStats(elements, undefined);
  if (!elements.some((e) => e.type === "rozdzielnica")) {
    issues.push({ room: "Cały projekt", level: "error", msg: "Brak rozdzielnicy na planie — bez niej nie da się poprowadzić przewodów ani policzyć ich długości." });
  }
  if (!elements.some((e) => e.type === "czujnikDymu")) {
    issues.push({ room: "Cały projekt", level: "info", msg: "Rozważ czujniki dymu — w nowym budownictwie są wymagane w wielu przypadkach." });
  }
  const orphanLights = elements.filter((e) => roleOf(e) === "light" && e.room === NO_ROOM).length;
  if (orphanLights > 0) {
    issues.push({ room: "Cały projekt", level: "warn", msg: `${orphanLights} elementów leży poza narysowanymi pomieszczeniami — narysuj pomieszczenia, aby kontrola działała dokładniej.` });
  }
  return issues;
}

function computeCircuits(elements) {
  const circuits = [];
  let n = 1;
  const wetRooms = ["Kuchnia", "Łazienka", "Pralnia", "Kotłownia"];
  const add = (c) => circuits.push({ id: "obw" + n++, ...c });

  // --- odbiorniki wymagające własnego obwodu ---
  elements.filter((e) => roleOf(e) === "ev").forEach((e) => {
    add({ name: `Ładowarka EV — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x4 mm²", breaker: "C25 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket3f").forEach((e) => {
    add({ name: `Gniazdo 400V — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 5x2,5 mm²", breaker: "C16 3-faz.", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "dedicated").forEach((e) => {
    add({ name: `Wypust AGD — ${e.room}`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  elements.filter((e) => roleOf(e) === "socket" && e.dedicated).forEach((e) => {
    add({ name: `Obwód dedykowany — ${e.room} (${e.note || "odbiornik AGD"})`, type: "gniazdko", elements: [e], cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  // --- gniazda hermetyczne: zawsze osobno, z własną ochroną różnicowoprądową ---
  const herm = elements.filter((e) => roleOf(e) === "socketWet" && !e.dedicated);
  chunk(herm, 6).forEach((g, i) => {
    add({ name: `Gniazda hermetyczne ${i + 1}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  // --- zwykłe gniazda 230V: mokre pomieszczenia osobno, reszta zbiorczo ---
  const regular = elements.filter((e) => roleOf(e) === "socket" && !e.dedicated);
  const byRoom = {};
  regular.filter((e) => wetRooms.includes(e.room)).forEach((e) => { (byRoom[e.room] ||= []).push(e); });
  Object.entries(byRoom).forEach(([room, list]) => {
    chunk(list, 6).forEach((g, i) => {
      add({ name: `Obwód gniazd — ${room}${i ? " " + (i + 1) : ""}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
    });
  });
  chunk(regular.filter((e) => !wetRooms.includes(e.room)), 8).forEach((g, i) => {
    add({ name: `Obwód gniazd ogólnych ${i + 1}`, type: "gniazdko", elements: g, cable: "YDYp 3x2,5 mm²", breaker: "B16", rcd: true });
  });

  // --- oświetlenie: zewnętrzne osobno (inne warunki środowiskowe), wnętrze zbiorczo ---
  const lightsOut = elements.filter((e) => e.type === "oswietlenieZewn");
  chunk(lightsOut, 8).forEach((g, i) => {
    add({ name: `Oświetlenie zewnętrzne ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });
  const lightsIn = elements.filter((e) => roleOf(e) === "light" && e.type !== "oswietlenieZewn");
  chunk(lightsIn, 10).forEach((g, i) => {
    add({ name: `Obwód oświetlenia ${i + 1}`, type: "oswietlenie", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  // --- rolety ---
  chunk(elements.filter((e) => roleOf(e) === "blind"), 8).forEach((g, i) => {
    add({ name: `Obwód rolet ${i + 1}`, type: "roleta", elements: g, cable: "YDYp 3x1,5 mm²", breaker: "B10", rcd: true });
  });

  // Uwaga: elementy sterujące (łączniki, czujniki, termostaty) nie tworzą własnych obwodów —
  // są częścią obwodów, którymi sterują. Teletechnika (LAN/RTV/domofon) to instalacja
  // niskoprądowa prowadzona poza rozdzielnicą 230V, więc również nie generuje zabezpieczeń.
  return circuits.filter((c) => c.elements.length > 0);
}

/* Elementy niskoprądowe — zestawienie poza rozdzielnicą 230V */
function computeLowVoltage(elements) {
  const lv = elements.filter((e) => roleOf(e) === "lv");
  const byType = {};
  lv.forEach((e) => { (byType[e.type] ||= []).push(e); });
  return Object.entries(byType).map(([type, list]) => ({ type, label: ELEMENT_TYPES[type].label, count: list.length }));
}

function computeRcdGroups(circuits) {
  const groups = [];
  for (let i = 0; i < circuits.length; i += 6) {
    groups.push({ id: "rcd" + (groups.length + 1), rating: "40A/30mA", circuits: circuits.slice(i, i + 6) });
  }
  return groups;
}

function mainBreakerFor(circuitCount) {
  if (circuitCount <= 6) return "B25";
  if (circuitCount <= 12) return "B32";
  return "B40";
}

/* ---------- prowadzenie przewodów (trasowanie) ----------
   Zasady odwzorowujące praktykę instalacyjną:
   - punktem startowym każdego obwodu jest rozdzielnica (element typu "rozdzielnica"),
   - w obrębie obwodu odbiorniki łączy się szeregowo (loop-in) — kolejny punkt jest
     najbliższy poprzedniemu, a nie każdy osobno od rozdzielnicy (oszczędza przewód),
   - trasy prowadzone są ortogonalnie (poziom/pion), bo przewody układa się wzdłuż ścian
     i stropów pod kątem prostym, nie po skosie,
   - obwody oświetlenia schodzą od stropu (najpierw pion, potem poziom), a obwody gniazd
     prowadzi się na wysokości gniazd (najpierw poziom, potem pion).
   Trasy są poglądowe — nie uwzględniają rzeczywistego przebiegu bruzd ani otworów w ścianach. */

const ROUTE_MARGIN = 26; // odsunięcie trasy od punktu, żeby nie zlewała się z symbolem

function orthPath(a, b, mode) {
  // mode: "HV" = najpierw poziomo, potem pionowo; "VH" = odwrotnie
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) return [a, b]; // już prosto
  const corner = mode === "VH" ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
  return [a, corner, b];
}

function pathLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.abs(points[i].x - points[i - 1].x) + Math.abs(points[i].y - points[i - 1].y);
  }
  return len;
}

function computeCableRoutes(elements, circuits) {
  const routes = [];
  const panels = elements.filter((e) => e.type === "rozdzielnica");
  if (panels.length === 0) return routes; // bez rozdzielnicy na planie nie ma od czego prowadzić

  circuits.forEach((c) => {
    // odbiorniki obwodu grupujemy wg kondygnacji — każda ma własne odejście z rozdzielnicy
    const byFloor = {};
    c.elements.forEach((e) => { (byFloor[e.floor] ||= []).push(e); });

    Object.entries(byFloor).forEach(([floor, pts]) => {
      // rozdzielnica na tej kondygnacji, a jeśli jej nie ma — główna (pierwsza)
      const panel = panels.find((p) => p.floor === floor) || panels[0];
      const mode = c.type === "oswietlenie" ? "VH" : "HV";

      // łańcuch: zawsze przechodzimy do najbliższego jeszcze niepodłączonego punktu
      const remaining = [...pts];
      let cursor = { x: panel.x, y: panel.y };
      const segments = [];
      while (remaining.length) {
        let bestIdx = 0, bestDist = Infinity;
        remaining.forEach((e, i) => {
          const d = Math.abs(e.x - cursor.x) + Math.abs(e.y - cursor.y); // odległość ortogonalna
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        });
        const next = remaining.splice(bestIdx, 1)[0];
        segments.push(orthPath(cursor, { x: next.x, y: next.y }, mode));
        cursor = { x: next.x, y: next.y };
      }

      const points = segments.reduce((acc, seg, i) => acc.concat(i === 0 ? seg : seg.slice(1)), []);
      routes.push({
        id: `${c.id}-${floor}`, circuitId: c.id, circuitName: c.name, type: c.type,
        cable: c.cable, breaker: c.breaker, floor, points, lengthUnits: pathLength(points),
      });
    });
  });

  return routes;
}

/* ---------- cost estimation ---------- */

const DEFAULT_PRICES = {
  gniazdko: 15, gniazdkoHerm: 25, gniazdko400: 45, wypustAGD: 8, ladowarkaEV: 0,
  wlacznik: 15, wlacznikSchodowy: 18, sciemniacz: 60, czujnikRuchu: 45,
  oprawa: 0, tasmaLed: 25, wentylator: 90,
  napedRolety: 0, termostat: 120,
  rj45: 20, rtvsat: 20, domofon: 0, dzwonek: 30, czujnikDymu: 55,
  puszkaPodtynkowa: 2, puszkaRozgalezna: 5,
  kabel15: 2.5, kabel25: 3.5, kabel4: 6, kabelLan: 2, kabelKoncentryk: 2,
  mcb: 15, mcb3f: 45, rcd: 90, glowny: 60, rozdzielnica: 130, robocizna: 0,
};

const PRICE_LABELS = {
  gniazdko: "Gniazdko 230V podtynkowe (szt.)",
  gniazdkoHerm: "Gniazdko hermetyczne IP44 (szt.)",
  gniazdko400: "Gniazdo 400V / siłowe (szt.)",
  wypustAGD: "Wypust zasilający AGD (szt.)",
  ladowarkaEV: "Ładowarka EV / wallbox (szt., opcjonalnie)",
  wlacznik: "Włącznik / łącznik (szt.)",
  wlacznikSchodowy: "Łącznik schodowy (szt.)",
  sciemniacz: "Ściemniacz (szt.)",
  czujnikRuchu: "Czujnik ruchu (szt.)",
  oprawa: "Oprawa oświetleniowa (szt., opcjonalnie)",
  tasmaLed: "Taśma LED z zasilaczem (kpl.)",
  wentylator: "Wentylator łazienkowy (szt.)",
  napedRolety: "Napęd rolety (szt., opcjonalnie)",
  termostat: "Termostat / regulator (szt.)",
  rj45: "Gniazdo RJ45 (szt.)",
  rtvsat: "Gniazdo RTV/SAT (szt.)",
  domofon: "Domofon / wideodomofon (kpl., opcjonalnie)",
  dzwonek: "Dzwonek z przyciskiem (kpl.)",
  czujnikDymu: "Czujnik dymu (szt.)",
  puszkaPodtynkowa: "Puszka podtynkowa (szt.)",
  puszkaRozgalezna: "Puszka rozgałęźna (szt.)",
  kabel15: "Przewód YDYp 3×1,5 mm² (mb)",
  kabel25: "Przewód YDYp 3×2,5 mm² (mb)",
  kabel4: "Przewód YDYp 5×2,5 / 5×4 mm² (mb)",
  kabelLan: "Przewód UTP kat. 6 (mb)",
  kabelKoncentryk: "Przewód koncentryczny RG-6 (mb)",
  mcb: "Wyłącznik nadprądowy 1-faz. B10/16 (szt.)",
  mcb3f: "Wyłącznik nadprądowy 3-faz. C16/C25 (szt.)",
  rcd: "Wyłącznik różnicowoprądowy 30mA (szt.)",
  glowny: "Wyłącznik główny (szt.)",
  rozdzielnica: "Obudowa rozdzielnicy (szt.)",
  robocizna: "Robocizna za punkt instalacyjny (szt., opcjonalnie)",
};

/* mapowanie typu elementu na pozycję cennika (elementy bez wpisu liczone są tylko jako punkt instalacyjny) */
const TYPE_TO_PRICE_KEY = {
  gniazdko: "gniazdko", gniazdkoHerm: "gniazdkoHerm", gniazdko400: "gniazdko400",
  wypustAGD: "wypustAGD", ladowarkaEV: "ladowarkaEV",
  wlacznik: "wlacznik", wlacznikSchodowy: "wlacznikSchodowy",
  sciemniacz: "sciemniacz", czujnikRuchu: "czujnikRuchu",
  oswietlenie: "oprawa", kinkiet: "oprawa", oswietlenieZewn: "oprawa", tasmaLed: "tasmaLed",
  roleta: "napedRolety", wentylator: "wentylator", termostat: "termostat",
  rj45: "rj45", rtvsat: "rtvsat", domofon: "domofon", dzwonek: "dzwonek", czujnikDymu: "czujnikDymu",
  puszka: "puszkaRozgalezna", rozdzielnica: "rozdzielnica",
};

function computeCosts(elements, circuits, rcdGroups) {
  const q = {};
  Object.keys(PRICE_LABELS).forEach((k) => { q[k] = 0; });

  elements.forEach((e) => {
    const key = TYPE_TO_PRICE_KEY[e.type];
    // gniazda/łączniki wielokrotne liczymy wg liczby mechanizmów w ramce
    const count = (e.type === "gniazdko" || e.type === "gniazdkoHerm" || e.type === "wlacznik" || e.type === "wlacznikSchodowy")
      ? Math.max(1, e.gangs || 1) : 1;
    if (key) q[key] += count;
  });

  // punkty instalacyjne wymagające puszki podtynkowej (bez rozdzielnicy i puszek rozgałęźnych)
  const pointElements = elements.filter((e) => !["rozdzielnica", "puszka"].includes(e.type) && ELEMENT_TYPES[e.type]?.role !== "sanitary");
  const rooms = new Set(elements.map((e) => e.room)).size || 1;
  q.puszkaPodtynkowa = pointElements.length;
  // puszki rozgałęźne: postawione ręcznie + minimum jedna na pomieszczenie
  q.puszkaRozgalezna = Math.max(q.puszkaRozgalezna, rooms);
  q.robocizna = pointElements.length;

  let kabel15 = 0, kabel25 = 0, kabel4 = 0;
  circuits.forEach((c) => {
    const len = c.elements.length * 5 + 10; // szacunek: 5 mb na punkt + 10 mb do rozdzielnicy
    if (c.cable.includes("1,5")) kabel15 += len;
    else if (c.cable.includes("5x2,5") || c.cable.includes("5x4")) kabel4 += len;
    else kabel25 += len;
  });
  q.kabel15 = Math.round(kabel15);
  q.kabel25 = Math.round(kabel25);
  q.kabel4 = Math.round(kabel4);

  // przewody niskoprądowe — szacunek 15 mb na punkt (trasa do szafki/RTV)
  q.kabelLan = (q.rj45 + q.domofon) * 15;
  q.kabelKoncentryk = q.rtvsat * 15;

  const threePhase = circuits.filter((c) => c.breaker.includes("3-faz.")).length;
  q.mcb3f = threePhase;
  q.mcb = circuits.length - threePhase;
  q.rcd = rcdGroups.length;
  q.glowny = circuits.length ? 1 : 0;
  q.rozdzielnica = Math.max(q.rozdzielnica, circuits.length ? 1 : 0);

  return { quantities: q };
}

/* =========================================================================
   HISTORIA (cofnij / ponów) — wspólna dla elementów i ścian
   ========================================================================= */

function useHistory(initial) {
  const [state, setStateRaw] = useState(initial);
  const past = useRef([]);
  const future = useRef([]);

  const set = useCallback((updater, opts = {}) => {
    const commit = opts.commit !== false;
    setStateRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (commit) { past.current.push(prev); future.current = []; }
      return next;
    });
  }, []);

  const commitSnapshot = useCallback((snapshot) => {
    past.current.push(snapshot);
    future.current = [];
  }, []);

  const undo = useCallback(() => {
    setStateRaw((prev) => {
      if (past.current.length === 0) return prev;
      const p = past.current.pop();
      future.current.push(prev);
      return p;
    });
  }, []);

  const redo = useCallback(() => {
    setStateRaw((prev) => {
      if (future.current.length === 0) return prev;
      const f = future.current.pop();
      past.current.push(prev);
      return f;
    });
  }, []);

  const replace = useCallback((newState) => {
    past.current = []; future.current = [];
    setStateRaw(newState);
  }, []);

  return {
    state, set, commitSnapshot, undo, redo, replace,
    canUndo: past.current.length > 0, canRedo: future.current.length > 0,
  };
}

/* =========================================================================
   APP
   ========================================================================= */

const TABS = [
  { id: "kalkulatory", label: "Kalkulatory", icon: Calculator },
  { id: "protokoly", label: "Protokoły pomiarowe", icon: ClipboardCheck },
  { id: "projekt", label: "Zaprojektuj instalację", icon: Home },
  { id: "rozdzielnica", label: "Rozdzielnica elektryczna", icon: Zap },
  { id: "schemat", label: "Schemat instalacji", icon: GitBranch },
  { id: "kosztorys", label: "Kosztorys", icon: FileSpreadsheet },
];

const STORAGE_KEY = "pomocnikelektryka_projekt_v2";
const SESSION_KEY = "pomocnikelektryka_sesja";

export default function App() {
  const [tab, setTab] = useState("projekt");
  const history = useHistory({ elements: [], walls: [], roomShapes: [] });
  const [floors, setFloors] = useState([{ id: "f1", name: "Parter" }]);
  const [activeFloor, setActiveFloor] = useState("f1");
  const [bgImages, setBgImages] = useState({}); // { [floorId]: dataURL }
  const [scales, setScales] = useState({});     // { [floorId]: metrów na jednostkę planu }
  const [prices, setPrices] = useState(DEFAULT_PRICES);
  const [protoHeader, setProtoHeader] = useState(EMPTY_HEADER);
  const [protocols, setProtocols] = useState({});
  const [projectName, setProjectName] = useState("Mój dom");
  const [loaded, setLoaded] = useState(false);
  const [lastSaved, setLastSaved] = useState(null); // "local" | "cloud"

  // --- konto / chmura ---
  const [session, setSession] = useState(null); // { token, user }
  const [authOpen, setAuthOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [cloudId, setCloudId] = useState(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMsg, setCloudMsg] = useState("");

  // wczytanie lokalnego szkicu + sesji przy starcie
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        history.replace({ elements: data.elements || [], walls: data.walls || [], roomShapes: data.roomShapes || [] });
        if (data.prices) setPrices(data.prices);
        if (data.protoHeader) setProtoHeader({ ...EMPTY_HEADER, ...data.protoHeader });
        if (data.protocols) setProtocols(data.protocols);
        if (data.projectName) setProjectName(data.projectName);
        if (data.bgImages) setBgImages(data.bgImages);
        if (data.scales) setScales(data.scales);
        if (data.floors?.length) setFloors(data.floors);
        if (data.activeFloor) setActiveFloor(data.activeFloor);
        if (data.cloudId) setCloudId(data.cloudId);
      }
      const rawSession = localStorage.getItem(SESSION_KEY);
      if (rawSession) setSession(JSON.parse(rawSession));
    } catch (e) { /* uszkodzone dane lokalne — ignorujemy */ }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const elements = history.state.elements;
  const walls = history.state.walls;
  const roomShapes = history.state.roomShapes;

  // autozapis lokalny
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        elements, walls, roomShapes, prices, protoHeader, protocols, projectName, bgImages, scales, floors, activeFloor, cloudId,
      }));
      setLastSaved("local");
    } catch (e) { /* limit przeglądarki — praca trwa nadal w tej sesji */ }
  }, [elements, walls, roomShapes, prices, protoHeader, protocols, projectName, bgImages, scales, floors, activeFloor, cloudId, loaded]);

  // skróty klawiszowe cofnij/ponów
  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); history.undo(); }
      if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); history.redo(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const circuits = useMemo(() => computeCircuits(elements), [elements]);
  const rcdGroups = useMemo(() => computeRcdGroups(circuits), [circuits]);
  const costs = useMemo(() => computeCosts(elements, circuits, rcdGroups), [elements, circuits, rcdGroups]);
  const lowVoltage = useMemo(() => computeLowVoltage(elements), [elements]);
  const cableRoutes = useMemo(() => computeCableRoutes(elements, circuits), [elements, circuits]);

  function resetProject() {
    if (!confirm("Wyczyścić bieżący projekt (elementy, ściany, plan i ceny wrócą do domyślnych)?")) return;
    history.replace({ elements: [], walls: [], roomShapes: [] });
    setBgImages({}); setScales({}); setPrices(DEFAULT_PRICES); setFloors([{ id: "f1", name: "Parter" }]);
    setProtoHeader(EMPTY_HEADER); setProtocols({});
    setActiveFloor("f1"); setCloudId(null);
  }

  function persistSession(s) {
    setSession(s);
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function signOut() { persistSession(null); setCloudMsg(""); }

  async function saveToCloud() {
    if (!session) { setAuthOpen(true); return; }
    setCloudBusy(true); setCloudMsg("");
    try {
      const payload = { elements, walls, roomShapes, prices, protoHeader, protocols, projectName, bgImages, scales, floors, activeFloor };
      if (cloudId) {
        await supaUpdateProject(session.token, cloudId, { name: projectName, data: payload, updated_at: new Date().toISOString() });
      } else {
        const [row] = await supaInsertProject(session.token, { user_id: session.user.id, name: projectName, data: payload });
        setCloudId(row.id);
      }
      setLastSaved("cloud");
      setCloudMsg("Zapisano w chmurze.");
    } catch (e) {
      setCloudMsg("Nie udało się zapisać: " + e.message);
    } finally {
      setCloudBusy(false);
    }
  }

  async function loadCloudProject(id) {
    if (!session) return;
    setCloudBusy(true); setCloudMsg("");
    try {
      const [row] = await supaGetProject(session.token, id);
      if (!row) throw new Error("Nie znaleziono projektu");
      const d = row.data || {};
      history.replace({ elements: d.elements || [], walls: d.walls || [], roomShapes: d.roomShapes || [] });
      setPrices(d.prices || DEFAULT_PRICES);
      setProtoHeader({ ...EMPTY_HEADER, ...(d.protoHeader || {}) });
      setProtocols(d.protocols || {});
      setProjectName(row.name || "Projekt");
      setBgImages(d.bgImages || {});
      setScales(d.scales || {});
      setFloors(d.floors?.length ? d.floors : [{ id: "f1", name: "Parter" }]);
      setActiveFloor(d.activeFloor || "f1");
      setCloudId(row.id);
      setProjectsOpen(false);
    } catch (e) {
      setCloudMsg("Nie udało się wczytać: " + e.message);
    } finally {
      setCloudBusy(false);
    }
  }

  return (
    <div className="pe-root">
      <style>{CSS}</style>

      <header className="border-b" style={{ borderColor: "#DCE2E8", background: "#16202B" }}>
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ background: "#C1793F" }}>
              <Zap size={18} color="#fff" />
            </div>
            <div>
              <div className="pe-display text-white text-lg leading-none">pomocnikelektryka<span style={{ color: "#C1793F" }}>.pl</span></div>
              <div className="text-[11px] text-slate-400 leading-none mt-1">projektowanie instalacji elektrycznej dla domu jednorodzinnego</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="pe-input text-sm w-40 hidden sm:block"
              style={{ background: "#1F2A38", borderColor: "#33404F", color: "#fff" }}
            />
            <span className="text-[11px] text-slate-400 hidden md:flex items-center gap-1">
              {lastSaved === "cloud" ? <><Cloud size={13} /> zapisano w chmurze</> : lastSaved === "local" ? <><Save size={13} /> zapisano lokalnie</> : null}
            </span>

            {SUPABASE_CONFIGURED ? (
              session ? (
                <>
                  <button onClick={() => setProjectsOpen(true)} className="pe-btn-ghost px-3 py-1.5 text-sm flex items-center gap-1.5" style={{ background: "#1F2A38", borderColor: "#33404F", color: "#E6EAEE" }}>
                    <FolderOpen size={14} /> Moje projekty
                  </button>
                  <button onClick={saveToCloud} disabled={cloudBusy} className="pe-btn-copper px-3 py-1.5 text-sm flex items-center gap-1.5">
                    {cloudBusy ? <Loader2 size={14} className="animate-spin" /> : <Cloud size={14} />} Zapisz w chmurze
                  </button>
                  <button onClick={signOut} title={session.user?.email} className="pe-btn-ghost px-2.5 py-1.5 text-sm flex items-center gap-1.5" style={{ background: "#1F2A38", borderColor: "#33404F", color: "#E6EAEE" }}>
                    <LogOut size={14} />
                  </button>
                </>
              ) : (
                <button onClick={() => setAuthOpen(true)} className="pe-btn-copper px-3 py-1.5 text-sm flex items-center gap-1.5">
                  <LogIn size={14} /> Zaloguj / załóż konto
                </button>
              )
            ) : (
              <span className="pe-chip" style={{ background: "#1F2A38", color: "#8A97A5" }}>
                <CloudOff size={12} /> tryb lokalny
              </span>
            )}

            <button onClick={resetProject} className="pe-btn-ghost px-3 py-1.5 text-sm flex items-center gap-1.5" style={{ background: "#1F2A38", borderColor: "#33404F", color: "#E6EAEE" }}>
              <RotateCcw size={14} /> Nowy projekt
            </button>
          </div>
        </div>

        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto pe-scroll">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`pe-nav-btn flex items-center gap-1.5 px-3 py-2 text-[13px] whitespace-nowrap ${tab === t.id ? "active" : "text-slate-300"}`}>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {tab === "kalkulatory" && <CalculatorsTab />}
        {tab === "protokoly" && (
          <ProtocolsTab header={protoHeader} setHeader={setProtoHeader} protocols={protocols} setProtocols={setProtocols} />
        )}
        {tab === "projekt" && (
          <DesignTab
            elements={elements} walls={walls} roomShapes={roomShapes} setDraft={history.set} commitSnapshot={history.commitSnapshot}
            draft={history.state} undo={history.undo} redo={history.redo} canUndo={history.canUndo} canRedo={history.canRedo}
            floors={floors} setFloors={setFloors} activeFloor={activeFloor} setActiveFloor={setActiveFloor}
            bgImages={bgImages} setBgImages={setBgImages} scales={scales} setScales={setScales}
            circuits={circuits} cableRoutes={cableRoutes} goTo={setTab}
          />
        )}
        {tab === "rozdzielnica" && <PanelTab circuits={circuits} rcdGroups={rcdGroups} lowVoltage={lowVoltage} docHeader={protoHeader} goTo={setTab} />}
        {tab === "schemat" && <SchemaTab circuits={circuits} rcdGroups={rcdGroups} goTo={setTab} />}
        {tab === "kosztorys" && <CostTab costs={costs} prices={prices} setPrices={setPrices} />}
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-8 pt-2 text-xs text-slate-500">
        Narzędzie ma charakter poglądowy i wspomagający projektowanie. Dobór przewodów, zabezpieczeń i rozdzielnicy
        wymaga zawsze weryfikacji i zatwierdzenia przez osobę z uprawnieniami elektrycznymi, zgodnie z obowiązującymi
        normami (m.in. PN-HD 60364). Bez konfiguracji konta dane trzymane są wyłącznie lokalnie w Twojej przeglądarce.
      </footer>

      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSignedIn={(s) => { persistSession(s); setAuthOpen(false); }}
        />
      )}
      {projectsOpen && session && (
        <ProjectsModal
          session={session}
          onClose={() => setProjectsOpen(false)}
          onLoad={loadCloudProject}
          busyMsg={cloudMsg}
        />
      )}
    </div>
  );
}

/* =========================================================================
   MODAL: LOGOWANIE / REJESTRACJA
   ========================================================================= */

function Modal({ title, onClose, children, width = 420 }) {
  return (
    <div className="pe-modal-backdrop" onClick={onClose}>
      <div className="pe-card p-5" style={{ width, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="pe-display text-base">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthModal({ onClose, onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    try {
      if (mode === "login") {
        const r = await supaSignIn(email, password);
        onSignedIn({ token: r.access_token, user: r.user });
      } else {
        const r = await supaSignUp(email, password);
        if (r.access_token) {
          onSignedIn({ token: r.access_token, user: r.user });
        } else {
          setErr("Konto utworzone. Sprawdź e-mail, aby potwierdzić rejestrację, a następnie zaloguj się.");
          setMode("login");
        }
      }
    } catch (e2) {
      setErr(e2.message || "Wystąpił błąd.");
    } finally {
      setBusy(false);
    }
  }

  function onEnter(e) { if (e.key === "Enter" && email && password.length >= 6 && !busy) submit(); }

  return (
    <Modal title={mode === "login" ? "Zaloguj się" : "Załóż konto"} onClose={onClose}>
      {!SUPABASE_CONFIGURED && (
        <div className="text-xs p-2.5 rounded-md mb-3 flex gap-2" style={{ background: "#C6433A1A", color: "#A2352C" }}>
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          Backend nie jest jeszcze skonfigurowany (uzupełnij SUPABASE_URL i SUPABASE_ANON_KEY w kodzie), więc logowanie się nie powiedzie.
        </div>
      )}
      <div className="space-y-3">
        <label className="block">
          <div className="text-xs text-slate-500 mb-1">E-mail</div>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={onEnter} className="pe-input text-sm w-full" />
        </label>
        <label className="block">
          <div className="text-xs text-slate-500 mb-1">Hasło</div>
          <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={onEnter} className="pe-input text-sm w-full" />
        </label>
        {err && <div className="text-xs text-red-600">{err}</div>}
        <button type="button" onClick={submit} disabled={busy || !email || password.length < 6} className="pe-btn-copper w-full text-sm py-2 flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
          {mode === "login" ? "Zaloguj się" : "Załóż konto"}
        </button>
      </div>
      <button onClick={() => setMode(mode === "login" ? "register" : "login")} className="text-xs text-slate-500 hover:underline mt-3">
        {mode === "login" ? "Nie masz konta? Zarejestruj się" : "Masz już konto? Zaloguj się"}
      </button>
    </Modal>
  );
}

function ProjectsModal({ session, onClose, onLoad, busyMsg }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    supaListProjects(session.token, session.user.id).then(setItems).catch((e) => setErr(e.message));
  }, [session]);

  return (
    <Modal title="Moje projekty w chmurze" onClose={onClose} width={480}>
      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
      {busyMsg && <div className="text-xs text-slate-500 mb-2">{busyMsg}</div>}
      {items === null && !err && <div className="text-xs text-slate-400 flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Wczytywanie…</div>}
      {items?.length === 0 && <div className="text-xs text-slate-400">Brak zapisanych projektów — użyj „Zapisz w chmurze” w nagłówku.</div>}
      <div className="space-y-2 max-h-80 overflow-auto pe-scroll">
        {items?.map((p) => (
          <div key={p.id} className="pe-input flex items-center justify-between py-2">
            <div>
              <div className="text-sm">{p.name}</div>
              <div className="text-[11px] text-slate-400">{new Date(p.updated_at).toLocaleString("pl-PL")}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => onLoad(p.id)} className="pe-btn-ghost text-xs px-2.5 py-1">Wczytaj</button>
              <button
                onClick={async () => {
                  if (!confirm(`Usunąć projekt „${p.name}”?`)) return;
                  await supaDeleteProject(session.token, p.id);
                  setItems((its) => its.filter((x) => x.id !== p.id));
                }}
                className="text-slate-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* =========================================================================
   KALKULATORY  (bez zmian merytorycznych względem poprzedniej wersji)
   ========================================================================= */

function Card({ title, icon: Icon, children, tag }) {
  return (
    <div className="pe-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={17} style={{ color: "#C1793F" }} />}
          <h3 className="pe-display text-[15px]">{title}</h3>
        </div>
        {tag && <span className="pe-chip pe-tag-blue">{tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, unit, type = "number", step, options }) {
  return (
    <label className="block mb-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        {options ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className="pe-input text-sm w-full">
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : (
          <input
            type={type} step={step || "any"} value={value}
            onChange={(e) => onChange(type === "number" ? Number(e.target.value) : e.target.value)}
            className="pe-input text-sm w-full pe-mono"
          />
        )}
        {unit && <span className="text-xs text-slate-500 w-14">{unit}</span>}
      </div>
    </label>
  );
}

const CABLE_TABLE = [
  { s: "1,5", ampacity: 16, mcb: [10, 13, 16] },
  { s: "2,5", ampacity: 21, mcb: [16, 20] },
  { s: "4",   ampacity: 27, mcb: [20, 25] },
  { s: "6",   ampacity: 34, mcb: [32] },
  { s: "10",  ampacity: 46, mcb: [40] },
  { s: "16",  ampacity: 61, mcb: [50, 63] },
];

/* =========================================================================
   PROTOKOŁY POMIAROWE
   Zestaw protokołów wykonywanych przy odbiorze i pomiarach okresowych instalacji
   elektrycznej (zakres wg PN-HD 60364-6). Kryteria oceny są wbudowane, ale każdy
   wynik podlega ocenie osoby z uprawnieniami — narzędzie ich nie zastępuje.
   ========================================================================= */

const U0 = 230; // napięcie fazowe względem ziemi, do wyliczeń impedancji pętli

/* krotność prądu zadziałania wyzwalacza magnetycznego wg charakterystyki */
const CURVE_MULT = { B: 5, C: 10, D: 20 };

function zsMaxFor(curve, inA) {
  const mult = CURVE_MULT[String(curve || "B").toUpperCase()] || 5;
  const ia = mult * Number(inA || 0);
  return ia > 0 ? { ia, zsMax: U0 / ia } : { ia: 0, zsMax: 0 };
}

const PROTOCOL_DEFS = {
  izolacja: {
    title: "Pomiar rezystancji izolacji",
    norm: "PN-HD 60364-6 zał. D — kontrola po wykonaniu (rezystancja izolacji)",
    intro: "Pomiar wykonano miernikiem rezystancji izolacji przy odłączonym zasilaniu i odłączonych odbiornikach.",
    columns: [
      { key: "obwod", label: "Obwód / miejsce pomiaru", w: 150, type: "text" },
      { key: "u", label: "U pom. [V]", w: 58, type: "number", default: 500 },
      { key: "ln", label: "L-N [MΩ]", w: 58, type: "number" },
      { key: "lpe", label: "L-PE [MΩ]", w: 58, type: "number" },
      { key: "npe", label: "N-PE [MΩ]", w: 58, type: "number" },
    ],
    limitLabel: "Rezystancja minimalna",
    limitDefault: 1.0,
    limitUnit: "MΩ",
    evaluate: (r, limit) => {
      const vals = [r.ln, r.lpe, r.npe].map(Number).filter((v) => !isNaN(v) && v > 0);
      if (!vals.length) return null;
      return Math.min(...vals) >= Number(limit);
    },
  },

  petla: {
    title: "Pomiar impedancji pętli zwarcia",
    norm: "PN-HD 60364-4-41 — ochrona przez samoczynne wyłączenie zasilania",
    intro: "Sprawdzenie skuteczności ochrony przeciwporażeniowej przez samoczynne wyłączenie zasilania (układ TN).",
    columns: [
      { key: "obwod", label: "Obwód", w: 120, type: "text" },
      { key: "curve", label: "Char.", w: 40, type: "select", options: ["B", "C", "D"], default: "B" },
      { key: "in", label: "In [A]", w: 44, type: "number", default: 16 },
      { key: "zs", label: "Zs zmierz. [Ω]", w: 70, type: "number" },
      { key: "ia", label: "Ia [A]", w: 48, type: "computed", compute: (r) => zsMaxFor(r.curve, r.in).ia.toFixed(0) },
      { key: "zsmax", label: "Zs max [Ω]", w: 62, type: "computed", compute: (r) => { const z = zsMaxFor(r.curve, r.in).zsMax; return z ? z.toFixed(2) : "—"; } },
    ],
    limitLabel: "Współczynnik bezpieczeństwa",
    limitDefault: 1.0,
    limitUnit: "×Zs max",
    evaluate: (r, limit) => {
      const zs = Number(r.zs);
      const { zsMax } = zsMaxFor(r.curve, r.in);
      if (!zs || !zsMax) return null;
      return zs <= zsMax * Number(limit);
    },
  },

  rcd: {
    title: "Badanie wyłączników różnicowoprądowych",
    norm: "PN-HD 60364-4-41 — ochrona uzupełniająca (RCD); PN-HD 60364-6 zał. D",
    intro: "Sprawdzenie prądu i czasu zadziałania wyłączników różnicowoprądowych oraz napięcia dotykowego.",
    columns: [
      { key: "ozn", label: "Oznaczenie", w: 78, type: "text" },
      { key: "idn", label: "IΔn [mA]", w: 56, type: "number", default: 30 },
      { key: "typ", label: "Typ", w: 42, type: "select", options: ["AC", "A", "B", "F"], default: "A" },
      { key: "id", label: "IΔ zadz. [mA]", w: 68, type: "number" },
      { key: "t", label: "t zadz. [ms]", w: 62, type: "number" },
      { key: "ub", label: "UB [V]", w: 48, type: "number" },
    ],
    limitLabel: "Maks. czas zadziałania",
    limitDefault: 300,
    limitUnit: "ms",
    evaluate: (r, limit) => {
      const idn = Number(r.idn), id = Number(r.id), t = Number(r.t), ub = Number(r.ub);
      if (!idn || !id || !t) return null;
      const okPrad = id >= 0.5 * idn && id <= idn;      // zakres wg wymagań
      const okCzas = t <= Number(limit);
      const okUb = isNaN(ub) || ub <= 50;                // napięcie dotykowe dopuszczalne
      return okPrad && okCzas && okUb;
    },
  },

  uziemienie: {
    title: "Pomiar rezystancji uziemienia",
    norm: "PN-HD 60364-5-54 — uziemienia i przewody ochronne",
    intro: "Pomiar rezystancji uziomu wykonano metodą techniczną / cęgową przy odłączonym połączeniu wyrównawczym.",
    columns: [
      { key: "miejsce", label: "Uziom / miejsce pomiaru", w: 170, type: "text" },
      { key: "metoda", label: "Metoda", w: 90, type: "select", options: ["3-przewodowa", "4-przewodowa", "cęgowa", "udarowa"], default: "3-przewodowa" },
      { key: "r", label: "R [Ω]", w: 62, type: "number" },
    ],
    limitLabel: "Rezystancja maksymalna",
    limitDefault: 30,
    limitUnit: "Ω",
    evaluate: (r, limit) => {
      const v = Number(r.r);
      if (!v) return null;
      return v <= Number(limit);
    },
  },

  ciaglosc: {
    title: "Sprawdzenie ciągłości przewodów ochronnych",
    norm: "PN-HD 60364-6 zał. D — ciągłość przewodów ochronnych i połączeń wyrównawczych",
    intro: "Sprawdzenie ciągłości przewodów ochronnych PE oraz połączeń wyrównawczych.",
    columns: [
      { key: "punkt", label: "Obwód / punkt sprawdzany", w: 190, type: "text" },
      { key: "r", label: "R [Ω]", w: 62, type: "number" },
      { key: "i", label: "I pom. [A]", w: 62, type: "number", default: 0.2 },
    ],
    limitLabel: "Rezystancja maksymalna",
    limitDefault: 1.0,
    limitUnit: "Ω",
    evaluate: (r, limit) => {
      const v = Number(r.r);
      if (isNaN(v) || r.r === "" || r.r === undefined) return null;
      return v <= Number(limit);
    },
  },

  ogledziny: {
    title: "Protokół oględzin instalacji",
    norm: "PN-HD 60364-6 pkt 6.4 — oględziny",
    intro: "Oględziny instalacji elektrycznej przed uruchomieniem / w ramach badania okresowego.",
    checklist: true,
    items: [
      "Zgodność wykonania instalacji z dokumentacją projektową",
      "Dobór przewodów pod względem obciążalności i spadku napięcia",
      "Dobór i nastawy urządzeń zabezpieczających",
      "Prawidłowość połączeń przewodów, brak uszkodzeń izolacji",
      "Obecność i prawidłowość połączeń wyrównawczych",
      "Oznakowanie przewodów neutralnych i ochronnych",
      "Umieszczenie schematów, opisów i oznaczeń obwodów",
      "Dostępność aparatury do obsługi i konserwacji",
      "Stopnie ochrony IP właściwe dla warunków środowiskowych",
      "Ochrona przed dotykiem bezpośrednim (osłony, obudowy)",
      "Prawidłowy dobór urządzeń do wpływów zewnętrznych",
      "Stan techniczny rozdzielnicy i osprzętu",
    ],
  },
};

const PROTOCOL_ORDER = ["ogledziny", "ciaglosc", "izolacja", "petla", "rcd", "uziemienie"];

/* Rozwijana sekcja z wyjaśnieniem działania kalkulatora — wzory, założenia, ograniczenia */
function HowItWorks({ formulas, notes }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EEF1F4" }}>
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left text-xs font-semibold" style={{ color: "#2D5A8C" }}>
        <span className="flex items-center gap-1.5"><Info size={14} /> Jak działa kalkulator</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {formulas.map((f, i) => (
            <div key={i}>
              <div className="text-[11px] text-slate-500 mb-1">{f.label}</div>
              <div className="pe-mono text-sm px-3 py-2 rounded-md" style={{ background: "#EEF1F4", color: "#16202B" }}>
                {f.eq}
              </div>
              {f.where && <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{f.where}</div>}
            </div>
          ))}
          {notes?.length > 0 && (
            <ul className="text-[11px] text-slate-600 space-y-1.5 pt-1">
              {notes.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span style={{ color: "#C1793F" }}>•</span><span className="leading-relaxed">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

const CALC_LIST = [
  { id: "przewod", label: "Dobór przewodu i zabezpieczenia", desc: "prąd obliczeniowy, przekrój, wyłącznik", icon: Zap },
  { id: "spadek", label: "Spadek napięcia", desc: "weryfikacja długości obwodu", icon: GitBranch },
  { id: "moc", label: "Bilans mocy budynku", desc: "moc zapotrzebowana, dobór przyłącza", icon: Home },
  { id: "petla", label: "Impedancja pętli zwarcia", desc: "skuteczność ochrony przeciwporażeniowej", icon: ClipboardCheck },
  { id: "oswietlenie", label: "Dobór oświetlenia", desc: "strumień świetlny i liczba opraw", icon: Calculator },
  { id: "rcd", label: "Dobór wyłącznika różnicowoprądowego", desc: "zasady doboru RCD", icon: Info },
];

function CalculatorsTab() {
  const [activeCalc, setActiveCalc] = useState("przewod");

  // --- 1. dobór przewodu ---
  const [power, setPower] = useState(2000);
  const [phase, setPhase] = useState("1");
  const [cosphi, setCosphi] = useState(1);

  const current = useMemo(() => {
    const U = phase === "1" ? 230 : 400;
    const denom = phase === "1" ? U * cosphi : Math.sqrt(3) * U * cosphi;
    return power / (denom || 1);
  }, [power, phase, cosphi]);

  const recommendation = useMemo(() => {
    const row = CABLE_TABLE.find((r) => r.ampacity >= current);
    if (!row) return null;
    const mcb = row.mcb.find((m) => m >= current) ?? row.mcb[row.mcb.length - 1];
    return { section: row.s, ampacity: row.ampacity, mcb };
  }, [current]);

  // --- 2. spadek napięcia ---
  const [vdLen, setVdLen] = useState(20);
  const [vdI, setVdI] = useState(10);
  const [vdS, setVdS] = useState(2.5);
  const [vdPhase, setVdPhase] = useState("1");
  const rho = 0.0175;
  const vdU = useMemo(() => {
    const U = vdPhase === "1" ? 230 : 400;
    const drop = vdPhase === "1" ? (2 * vdLen * vdI * rho) / vdS : (Math.sqrt(3) * vdLen * vdI * rho) / vdS;
    return { volts: drop, percent: (drop / U) * 100 };
  }, [vdLen, vdI, vdS, vdPhase]);

  // --- 3. bilans mocy ---
  const [devices, setDevices] = useState([
    { id: uid(), name: "Gniazda i oświetlenie", power: 6000 },
    { id: uid(), name: "Kuchenka elektryczna", power: 7000 },
    { id: uid(), name: "Bojler / pompa ciepła", power: 3000 },
  ]);
  const [ks, setKs] = useState(0.7);
  const sumPower = devices.reduce((a, d) => a + Number(d.power || 0), 0);
  const demandPower = sumPower * ks;
  const demandCurrent1 = demandPower / 230;
  const demandCurrent3 = demandPower / (Math.sqrt(3) * 400);

  // --- 4. impedancja pętli zwarcia ---
  const [zCurve, setZCurve] = useState("B");
  const [zIn, setZIn] = useState(16);
  const [zMeasured, setZMeasured] = useState(0.8);
  const zCalc = useMemo(() => {
    const { ia, zsMax } = zsMaxFor(zCurve, zIn);
    const ik = Number(zMeasured) > 0 ? U0 / Number(zMeasured) : 0;
    return { ia, zsMax, ik, ok: zsMax > 0 && Number(zMeasured) > 0 ? Number(zMeasured) <= zsMax : null };
  }, [zCurve, zIn, zMeasured]);

  // --- 5. oświetlenie ---
  const [roomA, setRoomA] = useState(20);
  const [lux, setLux] = useState(300);
  const [lumPerOpr, setLumPerOpr] = useState(1200);
  const [mf, setMf] = useState(0.8);
  const [uf, setUf] = useState(0.6);
  const lightCalc = useMemo(() => {
    const need = (Number(lux) * Number(roomA)) / (Number(uf) * Number(mf) || 1);
    const count = Number(lumPerOpr) > 0 ? need / Number(lumPerOpr) : 0;
    return { need, count };
  }, [roomA, lux, lumPerOpr, mf, uf]);

  const active = CALC_LIST.find((c) => c.id === activeCalc);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Kalkulatory elektryczne</h2>
        <p className="text-sm text-slate-500">Szybkie, orientacyjne obliczenia pomocnicze do wstępnego projektowania instalacji.</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
        {/* lista wybieralna kalkulatorów */}
        <div className="space-y-1.5" style={{ width: 260, flexShrink: 0, flexGrow: 0 }}>
          {CALC_LIST.map((c) => {
            const Icon = c.icon;
            const on = activeCalc === c.id;
            return (
              <button key={c.id} onClick={() => setActiveCalc(c.id)}
                className="w-full text-left p-3 rounded-lg flex items-start gap-2.5"
                style={on ? { background: "#2D5A8C10", border: "1px solid #2D5A8C" } : { background: "#fff", border: "1px solid #DCE2E8" }}>
                <Icon size={16} className="shrink-0 mt-0.5" style={{ color: on ? "#2D5A8C" : "#94A3B8" }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium" style={{ color: on ? "#2D5A8C" : "#16202B" }}>{c.label}</div>
                  <div className="text-[11px] text-slate-500 leading-snug">{c.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* aktywny kalkulator */}
        <div style={{ flex: "1 1 480px", minWidth: 320 }}>
          {activeCalc === "przewod" && (
            <Card title={active.label} icon={Zap} tag="obwód">
              <div className="grid sm:grid-cols-3 gap-x-4">
                <Field label="Moc odbiornika" value={power} onChange={setPower} unit="W" />
                <Field label="Zasilanie" value={phase} onChange={setPhase} options={[{ value: "1", label: "1-fazowe 230V" }, { value: "3", label: "3-fazowe 400V" }]} />
                <Field label="Współczynnik cos φ" value={cosphi} onChange={setCosphi} step="0.05" />
              </div>
              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Prąd obliczeniowy</div>
                <div className="pe-mono text-lg" style={{ color: "#2D5A8C" }}>{current.toFixed(2)} A</div>
                {recommendation ? (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    <span className="pe-chip pe-tag-copper">przewód {recommendation.section} mm²</span>
                    <span className="pe-chip pe-tag-blue">wyłącznik B{recommendation.mcb}</span>
                    <span className="pe-chip pe-tag-green">obc. dop. {recommendation.ampacity} A</span>
                  </div>
                ) : (
                  <div className="text-sm text-red-600 mt-2 flex items-center gap-1"><AlertTriangle size={14} /> prąd przekracza tabelę — dobór indywidualny</div>
                )}
              </div>
              <HowItWorks
                formulas={[
                  { label: "Prąd obliczeniowy — obwód 1-fazowy", eq: "I = P / (U × cos φ)", where: "P — moc czynna [W], U = 230 V, cos φ — współczynnik mocy" },
                  { label: "Prąd obliczeniowy — obwód 3-fazowy", eq: "I = P / (√3 × U × cos φ)", where: "U = 400 V (napięcie międzyfazowe)" },
                  { label: "Warunek doboru zabezpieczenia", eq: "I ≤ In ≤ Iz", where: "In — prąd znamionowy wyłącznika, Iz — obciążalność długotrwała przewodu" },
                ]}
                notes={[
                  "Kalkulator dobiera najmniejszy przekrój, którego obciążalność Iz pokrywa prąd obliczeniowy, a następnie najbliższy wyłącznik nadprądowy.",
                  "Wartości Iz przyjęto dla przewodów miedzianych YDY/YDYp układanych podtynkowo (metoda referencyjna B2, temperatura otoczenia 30°C).",
                  "Dla odbiorników rezystancyjnych (grzałki, żarówki) cos φ = 1. Dla silników i zasilaczy impulsowych przyjmij wartość z tabliczki znamionowej — zwykle 0,85–0,95.",
                  "Przy układaniu wielu obwodów w jednej rurze lub temperaturze powyżej 30°C należy zastosować współczynniki poprawkowe, które ten kalkulator pomija — wtedy przekrój trzeba zwiększyć.",
                  "Dobór należy dodatkowo zweryfikować pod kątem spadku napięcia (osobny kalkulator) oraz skuteczności ochrony przeciwporażeniowej.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "spadek" && (
            <Card title={active.label} icon={GitBranch} tag="weryfikacja">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Długość obwodu (w jedną stronę)" value={vdLen} onChange={setVdLen} unit="m" />
                <Field label="Prąd obciążenia" value={vdI} onChange={setVdI} unit="A" />
                <Field label="Przekrój żyły" value={vdS} onChange={setVdS} unit="mm²" step="0.5" />
                <Field label="Zasilanie" value={vdPhase} onChange={setVdPhase} options={[{ value: "1", label: "1-fazowe 230V" }, { value: "3", label: "3-fazowe 400V" }]} />
              </div>
              <div className="mt-2 p-3 pe-result">
                <div className="text-xs text-slate-500 mb-1">Spadek napięcia</div>
                <div className="pe-mono text-lg" style={{ color: vdU.percent > 4 ? "#C6433A" : "#2D5A8C" }}>
                  {vdU.volts.toFixed(2)} V &nbsp;({vdU.percent.toFixed(2)}%)
                </div>
                <div className="text-xs mt-1 text-slate-500">Zalecany limit orientacyjny: do 4–5% dla obwodów odbiorczych.</div>
              </div>
              <HowItWorks
                formulas={[
                  { label: "Spadek napięcia — obwód 1-fazowy", eq: "ΔU = (2 × L × I × ρ) / S", where: "L — długość w jedną stronę [m], I — prąd [A], ρ = 0,0175 Ω·mm²/m (miedź), S — przekrój [mm²]" },
                  { label: "Spadek napięcia — obwód 3-fazowy", eq: "ΔU = (√3 × L × I × ρ) / S", where: "w układzie 3-fazowym symetrycznym prąd nie wraca przewodem neutralnym" },
                  { label: "Spadek procentowy", eq: "ΔU% = (ΔU / U) × 100%", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
                ]}
                notes={[
                  "Mnożnik 2 w obwodzie 1-fazowym wynika z tego, że prąd płynie tam i z powrotem — przewodem fazowym i neutralnym.",
                  "Rezystywność ρ = 0,0175 Ω·mm²/m dotyczy miedzi w temperaturze 20°C. Dla aluminium przyjmuje się ok. 0,029.",
                  "Wzór pomija reaktancję przewodu — przy małych przekrojach (do ok. 16 mm²) i długościach domowych jej wpływ jest pomijalny.",
                  "Orientacyjne limity: 3% dla obwodów oświetleniowych i 5% dla obwodów gniazd, liczone od złącza do najdalszego odbiornika.",
                  "Zbyt duży spadek to nie tylko słabsze świecenie — to również gorsza praca silników i ryzyko nieskutecznego zadziałania zabezpieczeń.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "moc" && (
            <Card title={active.label} icon={Home} tag="bilans mocy">
              <div className="space-y-2 mb-3">
                {devices.map((d) => (
                  <div key={d.id} className="flex items-center gap-2">
                    <input className="pe-input text-sm flex-1" value={d.name}
                      onChange={(e) => setDevices((ds) => ds.map((x) => x.id === d.id ? { ...x, name: e.target.value } : x))} />
                    <input className="pe-input text-sm w-24 pe-mono" type="number" value={d.power}
                      onChange={(e) => setDevices((ds) => ds.map((x) => x.id === d.id ? { ...x, power: Number(e.target.value) } : x))} />
                    <span className="text-xs text-slate-400 w-6">W</span>
                    <button onClick={() => setDevices((ds) => ds.filter((x) => x.id !== d.id))} className="text-slate-400 hover:text-red-500"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => setDevices((ds) => [...ds, { id: uid(), name: "Nowy odbiornik", power: 1000 }])}
                className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 mb-3"><Plus size={13} /> Dodaj odbiornik</button>
              <Field label="Współczynnik jednoczesności (ks)" value={ks} onChange={setKs} step="0.05" />
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div><div className="text-xs text-slate-500">Moc zainstalowana</div><div className="pe-mono">{sumPower.toFixed(0)} W</div></div>
                <div><div className="text-xs text-slate-500">Moc zapotrzebowana</div><div className="pe-mono" style={{ color: "#C1793F" }}>{demandPower.toFixed(0)} W</div></div>
                <div><div className="text-xs text-slate-500">Prąd — 1-faz.</div><div className="pe-mono">{demandCurrent1.toFixed(1)} A</div></div>
                <div><div className="text-xs text-slate-500">Prąd — 3-faz.</div><div className="pe-mono">{demandCurrent3.toFixed(1)} A</div></div>
              </div>
              <HowItWorks
                formulas={[
                  { label: "Moc zainstalowana", eq: "Pi = ΣP", where: "suma mocy znamionowych wszystkich odbiorników" },
                  { label: "Moc zapotrzebowana (szczytowa)", eq: "Pz = Pi × ks", where: "ks — współczynnik jednoczesności (0 < ks ≤ 1)" },
                  { label: "Prąd zapotrzebowany", eq: "I₁f = Pz / U   |   I₃f = Pz / (√3 × U)", where: "U = 230 V dla 1 fazy, 400 V dla 3 faz" },
                ]}
                notes={[
                  "Współczynnik jednoczesności odzwierciedla fakt, że nie wszystkie odbiorniki pracują jednocześnie z pełną mocą.",
                  "Wartości orientacyjne ks dla domu jednorodzinnego: 0,6–0,8. Im więcej odbiorników, tym niższy współczynnik.",
                  "Moc zapotrzebowana służy do doboru mocy przyłączeniowej we wniosku do operatora sieci oraz zabezpieczenia przedlicznikowego.",
                  "Dla instalacji z pompą ciepła, ładowarką EV lub kuchenką indukcyjną warto przyjąć wyższy ks — te odbiorniki potrafią pracować równocześnie i długotrwale.",
                  "Kalkulator zakłada cos φ = 1. Przy dużym udziale silników rzeczywisty prąd będzie wyższy o 1/cos φ.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "petla" && (
            <Card title={active.label} icon={ClipboardCheck} tag="ochrona przeciwporażeniowa">
              <div className="grid sm:grid-cols-3 gap-x-4">
                <Field label="Charakterystyka" value={zCurve} onChange={setZCurve}
                  options={[{ value: "B", label: "B (5×In)" }, { value: "C", label: "C (10×In)" }, { value: "D", label: "D (20×In)" }]} />
                <Field label="Prąd znamionowy In" value={zIn} onChange={setZIn} unit="A" />
                <Field label="Zmierzona Zs" value={zMeasured} onChange={setZMeasured} unit="Ω" step="0.01" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-3 gap-3">
                <div><div className="text-xs text-slate-500">Prąd zadziałania Ia</div><div className="pe-mono">{zCalc.ia.toFixed(0)} A</div></div>
                <div><div className="text-xs text-slate-500">Zs maksymalna</div><div className="pe-mono" style={{ color: "#C1793F" }}>{zCalc.zsMax ? zCalc.zsMax.toFixed(2) : "—"} Ω</div></div>
                <div><div className="text-xs text-slate-500">Prąd zwarcia Ik</div><div className="pe-mono">{zCalc.ik ? zCalc.ik.toFixed(0) : "—"} A</div></div>
              </div>
              {zCalc.ok !== null && (
                <div className="mt-2 p-3 rounded-lg text-sm flex items-start gap-2"
                  style={zCalc.ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}>
                  {zCalc.ok ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
                  {zCalc.ok
                    ? "Warunek spełniony — zabezpieczenie zadziała w wymaganym czasie."
                    : "Warunek niespełniony — zmierzona Zs przekracza wartość dopuszczalną. Skróć obwód, zwiększ przekrój lub zmień charakterystykę zabezpieczenia."}
                </div>
              )}
              <HowItWorks
                formulas={[
                  { label: "Warunek samoczynnego wyłączenia zasilania", eq: "Zs × Ia ≤ U₀", where: "Zs — impedancja pętli zwarcia [Ω], Ia — prąd zadziałania [A], U₀ = 230 V" },
                  { label: "Maksymalna dopuszczalna impedancja", eq: "Zs max = U₀ / Ia", where: "wartość, której zmierzona Zs nie może przekroczyć" },
                  { label: "Prąd zadziałania wyzwalacza magnetycznego", eq: "Ia = k × In", where: "k = 5 dla char. B, 10 dla C, 20 dla D (górna granica pasma)" },
                  { label: "Spodziewany prąd zwarcia", eq: "Ik = U₀ / Zs", where: "prąd, jaki popłynie przy zwarciu L-PE" },
                ]}
                notes={[
                  "Wymagany czas wyłączenia w układzie TN dla obwodów odbiorczych do 32 A wynosi 0,4 s, a dla obwodów rozdzielczych — 5 s.",
                  "Przyjęto górną granicę pasma wyzwalania magnetycznego, co jest podejściem bezpiecznym — rzeczywisty wyłącznik zadziała przy prądzie nie większym niż ta wartość.",
                  "W praktyce pomiarowej często stosuje się dodatkowy zapas (np. mnożnik 0,8 dla Zs max), uwzględniający wzrost rezystancji przewodów przy nagrzaniu.",
                  "Jeśli warunek nie jest spełniony, ochronę można też zapewnić wyłącznikiem różnicowoprądowym — dla RCD 30 mA warunek Zs jest znacznie łagodniejszy.",
                  "Kalkulator dotyczy układu TN. Dla układu TT kryterium opiera się na rezystancji uziemienia, nie na impedancji pętli.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "oswietlenie" && (
            <Card title={active.label} icon={Calculator} tag="natężenie oświetlenia">
              <div className="grid sm:grid-cols-2 gap-x-4">
                <Field label="Powierzchnia pomieszczenia" value={roomA} onChange={setRoomA} unit="m²" />
                <Field label="Wymagane natężenie" value={lux} onChange={setLux} unit="lx" />
                <Field label="Strumień jednej oprawy" value={lumPerOpr} onChange={setLumPerOpr} unit="lm" />
                <Field label="Wsp. utrzymania (MF)" value={mf} onChange={setMf} step="0.05" />
                <Field label="Wsp. wykorzystania (UF)" value={uf} onChange={setUf} step="0.05" />
              </div>
              <div className="mt-2 p-3 pe-result grid grid-cols-2 gap-3">
                <div><div className="text-xs text-slate-500">Wymagany strumień całkowity</div><div className="pe-mono">{lightCalc.need.toFixed(0)} lm</div></div>
                <div><div className="text-xs text-slate-500">Liczba opraw</div><div className="pe-mono text-lg" style={{ color: "#C1793F" }}>{Math.ceil(lightCalc.count) || 0} szt.</div></div>
              </div>
              <div className="text-[11px] text-slate-500 mt-2">
                Orientacyjne wymagania: pokój dzienny 150–300 lx, kuchnia (blat) 500 lx, łazienka 200–300 lx, biuro 500 lx, korytarz 100 lx.
              </div>
              <HowItWorks
                formulas={[
                  { label: "Metoda strumienia świetlnego", eq: "Φ = (E × A) / (UF × MF)", where: "E — wymagane natężenie [lx], A — powierzchnia [m²], UF — wsp. wykorzystania, MF — wsp. utrzymania" },
                  { label: "Liczba opraw", eq: "n = Φ / Φ_oprawy", where: "Φ_oprawy — strumień świetlny jednej oprawy [lm] z karty katalogowej" },
                ]}
                notes={[
                  "Współczynnik wykorzystania UF zależy od geometrii pomieszczenia i odbicia ścian/sufitu — typowo 0,4–0,7. Dla jasnego pokoju o zwykłych proporcjach przyjmij 0,6.",
                  "Współczynnik utrzymania MF uwzględnia starzenie źródeł i zabrudzenie opraw — dla LED w warunkach domowych zwykle 0,8.",
                  "Metoda daje średnie natężenie na płaszczyźnie roboczej. Nie zastępuje obliczeń rozkładu światła, gdy istotna jest równomierność lub olśnienie.",
                  "Wynik zaokrąglaj w górę i rozmieszczaj oprawy równomiernie — odległość między nimi nie powinna przekraczać ok. 1,5× wysokości zawieszenia nad płaszczyzną roboczą.",
                ]}
              />
            </Card>
          )}

          {activeCalc === "rcd" && (
            <Card title={active.label} icon={Info} tag="bezpieczeństwo">
              <ul className="text-sm space-y-2.5 text-slate-700">
                <li className="flex gap-2"><ChevronRight size={15} className="mt-0.5 shrink-0" style={{ color: "#C1793F" }} /> Obwody gniazd wtyczkowych — RCD 30 mA (typ AC/A), obowiązkowo.</li>
                <li className="flex gap-2"><ChevronRight size={15} className="mt-0.5 shrink-0" style={{ color: "#C1793F" }} /> Łazienka, kuchnia, tarasy — RCD 30 mA, zalecany osobny obwód i osobna ochrona.</li>
                <li className="flex gap-2"><ChevronRight size={15} className="mt-0.5 shrink-0" style={{ color: "#C1793F" }} /> Odbiorniki z elektroniką (np. pompy ciepła, falowniki) — rozważ typ A lub B wg zaleceń producenta.</li>
                <li className="flex gap-2"><ChevronRight size={15} className="mt-0.5 shrink-0" style={{ color: "#C1793F" }} /> Maks. 6–8 obwodów na jeden RCD 40A — powyżej dziel na kolejne różnicówki.</li>
                <li className="flex gap-2"><ChevronRight size={15} className="mt-0.5 shrink-0" style={{ color: "#C1793F" }} /> Rozważ wyłącznik przeciwprzepięciowy (typ 2) na początku instalacji.</li>
              </ul>
              <HowItWorks
                formulas={[
                  { label: "Warunek ochrony przy dotyku pośrednim", eq: "RA × IΔn ≤ UL", where: "RA — rezystancja uziemienia [Ω], IΔn — prąd różnicowy znamionowy [A], UL = 50 V" },
                  { label: "Maksymalna rezystancja uziemienia (RCD 30 mA)", eq: "RA ≤ 50 / 0,03 = 1667 Ω", where: "dlatego w układzie TT z RCD 30 mA wymagania wobec uziemienia są łagodne" },
                  { label: "Dobór prądu znamionowego RCD", eq: "In(RCD) ≥ ΣIn zabezpieczeń za nim", where: "RCD nie ma własnego zabezpieczenia zwarciowego — musi być chroniony nadprądowo" },
                ]}
                notes={[
                  "Typ AC reaguje tylko na prąd różnicowy sinusoidalny; typ A dodatkowo na pulsujący stały — dziś to praktyczne minimum przy zasilaczach impulsowych i elektronice.",
                  "Typ B jest wymagany m.in. przy ładowarkach pojazdów elektrycznych i falownikach, gdzie może pojawić się gładki prąd stały.",
                  "Rozdzielenie instalacji na kilka RCD ogranicza skutki zadziałania — awaria w jednym obwodzie nie pozbawia zasilania całego domu.",
                  "Prądy upływowe odbiorników sumują się. Zbyt wiele obwodów za jednym RCD 30 mA prowadzi do przypadkowych wyłączeń bez rzeczywistej usterki.",
                  "Wyłącznik różnicowoprądowy należy testować przyciskiem TEST co najmniej raz na pół roku — to jedyny sposób sprawdzenia, czy mechanizm nie zastygł.",
                ]}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   ZAPROJEKTUJ INSTALACJĘ — edytor v2
   Nowości: kondygnacje, rysowanie ścian, zoom/pan, snapowanie do siatki,
   zaznaczanie i usuwanie klawiszem Delete, historia cofnij/ponów.
   ========================================================================= */

const VB_DEFAULT = { x: 0, y: 0, w: 1000, h: 700 };
const GRID = 20;

/* Układ siatki gniazd w ramce: 1–2 gniazda w kolumnie (jak w podanym wzorze —
   ułożone jedno nad drugim), 3–6 gniazd w dwóch kolumnach. */
function socketGridMetrics(gangs) {
  const g = Math.max(1, Math.min(6, gangs || 1));
  const cols = g <= 2 ? 1 : g;
  const rows = g <= 2 ? g : 1;
  const cell = 17, gap = 1.5, pad = 4;
  const w = cols * cell + (cols - 1) * gap + pad * 2;
  const h = rows * cell + (rows - 1) * gap + pad * 2;
  return { g, cols, rows, cell, gap, pad, w, h };
}

/* Rozmiar „płytki” danego typu — używany zarówno do rysowania symbolu, jak i obwódki zaznaczenia */
function glyphBoxSize(type, gangs) {
  if (type === "wlacznik" || type === "wlacznikSchodowy") { const g = Math.max(1, Math.min(2, gangs || 1)); return { w: g * 13 + 9, h: 24 }; }
  if (type === "gniazdko" || type === "gniazdkoHerm") { const { w, h } = socketGridMetrics(gangs); return { w, h }; }
  if (type === "roleta") return { w: 24, h: 20 };
  if (type === "tasmaLed") return { w: 28, h: 14 };
  if (type === "rozdzielnica") return { w: 28, h: 26 };
  if (type === "wanna") return { w: 52, h: 26 };
  if (type === "prysznic") return { w: 30, h: 30 };
  if (type === "umywalka") return { w: 26, h: 20 };
  if (["oswietlenie", "kinkiet", "oswietlenieZewn", "puszka", "czujnikRuchu", "czujnikDymu", "wentylator"].includes(type)) return { w: 26, h: 26 };
  return { w: 26, h: 24 }; // plakietki z kodem
}

/* Plakietka z branżowym kodem literowym — dla elementów, dla których pełny piktogram
   byłby nieczytelny w skali planu (RJ45, RTV, 400V, termostat itd.). */
function CodeBadge({ color, code, w = 26, h = 24 }) {
  return (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="5" fill="#fff" stroke={color} strokeWidth="2.2" />
      <text textAnchor="middle" dy="3.5" fontSize={code.length > 2 ? 8 : 10.5} fontWeight="700" fill={color}>{code}</text>
    </>
  );
}

/* Symbole zbliżone do konwencji rysunku instalacyjnego. */
function ElementGlyph({ type, color, gangs }) {
  switch (type) {
    case "gniazdko":
    case "gniazdkoHerm": {
      const { g, cols, w, h, cell, gap, pad } = socketGridMetrics(gangs);
      const r = cell / 2 - 1.5;
      const cells = [];
      for (let i = 0; i < g; i++) {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const inRow = Math.min(cols, g - row * cols);
        const rowW = inRow * cell + (inRow - 1) * gap;
        const cx = -rowW / 2 + cell / 2 + col * (cell + gap);
        const cy = -h / 2 + pad + cell / 2 + row * (cell + gap);
        cells.push({ cx, cy });
      }
      const herm = type === "gniazdkoHerm";
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill="#fff" stroke={color} strokeWidth="2.2"
            strokeDasharray={herm ? "4 2" : undefined} />
          <rect x={-w / 2 + 2.2} y={-h / 2 + 2.2} width={w - 4.4} height={h - 4.4} rx="3" fill="none" stroke={color} strokeWidth="0.9" />
          {cells.map((p, i) => (
            <g key={i}>
              <circle cx={p.cx} cy={p.cy} r={r} fill="none" stroke={color} strokeWidth="1.3" />
              <circle cx={p.cx - r * 0.45} cy={p.cy} r="1.2" fill={color} />
              <circle cx={p.cx + r * 0.45} cy={p.cy} r="1.2" fill={color} />
            </g>
          ))}
          {herm && <text x={w / 2 - 1} y={-h / 2 + 1} fontSize="6.5" fontWeight="700" fill={color}>IP</text>}
        </>
      );
    }

    case "oswietlenie":
      return (
        <>
          <circle r="13" fill="#fff" stroke={color} strokeWidth="2.2" />
          <line x1="-6.5" y1="-6.5" x2="6.5" y2="6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
          <line x1="6.5" y1="-6.5" x2="-6.5" y2="6.5" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </>
      );

    case "kinkiet": // pół-okrąg przy linii ściany
      return (
        <>
          <line x1="-11" y1="-11" x2="-11" y2="11" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M -11,-9 A 9,9 0 0 1 -11,9 Z" fill="#fff" stroke={color} strokeWidth="2" />
          <line x1="-11" y1="-4.5" x2="-1" y2="-4.5" stroke={color} strokeWidth="1.2" />
          <line x1="-11" y1="4.5" x2="-1" y2="4.5" stroke={color} strokeWidth="1.2" />
        </>
      );

    case "oswietlenieZewn": // punkt świetlny z promieniami
      return (
        <>
          <circle r="9" fill="#fff" stroke={color} strokeWidth="2.2" />
          <line x1="-4.5" y1="-4.5" x2="4.5" y2="4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <line x1="4.5" y1="-4.5" x2="-4.5" y2="4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const rad = (a * Math.PI) / 180;
            return <line key={a} x1={Math.cos(rad) * 11} y1={Math.sin(rad) * 11} x2={Math.cos(rad) * 13.5} y2={Math.sin(rad) * 13.5}
              stroke={color} strokeWidth="1.4" strokeLinecap="round" />;
          })}
        </>
      );

    case "tasmaLed": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="#fff" stroke={color} strokeWidth="2" />
          {[-9, -3, 3, 9].map((x) => <circle key={x} cx={x} cy="0" r="1.8" fill={color} />)}
        </>
      );
    }

    case "wentylator":
      return (
        <>
          <circle r="12" fill="#fff" stroke={color} strokeWidth="2.2" />
          {[0, 120, 240].map((a) => (
            <path key={a} d="M 0,0 Q 5,-6 0,-9 Q -5,-6 0,0" fill={color} opacity="0.75" transform={`rotate(${a})`} />
          ))}
          <circle r="2" fill={color} />
        </>
      );

    case "czujnikRuchu":
      return (
        <>
          <circle r="12" fill="#fff" stroke={color} strokeWidth="2.2" />
          <path d="M -6,4 A 7,7 0 0 1 6,4" fill="none" stroke={color} strokeWidth="1.6" />
          <path d="M -3.5,6.5 A 4,4 0 0 1 3.5,6.5" fill="none" stroke={color} strokeWidth="1.4" />
          <circle cx="0" cy="-3" r="2.4" fill={color} />
        </>
      );

    case "czujnikDymu":
      return (
        <>
          <circle r="12" fill="#fff" stroke={color} strokeWidth="2.2" />
          <circle r="6" fill="none" stroke={color} strokeWidth="1.4" />
          <circle r="2" fill={color} />
        </>
      );

    case "puszka": // puszka rozgałęźna — okrąg z krzyżem połączeń
      return (
        <>
          <circle r="12" fill="#fff" stroke={color} strokeWidth="2.2" strokeDasharray="4 2.5" />
          <line x1="-5" y1="0" x2="5" y2="0" stroke={color} strokeWidth="1.5" />
          <line x1="0" y1="-5" x2="0" y2="5" stroke={color} strokeWidth="1.5" />
        </>
      );

    case "wanna": { // rzut wanny — zaokrąglony prostokąt z odpływem
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="9" fill="#fff" stroke={color} strokeWidth="2" />
          <rect x={-w / 2 + 3.5} y={-h / 2 + 3.5} width={w - 7} height={h - 7} rx="6" fill="none" stroke={color} strokeWidth="0.9" />
          <circle cx={w / 2 - 8} cy="0" r="2.4" fill="none" stroke={color} strokeWidth="1.2" />
        </>
      );
    }

    case "prysznic": { // brodzik z symbolem natrysku
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="#fff" stroke={color} strokeWidth="2" />
          <circle r="4.5" fill="none" stroke={color} strokeWidth="1.2" />
          {[45, 135, 225, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return <line key={a} x1={Math.cos(r) * 7} y1={Math.sin(r) * 7} x2={Math.cos(r) * 11} y2={Math.sin(r) * 11}
              stroke={color} strokeWidth="1.2" strokeLinecap="round" />;
          })}
        </>
      );
    }

    case "umywalka": { // rzut umywalki
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="7" fill="#fff" stroke={color} strokeWidth="2" />
          <circle cx="0" cy="1.5" r="3" fill="none" stroke={color} strokeWidth="1.1" />
          <line x1="0" y1={-h / 2 + 2} x2="0" y2={-h / 2 + 5.5} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        </>
      );
    }

    case "rozdzielnica": { // tablica z modułami
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="3" fill="#fff" stroke={color} strokeWidth="2.4" />
          {[-6, 1].map((y) => (
            <g key={y}>
              {[-8, -2, 4].map((x) => <rect key={x} x={x} y={y} width="4" height="6" rx="1" fill={color} opacity="0.8" />)}
            </g>
          ))}
        </>
      );
    }

    case "roleta": {
      const { w, h } = glyphBoxSize(type);
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="4" fill="#fff" stroke={color} strokeWidth="2.2" />
          {[-5, 0, 5].map((yy) => (
            <line key={yy} x1={-w / 2 + 3} y1={yy} x2={w / 2 - 3} y2={yy} stroke={color} strokeWidth="1.3" />
          ))}
        </>
      );
    }

    case "wlacznik":
    case "wlacznikSchodowy": {
      const g = Math.max(1, Math.min(2, gangs || 1));
      const { w, h } = glyphBoxSize("wlacznik", g);
      const panelW = w / g;
      return (
        <>
          <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="6" fill="#fff" stroke={color} strokeWidth="2.2" />
          {Array.from({ length: g - 1 }).map((_, i) => {
            const x = -w / 2 + (i + 1) * panelW;
            return <line key={i} x1={x} y1={-h / 2 + 3} x2={x} y2={h / 2 - 3} stroke={color} strokeWidth="1.4" />;
          })}
          {Array.from({ length: g }).map((_, i) => {
            const cx = -w / 2 + (i + 0.5) * panelW;
            return (
              <rect key={i} x={cx - panelW * 0.26} y={-h / 2 + 4} width={panelW * 0.52} height={h - 8} rx="2.5"
                fill="none" stroke={color} strokeWidth="1.3" />
            );
          })}
          {type === "wlacznikSchodowy" && (
            <text x={w / 2 - 1} y={h / 2 - 1} fontSize="7" fontWeight="700" fill={color}>S</text>
          )}
        </>
      );
    }

    default: { // 400V, wypust AGD, ładowarka EV, ściemniacz, termostat, RJ45, RTV, domofon, dzwonek
      const def = ELEMENT_TYPES[type];
      const { w, h } = glyphBoxSize(type);
      return <CodeBadge color={color} code={def?.code || "?"} w={w} h={h} />;
    }
  }
}

function SelectionOutline({ type, gangs }) {
  const { w, h } = glyphBoxSize(type, gangs);
  if (type === "oswietlenie") {
    return <circle r={w / 2 + 6} fill="none" stroke="#C1793F" strokeWidth="2" strokeDasharray="3 3" />;
  }
  return <rect x={-w / 2 - 5} y={-h / 2 - 5} width={w + 10} height={h + 10} rx="8" fill="none" stroke="#C1793F" strokeWidth="2" strokeDasharray="3 3" />;
}

function GlyphPreview({ type, color, gangs }) {
  const { w, h } = glyphBoxSize(type, gangs);
  const size = Math.max(w, h) + 12;
  return (
    <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} width="26" height="26">
      <ElementGlyph type={type} color={color} gangs={gangs} />
    </svg>
  );
}

function SelectIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.6 2" />
    </svg>
  );
}

function RulerIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="1" y="5" width="14" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" transform="rotate(-12 8 8)" />
      <path d="M4.4 5.6v2M7.3 5v2M10.2 4.4v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function ZoneIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2.4 2" />
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CableIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M2 3.5h6.5v9H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="2" cy="3.5" r="1.6" fill="currentColor" />
      <circle cx="14" cy="12.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

function SnapIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M3.5 2.5v4.5a4.5 4.5 0 009 0V2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.5 2.5h2.5M12.5 2.5H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="4.7" y1="10.5" x2="4.7" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="11.3" y1="10.5" x2="11.3" y2="13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* =========================================================================
   ZAKŁADKA: PROTOKOŁY POMIAROWE
   ========================================================================= */

const EMPTY_HEADER = {
  obiekt: "", adres: "", zleceniodawca: "",
  wykonawca: "", uprawnienia: "",
  przyrzad: "", nrFabryczny: "", swiadectwo: "",
  data: new Date().toISOString().slice(0, 10),
  temperatura: "20", wilgotnosc: "55",
  uklad: "TN-S",
  drawingNo: "E-01", revision: "A", // numeracja dokumentacji technicznej, widoczna w tabliczce rysunkowej na PDF
};

function protocolVerdict(def, rows, limit) {
  if (def.checklist) {
    const bad = rows.filter((r) => r.status === "nie").length;
    const done = rows.filter((r) => r.status && r.status !== "nd").length;
    if (!done) return null;
    return bad === 0;
  }
  const evals = rows.map((r) => def.evaluate(r, limit)).filter((v) => v !== null);
  if (!evals.length) return null;
  return evals.every(Boolean);
}

function downloadProtocolPdf(key, header, rows, limit) {
  const def = PROTOCOL_DEFS[key];
  const doc = createPdfDoc({ footer: (d) => drawTitleBlock(d, header, def.title) });
  const M = doc.margin, W = doc.innerW;

  const drawTitle = (cd) => {
    doc.text(def.title.toUpperCase(), M, doc.y - 12, 13, true);
    doc.y -= (cd ? 26 : 20);
    if (!cd) {
      doc.text(pdfFitText(`Wymagania wg ${def.norm}`, W, 8.5, false), M, doc.y, 8.5, false, 0.35);
      doc.y -= 18;
    }
  };
  doc.setNewPageHandler(() => { drawTitle(true); });
  drawTitle(false);

  // --- dane ogólne (dwie kolumny etykieta/wartość) ---
  const info = [
    ["Obiekt", header.obiekt], ["Adres", header.adres],
    ["Zleceniodawca", header.zleceniodawca], ["Układ sieci", header.uklad],
    ["Wykonawca pomiarów", header.wykonawca], ["Nr uprawnień", header.uprawnienia],
    ["Przyrząd pomiarowy", header.przyrzad], ["Nr fabryczny", header.nrFabryczny],
    ["Świadectwo wzorcowania", header.swiadectwo], ["Data pomiarów", header.data],
    ["Temperatura [°C]", header.temperatura], ["Wilgotność [%]", header.wilgotnosc],
  ];
  doc.box(M, doc.y - 6, W, 6 + info.length / 2 * 15, 0.965);
  for (let i = 0; i < info.length; i += 2) {
    const yy = doc.y + 2;
    doc.text(info[i][0] + ":", M + 6, yy, 8.5, true);
    doc.text(pdfFitText(info[i][1] || "—", 150, 8.5, false), M + 108, yy, 8.5);
    if (info[i + 1]) {
      doc.text(info[i + 1][0] + ":", M + 274, yy, 8.5, true);
      doc.text(pdfFitText(info[i + 1][1] || "—", 130, 8.5, false), M + 384, yy, 8.5);
    }
    doc.y -= 15;
  }
  doc.y -= 12;

  doc.text(def.intro, M, doc.y, 8.5, false, 0.3);
  doc.y -= 18;

  // --- tabela wyników ---
  const ROW_H = 17;
  if (def.checklist) {
    const cols = [{ label: "Lp.", w: 28 }, { label: "Sprawdzany element", w: W - 28 - 90 }, { label: "Ocena", w: 90 }];
    const drawHead = () => {
      doc.box(M, doc.y - 12, W, 18, 0.88);
      let cx = M + 5;
      cols.forEach((c) => { doc.text(c.label, cx, doc.y - 7, 8.5, true); cx += c.w; });
      doc.y -= 18;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.8, 0.4);
    };
    drawHead();
    rows.forEach((r, i) => {
      if (doc.ensure(ROW_H)) drawHead();
      if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.968);
      const label = { tak: "zgodne", nie: "NIEZGODNE", nd: "nie dotyczy" }[r.status] || "—";
      doc.text(String(i + 1), M + 5, doc.y - ROW_H + 11, 8.5);
      doc.text(pdfFitText(r.text, cols[1].w - 10, 8.5, false), M + 33, doc.y - ROW_H + 11, 8.5);
      doc.text(label, M + 28 + cols[1].w + 5, doc.y - ROW_H + 11, 8.5, r.status === "nie");
      doc.y -= ROW_H;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.4, 0.86);
    });
  } else {
    const cols = [...def.columns.map((c) => ({ label: c.label, w: c.w, key: c.key, def: c })), { label: "Ocena", w: 68, key: "__ocena" }];
    const totalW = cols.reduce((a, c) => a + c.w, 0);
    const scale = W / totalW;
    cols.forEach((c) => { c.w = c.w * scale; });

    const drawHead = () => {
      doc.box(M, doc.y - 12, W, 18, 0.88);
      let cx = M + 4;
      cols.forEach((c) => { doc.text(pdfFitText(c.label, c.w - 6, 8, true), cx, doc.y - 7, 8, true); cx += c.w; });
      doc.y -= 18;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.8, 0.4);
    };
    drawHead();

    rows.forEach((r, i) => {
      if (doc.ensure(ROW_H)) drawHead();
      if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.968);
      let cx = M + 4;
      cols.forEach((c) => {
        let v;
        if (c.key === "__ocena") {
          const ok = def.evaluate(r, limit);
          v = ok === null ? "—" : ok ? "pozytywna" : "NEGATYWNA";
        } else if (c.def && c.def.type === "computed") {
          v = c.def.compute(r);
        } else {
          v = r[c.key] === undefined || r[c.key] === "" ? "—" : String(r[c.key]);
        }
        doc.text(pdfFitText(v, c.w - 6, 8.5, c.key === "__ocena"), cx, doc.y - ROW_H + 11, 8.5, c.key === "__ocena");
        cx += c.w;
      });
      doc.y -= ROW_H;
      doc.line(M, doc.y + 5, M + W, doc.y + 5, 0.4, 0.86);
    });

    doc.y -= 14;
    doc.ensure(20);
    doc.text(`Kryterium oceny: ${def.limitLabel} = ${limit} ${def.limitUnit}`, M, doc.y, 8.5, false, 0.3);
    doc.y -= 16;
  }

  // --- wynik końcowy ---
  doc.y -= 8;
  doc.ensure(60);
  const verdict = protocolVerdict(def, rows, limit);
  const vText = verdict === null ? "BRAK KOMPLETU DANYCH"
    : verdict ? "WYNIK POZYTYWNY — instalacja w badanym zakresie spełnia wymagania"
    : "WYNIK NEGATYWNY — stwierdzono niezgodności wymagające usunięcia";
  doc.box(M, doc.y - 8, W, 22, verdict === false ? 0.92 : 0.95);
  doc.text(vText, M + 6, doc.y, 9.5, true);
  doc.y -= 34;

  if (header.uwagi) {
    doc.ensure(40);
    doc.text("Uwagi:", M, doc.y, 9, true);
    doc.y -= 13;
    // proste zawijanie tekstu uwag
    const words = String(header.uwagi).split(/\s+/);
    let ln = "";
    words.forEach((w) => {
      if (pdfTextWidth(ln + " " + w, 8.5, false) > W - 10) { doc.text(ln, M, doc.y, 8.5); doc.y -= 12; doc.ensure(14); ln = w; }
      else ln = ln ? ln + " " + w : w;
    });
    if (ln) { doc.text(ln, M, doc.y, 8.5); doc.y -= 12; }
    doc.y -= 10;
  }

  // --- podpisy ---
  doc.ensure(60);
  doc.y -= 16;
  doc.line(M, doc.y, M + 190, doc.y, 0.6, 0.5);
  doc.line(M + W - 190, doc.y, M + W, doc.y, 0.6, 0.5);
  doc.y -= 11;
  doc.text("Wykonawca pomiarów (podpis)", M, doc.y, 8, false, 0.4);
  doc.text("Zleceniodawca / odbiór (podpis)", M + W - 190, doc.y, 8, false, 0.4);
  doc.y -= 16;
  doc.text("Dokument wygenerowany w pomocnikelektryka.pl — wymaga weryfikacji i podpisu osoby z uprawnieniami.", M, doc.y, 7.5, false, 0.5);

  return doc.finish(`protokol-${key}.pdf`);
}

function ProtocolsTab({ header, setHeader, protocols, setProtocols }) {
  const [active, setActive] = useState("ogledziny");
  const [blocked, setBlocked] = useState(false);
  const def = PROTOCOL_DEFS[active];
  const state = protocols[active] || { rows: [], limit: def.limitDefault };
  const rows = state.rows;
  const limit = state.limit ?? def.limitDefault;

  function update(patch) {
    setProtocols((p) => ({ ...p, [active]: { ...state, ...patch } }));
  }
  function setRow(i, patch) {
    update({ rows: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  }
  function addRow() {
    const blank = {};
    (def.columns || []).forEach((c) => { blank[c.key] = c.default !== undefined ? c.default : ""; });
    update({ rows: [...rows, blank] });
  }
  function removeRow(i) {
    update({ rows: rows.filter((_, idx) => idx !== i) });
  }
  function initChecklist() {
    update({ rows: def.items.map((t) => ({ text: t, status: "" })) });
  }

  const verdict = protocolVerdict(def, rows, limit);
  const headerReady = header.obiekt && header.wykonawca;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Protokoły pomiarowe</h2>
        <p className="text-sm text-slate-500">
          Protokoły z pomiarów odbiorczych i okresowych instalacji elektrycznej (zakres wg PN-HD 60364-6).
          Wypełnij dane ogólne, uzupełnij wyniki, pobierz gotowy protokół w PDF.
        </p>
      </div>

      {/* dane ogólne — wspólne dla wszystkich protokołów */}
      <div className="pe-card p-5">
        <h3 className="pe-display text-[15px] mb-3">Dane ogólne (wspólne dla wszystkich protokołów)</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            ["obiekt", "Obiekt / nazwa instalacji"], ["adres", "Adres obiektu"], ["zleceniodawca", "Zleceniodawca"],
            ["wykonawca", "Wykonawca pomiarów"], ["uprawnienia", "Nr uprawnień (SEP E/D)"], ["uklad", "Układ sieci"],
            ["przyrzad", "Przyrząd pomiarowy"], ["nrFabryczny", "Nr fabryczny przyrządu"], ["swiadectwo", "Świadectwo wzorcowania"],
            ["data", "Data pomiarów"], ["temperatura", "Temperatura [°C]"], ["wilgotnosc", "Wilgotność [%]"],
            ["drawingNo", "Nr rysunku / dokumentu"], ["revision", "Rewizja"],
          ].map(([k, label]) => (
            <label key={k} className="block">
              <div className="text-xs text-slate-500 mb-1">{label}</div>
              {k === "uklad" ? (
                <select value={header[k]} onChange={(e) => setHeader({ ...header, [k]: e.target.value })} className="pe-input text-sm w-full">
                  {["TN-S", "TN-C", "TN-C-S", "TT", "IT"].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={k === "data" ? "date" : "text"} value={header[k] || ""}
                  onChange={(e) => setHeader({ ...header, [k]: e.target.value })} className="pe-input text-sm w-full" />
              )}
            </label>
          ))}
        </div>
        <label className="block mt-3">
          <div className="text-xs text-slate-500 mb-1">Uwagi / zalecenia (drukowane na protokole)</div>
          <textarea value={header.uwagi || ""} onChange={(e) => setHeader({ ...header, uwagi: e.target.value })}
            rows={2} className="pe-input text-sm w-full" />
        </label>
        {!headerReady && (
          <p className="text-[11px] mt-2" style={{ color: "#8A5526" }}>
            Uzupełnij co najmniej „Obiekt” i „Wykonawca pomiarów” — te dane trafiają do nagłówka każdego protokołu.
          </p>
        )}
      </div>

      {/* wybór protokołu */}
      <div className="flex flex-wrap gap-2">
        {PROTOCOL_ORDER.map((k) => {
          const d = PROTOCOL_DEFS[k];
          const st = protocols[k];
          const v = st ? protocolVerdict(d, st.rows || [], st.limit ?? d.limitDefault) : null;
          return (
            <button key={k} onClick={() => setActive(k)}
              className="px-3 py-2 rounded-lg text-xs text-left"
              style={active === k
                ? { background: "#2D5A8C12", border: "1px solid #2D5A8C", color: "#2D5A8C" }
                : { background: "#fff", border: "1px solid #DCE2E8", color: "#64748B" }}>
              <div className="font-semibold">{d.title}</div>
              <div className="text-[10px] mt-0.5 flex items-center gap-1">
                {st?.rows?.length ? `${st.rows.length} poz.` : "brak danych"}
                {v === true && <span style={{ color: "#3B8C63" }}>· pozytywny</span>}
                {v === false && <span style={{ color: "#C6433A" }}>· negatywny</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* aktywny protokół */}
      <div className="pe-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="pe-display text-[15px]">{def.title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{def.intro}</p>
          </div>
          <button
            onClick={() => setBlocked(!downloadProtocolPdf(active, header, rows, limit))}
            disabled={!rows.length}
            className="pe-btn-copper text-xs px-3 py-2 flex items-center gap-1.5 disabled:opacity-50">
            <Download size={14} /> Pobierz protokół (PDF)
          </button>
        </div>

        {blocked && (
          <div className="text-xs p-2.5 rounded-md flex gap-2 mb-3" style={{ background: "#C1793F14", color: "#8A5526" }}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Przeglądarka zablokowała pobieranie w tym widoku (typowe dla podglądu w ramce). Otwórz aplikację w osobnej karcie.
          </div>
        )}

        {def.checklist ? (
          <>
            {rows.length === 0 ? (
              <button onClick={initChecklist} className="pe-btn-ghost text-sm px-3 py-2 flex items-center gap-1.5">
                <Plus size={14} /> Wczytaj listę kontrolną oględzin
              </button>
            ) : (
              <div className="space-y-1">
                {rows.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 py-1.5 border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                    <span className="text-xs text-slate-400 w-6">{i + 1}.</span>
                    <input value={r.text} onChange={(e) => setRow(i, { text: e.target.value })}
                      className="flex-1 text-sm bg-transparent outline-none min-w-0" />
                    <div className="flex gap-1 shrink-0">
                      {[["tak", "zgodne", "#3B8C63"], ["nie", "niezgodne", "#C6433A"], ["nd", "n/d", "#64748B"]].map(([v, lbl, col]) => (
                        <button key={v} onClick={() => setRow(i, { status: r.status === v ? "" : v })}
                          className="text-[11px] px-2 py-1 rounded-md"
                          style={r.status === v ? { background: col + "1A", color: col, border: `1px solid ${col}` } : { background: "#fff", color: "#94A3B8", border: "1px solid #DCE2E8" }}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
                <button onClick={() => update({ rows: [...rows, { text: "", status: "" }] })}
                  className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 mt-2">
                  <Plus size={13} /> Dodaj pozycję
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs text-slate-500">{def.limitLabel}:</span>
              <input type="number" step="0.1" value={limit} onChange={(e) => update({ limit: e.target.value })}
                className="pe-input text-sm w-24 pe-mono" />
              <span className="text-xs text-slate-500">{def.limitUnit}</span>
            </div>

            <div className="overflow-x-auto pe-scroll">
              <table className="w-full text-sm" style={{ minWidth: 620 }}>
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b" style={{ borderColor: "#DCE2E8" }}>
                    {def.columns.map((c) => <th key={c.key} className="py-2 pr-2">{c.label}</th>)}
                    <th className="py-2 w-24">Ocena</th>
                    <th className="py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const ok = def.evaluate(r, limit);
                    return (
                      <tr key={i} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                        {def.columns.map((c) => (
                          <td key={c.key} className="py-1.5 pr-2">
                            {c.type === "computed" ? (
                              <span className="pe-mono text-xs text-slate-500">{c.compute(r)}</span>
                            ) : c.type === "select" ? (
                              <select value={r[c.key] ?? c.default ?? ""} onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                className="pe-input text-xs w-full py-1">
                                {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                              </select>
                            ) : (
                              <input type={c.type === "number" ? "number" : "text"} step="any"
                                value={r[c.key] ?? ""} onChange={(e) => setRow(i, { [c.key]: e.target.value })}
                                className={`pe-input text-xs w-full py-1 ${c.type === "number" ? "pe-mono" : ""}`} />
                            )}
                          </td>
                        ))}
                        <td className="py-1.5">
                          {ok === null ? <span className="text-xs text-slate-300">—</span> : (
                            <span className="pe-chip" style={ok ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}>
                              {ok ? "pozytywna" : "negatywna"}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5">
                          <button onClick={() => removeRow(i)} className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button onClick={addRow} className="pe-btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 mt-3">
              <Plus size={13} /> Dodaj pomiar
            </button>
          </>
        )}

        {verdict !== null && (
          <div className="mt-4 p-3 rounded-lg text-sm flex items-start gap-2"
            style={verdict ? { background: "#3B8C631A", color: "#2C6B4A" } : { background: "#C6433A1A", color: "#A2352C" }}>
            {verdict ? <Check size={16} className="shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="shrink-0 mt-0.5" />}
            <span>
              {verdict
                ? "Wynik pozytywny — wszystkie zmierzone wartości mieszczą się w przyjętym kryterium."
                : "Wynik negatywny — co najmniej jedna wartość nie spełnia kryterium. Sprawdź pozycje oznaczone jako negatywne."}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 text-xs text-slate-600 py-1" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#C1793F" }} />
        Kryteria oceny są wartościami domyślnymi i można je edytować — dobór właściwego kryterium zależy od układu
        sieci, rodzaju obwodu i warunków środowiskowych. Wskazane punkty normy mają charakter orientacyjny —
        numeracja bywa zmieniana między wydaniami, więc przed użyciem protokołu zweryfikuj ją wobec aktualnie
        obowiązującej edycji normy. Protokół pomiarowy jest ważny wyłącznie po podpisaniu przez osobę posiadającą
        aktualne uprawnienia, wykonującą pomiary przyrządem z ważnym świadectwem wzorcowania.
      </div>
    </div>
  );
}

function DesignTab({
  elements, walls, roomShapes, setDraft, commitSnapshot, undo, redo, canUndo, canRedo,
  floors, setFloors, activeFloor, setActiveFloor, bgImages, setBgImages,
  scales = {}, setScales = () => {}, circuits, cableRoutes = [], goTo,
}) {
  const [showCables, setShowCables] = useState(true); // podgląd tras przewodów na planie
  const [activeType, setActiveType] = useState("gniazdko");
  const [dedicated, setDedicated] = useState(false);
  const [toolMode, setToolMode] = useState("zaznacz"); // zaznacz | pan | elementy | sciany | pomieszczenie
  const [iconScale, setIconScale] = useState(1);
  const [sidebarTab, setSidebarTab] = useState("elementy"); // elementy | pomieszczenia
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // domyślnie zwinięty — plan ma być głównym elementem
  const [drawingRoomPoints, setDrawingRoomPoints] = useState([]); // punkty rysowanego właśnie wielokąta pomieszczenia
  const [pendingRoomPoints, setPendingRoomPoints] = useState(null); // ukończony wielokąt czekający na nazwę (modal)
  const [pendingRoomName, setPendingRoomName] = useState("");
  const [addingFloor, setAddingFloor] = useState(false); // modal nazywania nowej kondygnacji
  const [newFloorName, setNewFloorName] = useState("");
  const [confirmRemoveFloorId, setConfirmRemoveFloorId] = useState(null); // modal potwierdzenia usunięcia kondygnacji z zawartością
  const [hoverPoint, setHoverPoint] = useState(null); // pozycja kursora na planie — podgląd na żywo przy rysowaniu ścian/pomieszczeń
  const [calibPoints, setCalibPoints] = useState([]);  // dwa punkty odcinka kalibracyjnego
  const [calibLen, setCalibLen] = useState("");        // podana długość rzeczywista [m]
  const [showZones, setShowZones] = useState(true);    // podgląd stref ochronnych w łazience

  // Każdy typ z wariantami ma WŁASNY licznik gangów — zmiana jednego nie wpływa na drugi.
  const [gangsByType, setGangsByType] = useState({});

  function gangsForType(t) {
    if (!VARIANTS_FOR[t]) return 1;
    return gangsByType[t] || 1;
  }

  function setGangsFor(t, n) {
    setGangsByType((g) => ({ ...g, [t]: n }));
  }

  // Biblioteka: akordeon (jedna sekcja rozwinięta naraz, żeby nie zajmować całego panelu) + szukajka.
  // Domyślnie otwarta jest sekcja zawierająca aktualnie wybrany typ elementu.
  const [openSection, setOpenSection] = useState(
    () => ELEMENT_SECTIONS.find((s) => s.items.some((i) => i.key === activeType))?.title || ELEMENT_SECTIONS[0].title
  );
  const [librarySearch, setLibrarySearch] = useState("");
  const searchQuery = librarySearch.trim().toLowerCase();
  const visibleSections = searchQuery
    ? ELEMENT_SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) =>
          ELEMENT_TYPES[i.key].label.toLowerCase().includes(searchQuery) ||
          (LIB_SUBTITLES[i.key] || "").toLowerCase().includes(searchQuery)
        ),
      })).filter((s) => s.items.length > 0)
    : ELEMENT_SECTIONS;

  // Wykrywa, w którym narysowanym pomieszczeniu (wielokącie) na bieżącej kondygnacji leży punkt.
  // Brak trafienia -> generyczna etykieta, żeby element zawsze miał jakieś "pomieszczenie" do grupowania.
  function detectRoomName(p) {
    const here = roomShapes.filter((r) => r.floor === activeFloor);
    for (const r of here) {
      if (pointInPolygon(p, r.points)) return r.name;
    }
    return NO_ROOM;
  }

  // Klik w bibliotece: dodaje element na środek aktualnego widoku planu i od razu go zaznacza,
  // żeby można było go od razu przeciągnąć w docelowe miejsce. Pomieszczenie wykrywane jest
  // automatycznie na podstawie tego, gdzie na planie znajduje się ten punkt.
  function placeFromLibrary(type) {
    setActiveType(type);
    const sec = ELEMENT_SECTIONS.find((s) => s.items.some((i) => i.key === type));
    if (sec) setOpenSection(sec.title);
    if (librarySearch) setLibrarySearch("");
    if (toolMode !== "elementy") setToolMode("elementy");
    let x = viewBox.x + viewBox.w / 2;
    let y = viewBox.y + viewBox.h / 2;
    if (snapOn) { x = snap(x, GRID); y = snap(y, GRID); }
    const p = { x: clampNum(x, 0, 1000), y: clampNum(y, 0, 700) };
    const newEl = {
      id: uid(), type, x: p.x, y: p.y, room: detectRoomName(p), floor: activeFloor,
      dedicated: type === "gniazdko" ? dedicated : false, note: type === "gniazdko" && dedicated ? "AGD" : "",
      gangs: gangsForType(type),
    };
    setDraft((d) => ({ ...d, elements: [...d.elements, newEl] }));
    setSelected({ kind: "el", id: newEl.id });
  }
  const [snapOn, setSnapOn] = useState(false); // domyślnie wyłączone — przeciąganie ma być płynne, bez "skakania"
  const [viewBox, setViewBox] = useState(VB_DEFAULT);
  const [selected, setSelected] = useState(null); // { kind:'el'|'wall', id }
  const [multiSelected, setMultiSelected] = useState([]); // id-y elementów zaznaczonych "lassem" w trybie Zaznacz
  const [marqueeRect, setMarqueeRect] = useState(null); // {x,y,w,h} podgląd zaznaczanego prostokąta
  const [drawingWall, setDrawingWall] = useState([]); // punkty rysowanej właśnie ściany
  const [contextMenu, setContextMenu] = useState(null); // { x, y, elId } — współrzędne ekranu (menu PPM)
  const [editingId, setEditingId] = useState(null); // id elementu otwartego w oknie edycji

  const dragRef = useRef(null); // { id, startSnapshot }
  const panRef = useRef(null);  // { startX, startY, vb }
  const marqueeRef = useRef(null); // { x0, y0 } — punkt startowy rysowanego prostokąta zaznaczenia
  const contextMenuRef = useRef(null); // kontener menu kontekstowego — wykluczony z globalnego "odznacz poza planem"
  const canvasPanelRef = useRef(null); // cały panel płótna (paski narzędzi + svg) — jw., przyciski w nim same zarządzają zaznaczeniem
  const svgRef = useRef(null);
  const fileRef = useRef(null);

  const floorElements = elements.filter((e) => e.floor === activeFloor);
  const floorWalls = walls.filter((w) => w.floor === activeFloor);
  const bgImage = bgImages[activeFloor];

  const roomNameSuggestions = useMemo(() => {
    const s = new Set(elements.map((e) => e.room));
    roomShapes.forEach((r) => s.add(r.name));
    ["Salon", "Kuchnia", "Łazienka", "Sypialnia", "Korytarz"].forEach((r) => s.add(r));
    return Array.from(s);
  }, [elements, roomShapes]);

  // usuwanie zaznaczenia klawiszem Delete/Backspace — obsługuje zarówno pojedynczy element/ścianę, jak i zaznaczenie wielokrotne
  useEffect(() => {
    function onKey(e) {
      if ((e.key === "Delete" || e.key === "Backspace") && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
        if (multiSelected.length > 0) {
          e.preventDefault();
          setDraft((d) => ({ ...d, elements: d.elements.filter((x) => !multiSelected.includes(x.id)) }));
          setMultiSelected([]);
          return;
        }
        if (selected) {
          e.preventDefault();
          if (selected.kind === "el") setDraft((d) => ({ ...d, elements: d.elements.filter((x) => x.id !== selected.id) }));
          else setDraft((d) => ({ ...d, walls: d.walls.filter((x) => x.id !== selected.id) }));
          setSelected(null);
        }
      }
      if (e.key === "Escape") { setDrawingWall([]); setDrawingRoomPoints([]); setMultiSelected([]); setMarqueeRect(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, multiSelected, setDraft]);

  // Odznaczenie elementu/ściany po kliknięciu GDZIEKOLWIEK poza planem (biblioteka, pasek, prawy panel, modale).
  // Faza "capture" gwarantuje, że zadziała nawet jeśli klikany element wewnątrz (np. przycisk w menu) zatrzyma propagację.
  // WYJĄTEK: kliknięcia wewnątrz menu kontekstowego ORAZ w obrębie całego panelu płótna (pasek narzędzi, pasek
  // ścian/hint, samo svg) są celowo pomijane — inaczej ten listener (odpalany w fazie capture, czyli PRZED obsługą
  // kliknięcia przycisku) czyścił multiSelected/selected zanim przycisk (np. "Usuń zaznaczone" w pasku nad
  // płótnem, poza <svg>) zdążył z nich skorzystać, przez co usuwanie po prostu nie działało.
  useEffect(() => {
    function onDocClick(e) {
      if (contextMenuRef.current && contextMenuRef.current.contains(e.target)) return;
      if (canvasPanelRef.current && canvasPanelRef.current.contains(e.target)) return;
      setSelected(null);
      setMultiSelected([]);
    }
    window.addEventListener("click", onDocClick, true);
    return () => window.removeEventListener("click", onDocClick, true);
  }, []);

  // Zmiana trybu pracy czyści zaznaczenie wielokrotne, żeby nie "wisiało" niezauważone w innym trybie.
  useEffect(() => { setMultiSelected([]); setHoverPoint(null); }, [toolMode]);

  // Przybliżanie planu: Ctrl+scroll (lub Cmd na Mac / gest pinch trackpada, który przeglądarka
  // raportuje jako wheel + ctrlKey). Podpięte natywnie (nie przez onWheel), bo React domyślnie
  // rejestruje zdarzenia "wheel" jako pasywne, przez co preventDefault() nie zablokowałby
  // przewijania strony w tle.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function onWheel(evt) {
      if (!evt.ctrlKey && !evt.metaKey) return; // bez Ctrl — zwykłe przewijanie strony, nic nie robimy
      evt.preventDefault();
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const pt = svg.createSVGPoint();
      pt.x = evt.clientX;
      pt.y = evt.clientY;
      const cursor = pt.matrixTransform(ctm.inverse()); // punkt pod kursorem w układzie planu
      const factor = evt.deltaY < 0 ? 0.9 : 1.1; // scroll "w górę" = przybliż, "w dół" = oddal
      setViewBox((v) => {
        const w = clampNum(v.w * factor, 150, 2200);
        const h = w * 0.7;
        // zachowaj punkt pod kursorem w tym samym miejscu na ekranie po zmianie skali
        const ratioX = (cursor.x - v.x) / v.w;
        const ratioY = (cursor.y - v.y) / v.h;
        return { x: cursor.x - ratioX * w, y: cursor.y - ratioY * h, w, h };
      });
    }
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  // Dokładna konwersja pikseli ekranu na współrzędne SVG przez macierz CTM.
  // (Prosty rachunek na rect.width/rect.height był błędny, bo viewBox 1000×700
  // jest dopasowywany do kontenera z zachowaniem proporcji — zostawia to puste
  // pasy z boku/góry, których poprzedni wzór nie uwzględniał, stąd przesunięte punkty.)
  function toSvgPoint(evt, opts = {}) {
    const svg = svgRef.current;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    let x = p.x, y = p.y;
    const applySnap = opts.snap !== false && snapOn;
    if (applySnap) { x = snap(x, GRID); y = snap(y, GRID); }
    return { x: clampNum(x, 0, 1000), y: clampNum(y, 0, 700) };
  }

  function handleCanvasClick(evt) {
    if (toolMode === "pan" || toolMode === "zaznacz") return;

    if (toolMode === "sciany") {
      setDrawingWall((pts) => [...pts, toSvgPoint(evt, { snap: false })]);
      return;
    }

    if (toolMode === "pomieszczenie") {
      setDrawingRoomPoints((pts) => [...pts, toSvgPoint(evt, { snap: false })]);
      return;
    }

    if (toolMode === "skala") {
      const p2 = toSvgPoint(evt, { snap: false });
      setCalibPoints((pts) => (pts.length >= 2 ? [p2] : [...pts, p2]));
      return;
    }

    const p = toSvgPoint(evt);

    // tryb: elementy
    setSelected(null);
    setDraft((d) => ({
      ...d,
      elements: [...d.elements, {
        id: uid(), type: activeType, x: p.x, y: p.y, room: detectRoomName(p), floor: activeFloor,
        dedicated: activeType === "gniazdko" ? dedicated : false, note: dedicated ? "AGD" : "",
        gangs: gangsForType(activeType),
      }],
    }));
  }

  function finishWall() {
    if (drawingWall.length < 2) { setDrawingWall([]); return; }
    setDraft((d) => ({ ...d, walls: [...d.walls, { id: uid(), floor: activeFloor, points: drawingWall }] }));
    setDrawingWall([]);
  }

  // window.prompt() bywa zablokowany w tym środowisku podglądu (sandbox iframe bez zgody na
  // natywne okna dialogowe) — wtedy zwraca null NATYCHMIAST, bez pokazania czegokolwiek, więc
  // wielokąt "znikał" bez żadnego dialogu. Zamiast tego pytamy o nazwę własnym, zwykłym modalem.
  function finishRoom() {
    if (drawingRoomPoints.length < 3) { setDrawingRoomPoints([]); return; }
    const countHere = roomShapes.filter((r) => r.floor === activeFloor).length;
    setPendingRoomPoints(drawingRoomPoints);
    setPendingRoomName(`Pomieszczenie ${countHere + 1}`);
    setDrawingRoomPoints([]);
  }

  /* --- kalibracja skali planu --- */
  const mpu = scaleOf(scales, activeFloor); // metrów na jednostkę planu (null = brak kalibracji)

  function applyCalibration() {
    const meters = parseFloat(String(calibLen).replace(",", "."));
    if (!(meters > 0) || calibPoints.length < 2) return;
    const units = Math.hypot(calibPoints[1].x - calibPoints[0].x, calibPoints[1].y - calibPoints[0].y);
    if (!(units > 0)) return;
    setScales({ ...scales, [activeFloor]: meters / units });
    setCalibPoints([]); setCalibLen("");
    setToolMode("zaznacz");
  }

  function clearCalibration() {
    const next = { ...scales };
    delete next[activeFloor];
    setScales(next);
    setCalibPoints([]); setCalibLen("");
  }

  function savePendingRoom() {
    if (!pendingRoomPoints) return;
    const countHere = roomShapes.filter((r) => r.floor === activeFloor).length;
    const color = ROOM_COLORS[countHere % ROOM_COLORS.length];
    const name = pendingRoomName.trim() || `Pomieszczenie ${countHere + 1}`;
    setDraft((d) => ({ ...d, roomShapes: [...(d.roomShapes || []), { id: uid(), floor: activeFloor, name, color, points: pendingRoomPoints }] }));
    setPendingRoomPoints(null);
    setPendingRoomName("");
  }

  function cancelPendingRoom() {
    setPendingRoomPoints(null);
    setPendingRoomName("");
  }

  // Zmiana nazwy pomieszczenia synchronizuje też już postawione w nim elementy (żeby obwody
  // i grupowanie w prawym panelu nie "zgubiły" ich pod starą nazwą).
  function renameRoomShape(id, newName) {
    setDraft((d) => {
      const room = (d.roomShapes || []).find((r) => r.id === id);
      if (!room) return d;
      return {
        ...d,
        roomShapes: d.roomShapes.map((r) => (r.id === id ? { ...r, name: newName } : r)),
        elements: d.elements.map((e) => (e.floor === room.floor && e.room === room.name ? { ...e, room: newName } : e)),
      };
    });
  }

  function recolorRoomShape(id) {
    setDraft((d) => {
      const idx = (d.roomShapes || []).findIndex((r) => r.id === id);
      if (idx === -1) return d;
      const nextColor = ROOM_COLORS[(ROOM_COLORS.indexOf(d.roomShapes[idx].color) + 1) % ROOM_COLORS.length];
      const roomShapesNext = [...d.roomShapes];
      roomShapesNext[idx] = { ...roomShapesNext[idx], color: nextColor };
      return { ...d, roomShapes: roomShapesNext };
    });
  }

  function deleteRoomShape(id) {
    setDraft((d) => ({ ...d, roomShapes: (d.roomShapes || []).filter((r) => r.id !== id) }));
  }

  function handleElementMouseDown(evt, el) {
    if (evt.button !== 0) return; // lewy = zaznacz/przeciągnij element; prawy = menu kontekstowe; środkowy = przesuwanie widoku (obsłuży canvas)
    evt.stopPropagation();
    if (toolMode === "zaznacz") {
      if (evt.shiftKey) {
        setMultiSelected((ids) => (ids.includes(el.id) ? ids.filter((x) => x !== el.id) : [...ids, el.id]));
        return; // Shift = tylko dobieranie do zaznaczenia, bez startu przeciągania
      }
      // przeciąganie: jeśli element jest częścią większego zaznaczenia — przesuwamy całą grupę,
      // w przeciwnym razie zaznaczamy i przeciągamy tylko jego
      const group = multiSelected.includes(el.id) && multiSelected.length > 1 ? multiSelected : [el.id];
      if (group.length === 1) setMultiSelected(group);
      setSelected(null);
      const startPositions = {};
      elements.forEach((e) => { if (group.includes(e.id)) startPositions[e.id] = { x: e.x, y: e.y }; });
      dragRef.current = { ids: group, startPositions, startMouse: toSvgPoint(evt), startSnapshot: { elements, walls } };
      return;
    }
    if (toolMode !== "elementy") return;
    setSelected({ kind: "el", id: el.id });
    dragRef.current = { id: el.id, startSnapshot: { elements, walls } };
  }

  function handleElementContextMenu(evt, el) {
    evt.preventDefault();
    evt.stopPropagation();
    if (multiSelected.includes(el.id) && multiSelected.length > 1) {
      setContextMenu({ x: evt.clientX, y: evt.clientY, elId: el.id, multi: true });
      return;
    }
    setSelected({ kind: "el", id: el.id });
    setMultiSelected([]);
    setContextMenu({ x: evt.clientX, y: evt.clientY, elId: el.id, multi: false });
  }

  function deleteElement(id) {
    setDraft((d) => ({ ...d, elements: d.elements.filter((e) => e.id !== id) }));
    setSelected((s) => (s?.kind === "el" && s.id === id ? null : s));
    setContextMenu(null);
  }

  function deleteWall(id) {
    setDraft((d) => ({ ...d, walls: d.walls.filter((w) => w.id !== id) }));
    setSelected((s) => (s?.kind === "wall" && s.id === id ? null : s));
    setContextMenu(null);
  }

  function deleteMultiSelected() {
    setDraft((d) => ({ ...d, elements: d.elements.filter((e) => !multiSelected.includes(e.id)) }));
    setMultiSelected([]);
    setContextMenu(null);
  }

  function handleCanvasMouseMove(evt) {
    if (panRef.current) {
      const svg = svgRef.current;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const scale = 1 / ctm.a; // jednostki SVG na piksel ekranu (bez rotacji/skosu)
      const dxPx = evt.clientX - panRef.current.lastX;
      const dyPx = evt.clientY - panRef.current.lastY;
      panRef.current.lastX = evt.clientX;
      panRef.current.lastY = evt.clientY;
      setViewBox((v) => ({ ...v, x: v.x - dxPx * scale, y: v.y - dyPx * scale }));
      return;
    }
    if (marqueeRef.current) {
      const p = toSvgPoint(evt);
      const { x0, y0 } = marqueeRef.current;
      setMarqueeRect({ x: Math.min(x0, p.x), y: Math.min(y0, p.y), w: Math.abs(p.x - x0), h: Math.abs(p.y - y0) });
      return;
    }
    if (dragRef.current) {
      const p = toSvgPoint(evt, { snap: false }); // płynnie, bez skakania — siatka (jeśli włączona) zadziała dopiero przy puszczeniu
      if (dragRef.current.ids) {
        // przeciąganie grupy — każdy element przesuwa się o tę samą deltę względem swojej pozycji startowej
        const { ids, startPositions, startMouse } = dragRef.current;
        const dx = p.x - startMouse.x, dy = p.y - startMouse.y;
        setDraft((d) => ({
          ...d,
          elements: d.elements.map((e) => {
            const sp = startPositions[e.id];
            if (!sp) return e;
            return { ...e, x: clampNum(sp.x + dx, 0, 1000), y: clampNum(sp.y + dy, 0, 700) };
          }),
        }), { commit: false });
      } else {
        const id = dragRef.current.id;
        setDraft((d) => ({ ...d, elements: d.elements.map((e) => e.id === id ? { ...e, x: p.x, y: p.y } : e) }), { commit: false });
      }
      return;
    }
    if (toolMode === "sciany" || toolMode === "pomieszczenie" || toolMode === "skala") {
      setHoverPoint(toSvgPoint(evt, { snap: false }));
    }
  }

  function handleCanvasMouseUp() {
    if (marqueeRef.current) {
      const r = marqueeRect;
      marqueeRef.current = null;
      setMarqueeRect(null);
      if (r && (r.w > 4 || r.h > 4)) {
        const ids = floorElements.filter((e) => e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h).map((e) => e.id);
        setMultiSelected((prev) => Array.from(new Set([...prev, ...ids])));
      } else {
        setMultiSelected([]); // sam klik na pustym miejscu, bez przeciągnięcia — odznacz
      }
    }
    if (dragRef.current) {
      if (snapOn) {
        const ids = dragRef.current.ids || [dragRef.current.id];
        setDraft((d) => ({
          ...d,
          elements: d.elements.map((e) => ids.includes(e.id) ? { ...e, x: snap(e.x, GRID), y: snap(e.y, GRID) } : e),
        }), { commit: false });
      }
      commitSnapshot(dragRef.current.startSnapshot);
      dragRef.current = null;
    }
    panRef.current = null;
  }

  function handleCanvasMouseDown(evt) {
    if (evt.button === 1) { // środkowy przycisk (kółko) — przesuwanie widoku niezależnie od aktywnego trybu
      evt.preventDefault();
      panRef.current = { lastX: evt.clientX, lastY: evt.clientY };
      return;
    }
    if (toolMode === "pan") { panRef.current = { lastX: evt.clientX, lastY: evt.clientY }; return; }
    if (toolMode === "zaznacz" && evt.button === 0) {
      const p = toSvgPoint(evt);
      marqueeRef.current = { x0: p.x, y0: p.y };
      setMarqueeRect({ x: p.x, y: p.y, w: 0, h: 0 });
    }
  }

  function zoomBy(factor) {
    setViewBox((v) => {
      const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
      const w = clampNum(v.w * factor, 150, 2200);
      const h = w * 0.7;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    });
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBgImages((b) => ({ ...b, [activeFloor]: reader.result }));
    reader.readAsDataURL(file);
  }

  function addFloor() {
    setNewFloorName(`Piętro ${floors.length}`);
    setAddingFloor(true);
  }

  function confirmAddFloor() {
    const name = newFloorName.trim() || `Piętro ${floors.length}`;
    const id = uid();
    setFloors((f) => [...f, { id, name }]);
    setActiveFloor(id);
    setAddingFloor(false);
    setNewFloorName("");
  }

  function removeFloor(id) {
    if (floors.length <= 1) return;
    const hasContent = elements.some((e) => e.floor === id) || walls.some((w) => w.floor === id);
    if (hasContent) { setConfirmRemoveFloorId(id); return; }
    doRemoveFloor(id);
  }

  function doRemoveFloor(id) {
    setDraft((d) => ({
      elements: d.elements.filter((e) => e.floor !== id),
      walls: d.walls.filter((w) => w.floor !== id),
      roomShapes: (d.roomShapes || []).filter((r) => r.floor !== id),
    }));
    setFloors((f) => f.filter((x) => x.id !== id));
    setBgImages((b) => { const c = { ...b }; delete c[id]; return c; });
    if (activeFloor === id) setActiveFloor(floors.find((f) => f.id !== id)?.id);
  }

  const hasPanelOnPlan = useMemo(() => elements.some((e) => e.type === "rozdzielnica"), [elements]);

  const zones = useMemo(() => computeSanitaryZones(elements, activeFloor, mpu), [elements, activeFloor, mpu]);
  const zoneIssues = useMemo(() => checkSanitaryZones(elements, zones, activeFloor), [elements, zones, activeFloor]);
  const completeness = useMemo(() => checkCompleteness(elements, roomShapes, floors), [elements, roomShapes, floors]);
  const zoneBadIds = useMemo(() => new Set(zoneIssues.map((i) => i.elId)), [zoneIssues]);

  // powierzchnie pomieszczeń na bieżącej kondygnacji (dostępne po kalibracji skali)
  const roomAreas = useMemo(() => {
    if (!mpu) return {};
    const out = {};
    roomShapes.filter((r) => r.floor === activeFloor).forEach((r) => {
      out[r.id] = polygonArea(r.points) * mpu * mpu;
    });
    return out;
  }, [roomShapes, activeFloor, mpu]);

  const totalCableM = useMemo(() => {
    if (!mpu) return null;
    return cableRoutes.reduce((a, r) => a + r.lengthUnits, 0) * mpu;
  }, [cableRoutes, mpu]);

  const routeLenByType = useMemo(() => {
    const acc = { gniazdko: 0, oswietlenie: 0, roleta: 0 };
    cableRoutes.forEach((r) => { if (acc[r.type] !== undefined) acc[r.type] += r.lengthUnits; });
    return { gniazdko: Math.round(acc.gniazdko), oswietlenie: Math.round(acc.oswietlenie), roleta: Math.round(acc.roleta) };
  }, [cableRoutes]);

  const grouped = useMemo(() => {
    const g = {};
    floorElements.forEach((e) => { (g[e.room] ||= []).push(e); });
    return g;
  }, [floorElements]);

  const cursorClass = toolMode === "pan" ? "cursor-grab" : toolMode === "zaznacz" ? "cursor-default" : "cursor-crosshair";

  return (
    <div className="grid lg:grid-cols-[1fr_260px] gap-5">
      {/* panel projektowy — biblioteka i płótno w jednym spójnym bloku */}
      <div className="pe-card overflow-hidden">
        {/* pasek górny: kondygnacje + rozmiar ikon */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b flex-wrap" style={{ borderColor: "#DCE2E8" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 text-[10px] tracking-widest font-semibold mr-1 text-slate-400">
              <Layers size={12} /> PIĘTRA
            </span>
            {floors.map((f) => (
              <button key={f.id} onClick={() => setActiveFloor(f.id)}
                className="px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide"
                style={activeFloor === f.id ? { background: "#2D5A8C", color: "#fff" } : { background: "#fff", color: "#64748B", border: "1px solid #DCE2E8" }}>
                {f.name.toUpperCase()}
              </button>
            ))}
            <button onClick={addFloor} className="px-3 py-1.5 rounded-md text-[11px] font-semibold tracking-wide flex items-center gap-1"
              style={{ background: "#fff", color: "#64748B", border: "1px dashed #DCE2E8" }}>
              <Plus size={12} /> DODAJ
            </button>
            {floors.length > 1 && (
              <button onClick={() => removeFloor(activeFloor)} className="p-1.5 rounded-md text-slate-400 hover:text-red-500" title="Usuń bieżącą kondygnację">
                <Trash2 size={13} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] tracking-widest font-semibold text-slate-400">
              <ZoomIn size={12} /> ROZMIAR IKON
            </span>
            <input type="range" min="0.6" max="1.8" step="0.1" value={iconScale}
              onChange={(e) => setIconScale(Number(e.target.value))} className="w-24" style={{ accentColor: "#2D5A8C" }} />
          </div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap" }}>
          {/* biblioteka elementów / pomieszczenia — zwijalny panel, żeby płótno mogło być głównym elementem */}
          {sidebarCollapsed ? (
            <div className="border-r flex flex-col items-center gap-2 p-2"
              style={{ width: 52, flexShrink: 0, flexGrow: 0, borderColor: "#DCE2E8" }}>
              <button onClick={() => setSidebarCollapsed(false)} title="Pokaż bibliotekę elementów / pomieszczenia" className="pe-btn-ghost p-2 shrink-0">
                <ChevronRight size={16} />
              </button>
              <button onClick={() => { setSidebarCollapsed(false); setSidebarTab("elementy"); setToolMode("elementy"); }} title={`Aktywny element: ${ELEMENT_TYPES[activeType].label}`}
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${ELEMENT_TYPES[activeType].color}` }}>
                <GlyphPreview type={activeType} color={ELEMENT_TYPES[activeType].color} gangs={gangsForType(activeType)} />
              </button>
            </div>
          ) : (
          <div className="border-b md:border-b-0 md:border-r p-4" style={{ width: 256, minWidth: 256, flexShrink: 0, flexGrow: 0, borderColor: "#DCE2E8" }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex gap-1 p-1 rounded-lg flex-1" style={{ background: "#EEF1F4" }}>
                <button onClick={() => setSidebarTab("elementy")}
                  className="flex-1 text-[11px] font-medium py-1.5 rounded-md"
                  style={sidebarTab === "elementy" ? { background: "#fff", color: "#16202B", boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: "#64748B" }}>
                  Elementy
                </button>
                <button onClick={() => setSidebarTab("pomieszczenia")}
                  className="flex-1 text-[11px] font-medium py-1.5 rounded-md"
                  style={sidebarTab === "pomieszczenia" ? { background: "#fff", color: "#16202B", boxShadow: "0 1px 2px rgba(0,0,0,.06)" } : { color: "#64748B" }}>
                  Pomieszczenia
                </button>
              </div>
              <button onClick={() => setSidebarCollapsed(true)} title="Zwiń panel" className="pe-btn-ghost p-1.5 shrink-0">
                <ChevronRight size={14} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>

            {sidebarTab === "elementy" ? (
              <>
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={librarySearch} onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Szukaj elementu…" className="pe-input text-xs w-full pl-7 pr-6"
                  />
                  {librarySearch && (
                    <button onClick={() => setLibrarySearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={13} />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 md:max-h-[420px] md:overflow-y-auto pe-scroll pr-1">
                  {visibleSections.map((section) => {
                    const isOpen = !!searchQuery || openSection === section.title;
                    return (
                      <div key={section.title} className="rounded-lg border" style={{ borderColor: "#EEF1F4" }}>
                        <button type="button" onClick={() => setOpenSection((s) => (s === section.title ? null : section.title))}
                          className="w-full flex items-center justify-between px-2.5 py-2 text-left">
                          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{section.title}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">{section.items.length}</span>
                            {isOpen ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                          </span>
                        </button>

                        {isOpen && (
                          <div className="space-y-1 px-2 pb-2">
                            {section.items.map((item) => {
                              const def = ELEMENT_TYPES[item.key];
                              const isActive = activeType === item.key;
                              const g = gangsForType(item.key);
                              return (
                                <div key={item.key}>
                                  <button type="button" onClick={() => placeFromLibrary(item.key)}
                                    className="w-full flex items-center gap-2 p-1.5 rounded-md text-left"
                                    style={{ background: isActive ? def.color + "10" : "#fff", border: `1px solid ${isActive ? def.color : "#DCE2E8"}` }}>
                                    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ border: `1.5px solid ${def.color}` }}>
                                      <GlyphPreview type={item.key} color={def.color} gangs={g} />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="text-[11.5px] font-medium truncate" style={{ color: "#16202B" }}>{def.label}</div>
                                      {isActive && <div className="text-[10px] text-slate-500 truncate">{libSubtitle(item.key, g)}</div>}
                                    </div>
                                  </button>

                                  {isActive && item.variants && item.variants.length > 1 && (
                                    <div className={`grid gap-1 mt-1 px-0.5 ${item.variants.length > 2 ? "grid-cols-6" : "grid-cols-2"}`}>
                                      {item.variants.map((n) => {
                                        const sel = g === n;
                                        return (
                                          <button key={n} type="button" onClick={() => setGangsFor(item.key, n)}
                                            className="text-[11px] py-1 rounded-md"
                                            style={sel ? { background: def.color + "16", color: def.color, border: `1px solid ${def.color}` } : { background: "#fff", color: "#64748B", border: "1px solid #DCE2E8" }}>
                                            {n}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {isActive && item.key === "gniazdko" && (
                                    <label className="flex items-center gap-2 mt-1.5 px-0.5 text-[11px] text-slate-600">
                                      <input type="checkbox" checked={dedicated} onChange={(e) => setDedicated(e.target.checked)} />
                                      Dedykowane (AGD)
                                    </label>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {visibleSections.length === 0 && (
                    <p className="text-xs text-slate-400 px-1 py-2">Brak wyników dla „{librarySearch}”.</p>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t text-[11px] leading-relaxed text-slate-400" style={{ borderColor: "#EEF1F4" }}>
                  Kliknij, aby dodać do centrum planu, następnie przeciągnij. Pomieszczenie dobiera się
                  automatycznie na podstawie tego, gdzie na planie element wyląduje — narysuj je w zakładce „Pomieszczenia”.
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={() => setToolMode((m) => (m === "pomieszczenie" ? "zaznacz" : "pomieszczenie"))}
                  className={`w-full text-xs py-2 rounded-md flex items-center justify-center gap-1.5 mb-3 ${toolMode === "pomieszczenie" ? "" : "pe-btn-copper"}`}
                  style={toolMode === "pomieszczenie" ? { background: "#C1793F14", color: "#A9652F", border: "1px solid #C1793F" } : {}}>
                  <PenLine size={14} /> {toolMode === "pomieszczenie" ? "Rysowanie… kliknij plan" : "Zaznacz pomieszczenie"}
                </button>

                {toolMode === "pomieszczenie" && (
                  <div className="flex gap-1.5 mb-3">
                    <button onClick={finishRoom} disabled={drawingRoomPoints.length < 3} className="pe-btn-ghost flex-1 text-[11px] py-1.5">Zakończ (zamknij wielokąt)</button>
                    <button onClick={() => setDrawingRoomPoints([])} disabled={!drawingRoomPoints.length} className="pe-btn-ghost text-[11px] px-2 py-1.5">Anuluj</button>
                  </div>
                )}

                <p className="text-[11px] leading-relaxed text-slate-400 mb-3">
                  Klikaj punkty narożników na planie, aby narysować obrys pomieszczenia (min. 3 punkty), potem zakończ.
                  Elementy postawione wewnątrz automatycznie dostaną tę nazwę pomieszczenia.
                </p>

                <div className="space-y-1.5">
                  {roomShapes.filter((r) => r.floor === activeFloor).length === 0 && (
                    <p className="text-xs text-slate-400 px-1 py-2">Brak narysowanych pomieszczeń na tej kondygnacji.</p>
                  )}
                  {roomShapes.filter((r) => r.floor === activeFloor).map((r) => (
                    <div key={r.id} className="flex items-center gap-2 p-1.5 rounded-md" style={{ border: "1px solid #EEF1F4" }}>
                      <button onClick={() => recolorRoomShape(r.id)} title="Zmień kolor"
                        className="w-5 h-5 rounded-full shrink-0" style={{ background: r.color, border: "1.5px solid #fff", boxShadow: "0 0 0 1px " + r.color }} />
                      <input value={r.name} onChange={(e) => renameRoomShape(r.id, e.target.value)}
                        className="flex-1 text-[12px] min-w-0 bg-transparent outline-none" style={{ color: "#16202B" }} />
                      <button onClick={() => deleteRoomShape(r.id)} className="text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* plan/szkic */}
            <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EEF1F4" }}>
              <div className="text-[10px] tracking-widest font-semibold mb-2 text-slate-400">PLAN / SZKIC</div>
              <button onClick={() => fileRef.current?.click()} className="pe-btn-ghost w-full text-xs py-2 flex items-center justify-center gap-1.5">
                <Upload size={14} /> Wgraj rzut / zdjęcie
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
              {bgImage && (
                <button onClick={() => setBgImages((b) => { const c = { ...b }; delete c[activeFloor]; return c; })} className="text-[11px] mt-1.5 text-red-500 hover:underline">
                  Usuń podkład
                </button>
              )}
            </div>
          </div>
          )}

          {/* płótno */}
          <div style={{ flex: "1 1 480px", minWidth: 320 }} ref={canvasPanelRef}>
            <div className="flex items-center justify-between px-4 py-2 border-b flex-wrap gap-2" style={{ borderColor: "#DCE2E8" }}>
              <div className="flex items-center gap-1">
                {[
                  { key: "zaznacz", label: "Zaznacz", Icon: SelectIcon },
                  { key: "pan", label: "Przesuń", Icon: Hand },
                  { key: "elementy", label: "Elementy", Icon: MousePointer2 },
                  { key: "sciany", label: "Ściany", Icon: PenLine },
                  { key: "skala", label: "Kalibracja skali", Icon: RulerIcon },
                ].map((m) => (
                  <button key={m.key} onClick={() => setToolMode(m.key)} title={m.label}
                    className={`pe-btn-ghost p-1.5 ${toolMode === m.key ? "active" : ""}`}>
                    <m.Icon size={14} />
                  </button>
                ))}
                <span className="w-px h-4 mx-1" style={{ background: "#DCE2E8" }} />
                <button onClick={() => setSnapOn((s) => !s)} title="Przyciągaj do siatki"
                  className={`pe-btn-ghost p-1.5 ${snapOn ? "active" : ""}`}>
                  <SnapIcon size={14} />
                </button>
                <button onClick={() => setShowCables((s) => !s)} title="Pokaż trasy przewodów"
                  className={`pe-btn-ghost p-1.5 ${showCables ? "active" : ""}`}>
                  <CableIcon size={14} />
                </button>
                <button onClick={() => setShowZones((z) => !z)} title="Pokaż strefy ochronne w łazience"
                  className={`pe-btn-ghost p-1.5 ${showZones ? "active" : ""}`}>
                  <ZoneIcon size={14} />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {multiSelected.length > 0 && (
                  <>
                    <button onClick={deleteMultiSelected} className="text-[11px] px-2 py-1.5 rounded-md flex items-center gap-1" style={{ background: "#C6433A14", color: "#C6433A", border: "1px solid #C6433A44" }}>
                      <Trash2 size={13} /> Usuń ({multiSelected.length})
                    </button>
                    <span className="w-px h-4 mx-0.5" style={{ background: "#DCE2E8" }} />
                  </>
                )}
                <button onClick={undo} disabled={!canUndo} className="pe-btn-ghost p-1.5"><Undo2 size={14} /></button>
                <button onClick={redo} disabled={!canRedo} className="pe-btn-ghost p-1.5"><Redo2 size={14} /></button>
                <button onClick={() => zoomBy(0.8)} className="pe-btn-ghost p-1.5" title="Przybliż (albo Ctrl + scroll)"><ZoomIn size={14} /></button>
                <button onClick={() => zoomBy(1.25)} className="pe-btn-ghost p-1.5" title="Oddal (albo Ctrl + scroll)"><ZoomOut size={14} /></button>
                <button onClick={() => setViewBox(VB_DEFAULT)} className="pe-btn-ghost text-[11px] px-2 py-1.5">100%</button>
                <span className="pe-chip pe-tag-blue">{floorElements.length} elementów</span>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-1.5 border-b flex-wrap gap-2" style={{ borderColor: "#EEF1F4", background: "#F7F9FB" }}>
              <div className="text-[11px] text-slate-500">
                {toolMode === "sciany" ? "Klikaj, aby dodawać punkty ściany (bez przyciągania do siatki — dokładnie pod kursorem)."
                  : toolMode === "pomieszczenie" ? "Klikaj narożniki pomieszczenia, min. 3 punkty (bez przyciągania do siatki), potem zakończ."
                  : toolMode === "skala" ? "Kliknij dwa punkty na planie o znanej odległości (np. ścianę), a następnie podaj jej długość w metrach."
                  : toolMode === "pan" ? "Przeciągnij, aby przesunąć widok."
                  : toolMode === "zaznacz" ? "Kliknij element lub ścianę (Shift = dodaj/usuń z zaznaczenia elementów) albo przeciągnij po planie, aby zaznaczyć wiele naraz. PPM = menu z opcją usuwania."
                  : `Kliknij, aby postawić „${ELEMENT_TYPES[activeType].label}”. Przeciągnij, aby przesunąć.`}
                {" "}<span className="text-slate-400">· środkowy przycisk myszy = przesuń, Ctrl+scroll = zoom</span>
                {mpu && <span className="ml-1 pe-chip pe-tag-green">skala ustawiona</span>}
              </div>

              {toolMode === "sciany" && (
                <div className="flex gap-1.5">
                  <button onClick={finishWall} disabled={drawingWall.length < 2} className="pe-btn-copper text-[11px] px-2 py-1">Zakończ ścianę</button>
                  <button onClick={() => setDrawingWall([])} disabled={!drawingWall.length} className="pe-btn-ghost text-[11px] px-2 py-1">Anuluj</button>
                </div>
              )}
              {toolMode === "pomieszczenie" && (
                <div className="flex gap-1.5">
                  <button onClick={finishRoom} disabled={drawingRoomPoints.length < 3} className="pe-btn-copper text-[11px] px-2 py-1">Zakończ pomieszczenie</button>
                  <button onClick={() => setDrawingRoomPoints([])} disabled={!drawingRoomPoints.length} className="pe-btn-ghost text-[11px] px-2 py-1">Anuluj</button>
                </div>
              )}
              {toolMode === "skala" && (
                <div className="flex gap-1.5 items-center flex-wrap">
                  <span className="text-[11px] text-slate-500">
                    {calibPoints.length < 2 ? `Zaznacz punkt ${calibPoints.length + 1} z 2` : "Długość odcinka:"}
                  </span>
                  {calibPoints.length === 2 && (
                    <>
                      <input type="number" step="0.01" min="0.1" value={calibLen} placeholder="np. 4"
                        onChange={(e) => setCalibLen(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") applyCalibration(); }}
                        className="pe-input text-[11px] w-20 py-1 pe-mono" />
                      <span className="text-[11px] text-slate-500">m</span>
                      <button onClick={applyCalibration} disabled={!(parseFloat(calibLen) > 0)}
                        className="pe-btn-copper text-[11px] px-2 py-1">Ustaw skalę</button>
                    </>
                  )}
                  <button onClick={() => { setCalibPoints([]); setCalibLen(""); }} disabled={!calibPoints.length}
                    className="pe-btn-ghost text-[11px] px-2 py-1">Wyczyść</button>
                  {mpu && <button onClick={clearCalibration} className="pe-btn-ghost text-[11px] px-2 py-1">Usuń kalibrację</button>}
                </div>
              )}
            </div>
            <svg
              ref={svgRef}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              className={`w-full pe-grid-paper ${cursorClass}`}
              style={{ display: "block", height: 560 }}
              onClick={handleCanvasClick}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={(evt) => { handleCanvasMouseUp(evt); setHoverPoint(null); }}
            >
              {bgImage && <image href={bgImage} x="0" y="0" width="1000" height="700" preserveAspectRatio="xMidYMid slice" opacity="0.5" />}

              {/* pomieszczenia (wielokąty) */}
              {roomShapes.filter((r) => r.floor === activeFloor).map((r) => {
                const cx = r.points.reduce((a, p) => a + p.x, 0) / r.points.length;
                const cy = r.points.reduce((a, p) => a + p.y, 0) / r.points.length;
                return (
                  <g key={r.id}>
                    <polygon points={r.points.map((p) => `${p.x},${p.y}`).join(" ")} fill={r.color + "1F"} stroke={r.color} strokeWidth="1.5" />
                    <text x={cx} y={cy} textAnchor="middle" fontSize="12" fontWeight="700" fill={r.color}
                      stroke="#fff" strokeWidth="3" paintOrder="stroke" style={{ pointerEvents: "none" }}>
                      {r.name}
                    </text>
                  </g>
                );
              })}
              {drawingRoomPoints.length > 0 && (
                <polygon points={drawingRoomPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="#C1793F1F" stroke="#C1793F" strokeWidth="2" strokeDasharray="6 4" />
              )}
              {drawingRoomPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#C1793F" />)}
              {toolMode === "pomieszczenie" && hoverPoint && drawingRoomPoints.length > 0 && (
                <>
                  <line x1={drawingRoomPoints[drawingRoomPoints.length - 1].x} y1={drawingRoomPoints[drawingRoomPoints.length - 1].y}
                    x2={hoverPoint.x} y2={hoverPoint.y} stroke="#C1793F" strokeWidth="2" strokeDasharray="4 3" opacity="0.7" />
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4" fill="none" stroke="#C1793F" strokeWidth="1.5" />
                </>
              )}
              {pendingRoomPoints && (
                <polygon points={pendingRoomPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="#C1793F26" stroke="#C1793F" strokeWidth="2" />
              )}

              {/* ściany */}
              {floorWalls.map((w) => {
                const isWallSel = selected?.kind === "wall" && selected.id === w.id;
                const wallClickable = toolMode === "elementy" || toolMode === "zaznacz";
                return (
                  <g key={w.id}>
                    {/* niewidzialny, szerszy obszar klikalny — samą 5px linię trudno trafić kursorem */}
                    {wallClickable && (
                      <polyline
                        points={w.points.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none" stroke="transparent" strokeWidth="22"
                        strokeLinecap="round" strokeLinejoin="round"
                        onClick={(ev) => { ev.stopPropagation(); setSelected({ kind: "wall", id: w.id }); }}
                        onContextMenu={(ev) => { ev.preventDefault(); ev.stopPropagation(); setSelected({ kind: "wall", id: w.id }); setContextMenu({ x: ev.clientX, y: ev.clientY, elId: w.id, kind: "wall" }); }}
                        style={{ cursor: "pointer" }}
                      />
                    )}
                    <polyline
                      points={w.points.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke={isWallSel ? "#C1793F" : "#16202B"}
                      strokeWidth={isWallSel ? 7 : 5}
                      strokeLinecap="round" strokeLinejoin="round"
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })}
              {drawingWall.length > 0 && (
                <polyline points={drawingWall.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#2D5A8C" strokeWidth="4" strokeDasharray="6 4" strokeLinecap="round" />
              )}
              {drawingWall.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#2D5A8C" />)}
              {toolMode === "sciany" && hoverPoint && drawingWall.length > 0 && (
                <>
                  <line x1={drawingWall[drawingWall.length - 1].x} y1={drawingWall[drawingWall.length - 1].y}
                    x2={hoverPoint.x} y2={hoverPoint.y} stroke="#2D5A8C" strokeWidth="3" strokeDasharray="4 3" opacity="0.7" />
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4" fill="none" stroke="#2D5A8C" strokeWidth="1.5" />
                </>
              )}

              {/* strefy ochronne w łazience (wokół wanny/prysznica/umywalki) */}
              {showZones && zones.map((z) => (
                <g key={z.id} style={{ pointerEvents: "none" }}>
                  <circle cx={z.x} cy={z.y} r={z.r2} fill="#C1793F14" stroke="#C1793F" strokeWidth="1" strokeDasharray="5 4" />
                  {z.r1 > 0 && (
                    <circle cx={z.x} cy={z.y} r={z.r1} fill="#C6433A1A" stroke="#C6433A" strokeWidth="1.2" strokeDasharray="3 3" />
                  )}
                  <text x={z.x} y={z.y - z.r2 - 4} textAnchor="middle" fontSize="8" fill="#8A5526"
                    stroke="#fff" strokeWidth="2.5" paintOrder="stroke">
                    strefy: {z.label}{!z.calibrated ? " (bez skali)" : ""}
                  </text>
                </g>
              ))}

              {/* trasy przewodów (od rozdzielnicy do odbiorników, wg obwodów) */}
              {showCables && cableRoutes.filter((r) => r.floor === activeFloor).map((r) => (
                <polyline key={r.id}
                  points={r.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none" stroke={colorForCircuit(r.type)} strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
                  strokeDasharray={r.type === "oswietlenie" ? "7 4" : undefined}
                  style={{ pointerEvents: "none" }}>
                  <title>{`${r.circuitName} — ${r.cable}`}</title>
                </polyline>
              ))}

              {/* elementy */}
              {floorElements.map((e) => {
                const def = ELEMENT_TYPES[e.type];
                const isSel = (selected?.kind === "el" && selected.id === e.id) || multiSelected.includes(e.id);
                return (
                  <g key={e.id} transform={`translate(${e.x},${e.y}) scale(${iconScale})`}
                    onMouseDown={(ev) => handleElementMouseDown(ev, e)}
                    onContextMenu={(ev) => handleElementContextMenu(ev, e)}
                    onClick={(ev) => { ev.stopPropagation(); if (toolMode === "elementy") setSelected({ kind: "el", id: e.id }); }}
                    style={{ cursor: toolMode === "elementy" || toolMode === "zaznacz" ? "grab" : "default" }}>
                    {isSel && <SelectionOutline type={e.type} gangs={e.gangs} />}
                    {zoneBadIds.has(e.id) && (() => {
                      const b = glyphBoxSize(e.type, e.gangs);
                      return <rect x={-b.w / 2 - 7} y={-b.h / 2 - 7} width={b.w + 14} height={b.h + 14} rx="8"
                        fill="none" stroke="#C6433A" strokeWidth="2.5" />;
                    })()}
                    <ElementGlyph type={e.type} color={def.color} gangs={e.gangs} />
                    {e.dedicated && (() => { const b = glyphBoxSize(e.type, e.gangs); return <rect x={-b.w / 2 - 4} y={-b.h / 2 - 4} width={b.w + 8} height={b.h + 8} rx="6" fill="none" stroke={def.color} strokeDasharray="2 2" />; })()}
                    <title>{`${def.label}${e.gangs > 1 ? ` ×${e.gangs}` : ""} — ${e.room}`}</title>
                  </g>
                );
              })}

              {/* odcinek kalibracyjny skali */}
              {calibPoints.length > 0 && (
                <g style={{ pointerEvents: "none" }}>
                  {calibPoints.length === 2 && (
                    <line x1={calibPoints[0].x} y1={calibPoints[0].y} x2={calibPoints[1].x} y2={calibPoints[1].y}
                      stroke="#3B8C63" strokeWidth="2.5" strokeLinecap="round" />
                  )}
                  {calibPoints.length === 1 && hoverPoint && toolMode === "skala" && (
                    <line x1={calibPoints[0].x} y1={calibPoints[0].y} x2={hoverPoint.x} y2={hoverPoint.y}
                      stroke="#3B8C63" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
                  )}
                  {calibPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5" fill="#3B8C63" />)}
                </g>
              )}

              {/* prostokąt zaznaczenia (marquee) w trybie "Zaznacz" */}
              {marqueeRect && (
                <rect x={marqueeRect.x} y={marqueeRect.y} width={marqueeRect.w} height={marqueeRect.h}
                  fill="#2D5A8C14" stroke="#2D5A8C" strokeWidth="1.2" strokeDasharray="4 3" />
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* prawy panel */}
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-32px)] lg:overflow-y-auto pe-scroll">
        <div className="pe-card p-4 max-h-[380px] overflow-auto pe-scroll">
          <h3 className="pe-display text-sm mb-3">Elementy — {floors.find((f) => f.id === activeFloor)?.name}</h3>
          {Object.keys(grouped).length === 0 && <p className="text-xs text-slate-400">Brak elementów — zacznij klikać na planie.</p>}
          {Object.entries(grouped).map(([room, list]) => (
            <div key={room} className="mb-3">
              <div className="text-xs font-semibold text-slate-600 mb-1">{room}</div>
              <div className="space-y-1">
                {list.map((e) => {
                  const def = ELEMENT_TYPES[e.type];
                  return (
                    <div key={e.id} className="flex items-center justify-between text-xs pe-input py-1">
                      <span className="flex items-center gap-1.5" style={{ color: def.color }}>
                        <GlyphPreview type={e.type} color={def.color} gangs={e.gangs} />
                        {def.label}{(e.type === "wlacznik" || e.type === "gniazdko") && e.gangs > 1 ? ` ×${e.gangs}` : ""}{e.dedicated ? " (AGD)" : ""}
                      </span>
                      <button onClick={() => setDraft((d) => ({ ...d, elements: d.elements.filter((x) => x.id !== e.id) }))} className="text-slate-400 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="pe-card p-4">
          <h3 className="pe-display text-sm mb-2">Wygenerowane obwody</h3>
          <p className="text-xs text-slate-500 mb-3">{circuits.length} obwodów na podstawie elementów ze wszystkich kondygnacji.</p>
          <button onClick={() => goTo("rozdzielnica")} className="pe-btn-copper w-full text-sm py-2 flex items-center justify-center gap-1.5">
            Zobacz rozdzielnicę <ChevronRight size={15} />
          </button>
        </div>

        {/* kontrola kompletności — podpowiada, czego zwykle nie należy pomijać */}
        <div className="pe-card p-4">
          <h3 className="pe-display text-sm mb-1">Sprawdzenie projektu</h3>
          {(() => {
            const all = [
              ...zoneIssues.map((z) => ({ level: z.level, room: "Strefy w łazience", msg: `${z.title} — ${z.detail}` })),
              ...completeness,
            ];
            const errors = all.filter((i) => i.level === "error").length;
            const warns = all.filter((i) => i.level === "warn").length;

            if (all.length === 0) {
              return (
                <div className="p-3 rounded-lg text-xs flex items-start gap-2" style={{ background: "#3B8C631A", color: "#2C6B4A" }}>
                  <Check size={15} className="shrink-0 mt-0.5" />
                  <span>Nie znaleziono braków. Pamiętaj, że projekt i tak wymaga weryfikacji przez uprawnionego elektryka.</span>
                </div>
              );
            }
            return (
              <>
                <div className="flex gap-2 mb-2 text-[11px]">
                  {errors > 0 && <span className="pe-chip" style={{ background: "#C6433A1A", color: "#A2352C" }}>{errors} do poprawy</span>}
                  {warns > 0 && <span className="pe-chip" style={{ background: "#C1793F1A", color: "#8A5526" }}>{warns} zaleceń</span>}
                </div>
                <div className="space-y-1.5 max-h-72 overflow-y-auto pe-scroll pr-1">
                  {all
                    .sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.level] - { error: 0, warn: 1, info: 2 }[b.level]))
                    .map((i, idx) => {
                      const st = i.level === "error" ? { bg: "#C6433A12", fg: "#A2352C" }
                        : i.level === "warn" ? { bg: "#C1793F12", fg: "#8A5526" }
                        : { bg: "#2D5A8C10", fg: "#2D5A8C" };
                      return (
                        <div key={idx} className="p-2 rounded-md" style={{ background: st.bg }}>
                          <div className="text-[11px] font-semibold" style={{ color: st.fg }}>{i.room}</div>
                          <div className="text-[11px] text-slate-600 leading-snug mt-0.5">{i.msg}</div>
                        </div>
                      );
                    })}
                </div>
              </>
            );
          })()}
        </div>

        {/* skala planu */}
        <div className="pe-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="pe-display text-sm">Skala planu</h3>
            <button onClick={() => setToolMode("skala")} className={`pe-btn-ghost text-[11px] px-2 py-1 ${toolMode === "skala" ? "active" : ""}`}>
              {mpu ? "Zmień" : "Ustaw"}
            </button>
          </div>
          {mpu ? (
            <div className="space-y-1.5 text-[11px]">
              <div className="flex justify-between"><span className="text-slate-500">Przelicznik</span>
                <span className="pe-mono">{(mpu * 100).toFixed(2)} cm / jedn.</span></div>
              {totalCableM !== null && (
                <div className="flex justify-between"><span className="text-slate-500">Długość przewodów</span>
                  <span className="pe-mono" style={{ color: "#C1793F" }}>{totalCableM.toFixed(1)} m</span></div>
              )}
              {Object.keys(roomAreas).length > 0 && (
                <div className="pt-1.5 mt-1.5 border-t" style={{ borderColor: "#EEF1F4" }}>
                  <div className="text-slate-500 mb-1">Powierzchnie pomieszczeń</div>
                  {roomShapes.filter((r) => r.floor === activeFloor).map((r) => (
                    <div key={r.id} className="flex justify-between">
                      <span className="truncate" style={{ color: r.color }}>{r.name}</span>
                      <span className="pe-mono text-slate-600">{roomAreas[r.id]?.toFixed(1)} m²</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Plan nie jest wyskalowany — długości przewodów w kosztorysie są tylko szacunkiem.
              Wskaż na rzucie odcinek o znanej długości (np. ścianę), aby uzyskać rzeczywiste metry i powierzchnie.
            </p>
          )}
        </div>

        <div className="pe-card p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="pe-display text-sm">Trasy przewodów</h3>
            <button onClick={() => setShowCables((s) => !s)} className={`pe-btn-ghost text-[11px] px-2 py-1 ${showCables ? "active" : ""}`}>
              {showCables ? "Ukryj" : "Pokaż"}
            </button>
          </div>

          {!hasPanelOnPlan ? (
            <div className="text-xs p-2.5 rounded-md flex gap-2" style={{ background: "#C1793F14", color: "#8A5526" }}>
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              Postaw na planie element <strong>Rozdzielnica</strong> (sekcja „Rozdział”) — od niej poprowadzą się przewody.
            </div>
          ) : (
            <>
              <div className="space-y-1 text-[11px] text-slate-600 mb-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: "#2D5A8C" }} /> gniazda</span>
                  <span className="pe-mono">{routeLenByType.gniazdko} j.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="w-4 h-0.5 rounded" style={{ background: "#C1793F", backgroundImage: "repeating-linear-gradient(90deg,#C1793F 0 3px,transparent 3px 5px)" }} /> oświetlenie
                  </span>
                  <span className="pe-mono">{routeLenByType.oswietlenie} j.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: "#7C5CBF" }} /> rolety</span>
                  <span className="pe-mono">{routeLenByType.roleta} j.</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Odbiorniki w obwodzie łączone są szeregowo (loop-in), trasy prowadzone ortogonalnie.
                Długości w jednostkach planu — orientacyjne, do weryfikacji na rzucie w skali.
              </p>
            </>
          )}
        </div>
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(ev) => { ev.preventDefault(); setContextMenu(null); }} />
          <div
            ref={contextMenuRef}
            className="pe-card fixed z-50 py-1 text-sm overflow-hidden"
            style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 170 }}
          >
            {contextMenu.multi ? (
              <>
                <div className="px-3 py-1.5 text-[11px] text-slate-400">Zaznaczono {multiSelected.length}</div>
                <button
                  onClick={deleteMultiSelected}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-red-50"
                  style={{ color: "#C6433A" }}>
                  <Trash2 size={14} /> Usuń zaznaczone
                </button>
              </>
            ) : contextMenu.kind === "wall" ? (
              <button
                onClick={() => deleteWall(contextMenu.elId)}
                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-red-50"
                style={{ color: "#C6433A" }}>
                <Trash2 size={14} /> Usuń ścianę
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setEditingId(contextMenu.elId); setContextMenu(null); }}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-50"
                  style={{ color: "#16202B" }}>
                  <Pencil size={14} /> Edytuj
                </button>
                <button
                  onClick={() => deleteElement(contextMenu.elId)}
                  className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-red-50"
                  style={{ color: "#C6433A" }}>
                  <Trash2 size={14} /> Usuń
                </button>
              </>
            )}
          </div>
        </>
      )}

      {editingId && elements.find((e) => e.id === editingId) && (
        <EditElementModal
          element={elements.find((e) => e.id === editingId)}
          rooms={roomNameSuggestions}
          onClose={() => setEditingId(null)}
          onSave={(updates) => {
            setDraft((d) => ({ ...d, elements: d.elements.map((x) => x.id === editingId ? { ...x, ...updates } : x) }));
            setEditingId(null);
          }}
        />
      )}

      {pendingRoomPoints && (
        <Modal title="Nazwij pomieszczenie" onClose={cancelPendingRoom} width={320}>
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500 mb-1">Nazwa</div>
              <input autoFocus value={pendingRoomName} onChange={(e) => setPendingRoomName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") savePendingRoom(); }}
                className="pe-input text-sm w-full" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={cancelPendingRoom} className="pe-btn-ghost flex-1 text-sm py-2">Anuluj</button>
              <button type="button" onClick={savePendingRoom} className="pe-btn-copper flex-1 text-sm py-2">Zapisz</button>
            </div>
          </div>
        </Modal>
      )}

      {addingFloor && (
        <Modal title="Nazwij kondygnację" onClose={() => setAddingFloor(false)} width={320}>
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs text-slate-500 mb-1">Nazwa</div>
              <input autoFocus value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") confirmAddFloor(); }}
                className="pe-input text-sm w-full" />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAddingFloor(false)} className="pe-btn-ghost flex-1 text-sm py-2">Anuluj</button>
              <button type="button" onClick={confirmAddFloor} className="pe-btn-copper flex-1 text-sm py-2">Dodaj</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmRemoveFloorId && (
        <Modal title="Usunąć kondygnację?" onClose={() => setConfirmRemoveFloorId(null)} width={340}>
          <p className="text-sm text-slate-600 mb-4">Ta kondygnacja zawiera elementy, ściany lub pomieszczenia — zostaną usunięte razem z nią. Tej operacji nie da się cofnąć.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setConfirmRemoveFloorId(null)} className="pe-btn-ghost flex-1 text-sm py-2">Anuluj</button>
            <button type="button" onClick={() => { doRemoveFloor(confirmRemoveFloorId); setConfirmRemoveFloorId(null); }}
              className="flex-1 text-sm py-2 rounded-md" style={{ background: "#C6433A", color: "#fff" }}>
              Usuń
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Okno edycji elementu — pozwala zmienić element na inny typ z listy oraz dopasować jego ustawienia. */
function EditElementModal({ element, rooms, onClose, onSave }) {
  const [type, setType] = useState(element.type);
  const [room, setRoom] = useState(element.room);
  const [gangs, setGangs] = useState(element.gangs || 1);
  const [dedicated, setDedicated] = useState(!!element.dedicated);

  const variants = VARIANTS_FOR[type];
  const maxGangs = variants ? variants[variants.length - 1] : 1;

  useEffect(() => {
    setGangs((g) => Math.max(1, Math.min(maxGangs, g)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  function handleSave() {
    onSave({
      type,
      room: room || "Salon",
      gangs: variants ? gangs : 1,
      dedicated: type === "gniazdko" ? dedicated : false,
      note: type === "gniazdko" && dedicated ? "AGD" : "",
    });
  }

  return (
    <Modal title="Edytuj element" onClose={onClose} width={400}>
      <div className="space-y-3">
        <div>
          <div className="text-xs text-slate-500 mb-1.5">Zmień na</div>
          <div className="space-y-3 max-h-64 overflow-y-auto pe-scroll pr-1">
            {ELEMENT_SECTIONS.map((section) => (
              <div key={section.title}>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-1">{section.title}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {section.items.map((item) => {
                    const def = ELEMENT_TYPES[item.key];
                    const active = type === item.key;
                    return (
                      <button type="button" key={item.key} onClick={() => setType(item.key)}
                        className="pe-btn-ghost p-2 flex items-center gap-2 text-[11px] text-left"
                        style={active ? { borderColor: def.color, background: def.color + "14", color: def.color } : {}}>
                        <GlyphPreview type={item.key} color={def.color} gangs={active ? gangs : 1} />
                        <span className="truncate">{def.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {variants && variants.length > 1 && (
          <div>
            <div className="text-xs text-slate-500 mb-1.5">
              {type.startsWith("wlacznik") ? "Liczba klawiszy" : "Liczba gniazd w ramce"}
            </div>
            <div className={`grid gap-1 ${variants.length > 2 ? "grid-cols-6" : "grid-cols-2"}`}>
              {variants.map((n) => (
                <button type="button" key={n} onClick={() => setGangs(n)}
                  className={`pe-btn-ghost text-xs py-1.5 ${gangs === n ? "active" : ""}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        {type === "gniazdko" && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={dedicated} onChange={(e) => setDedicated(e.target.checked)} />
            Gniazdo dedykowane (AGD, własny obwód)
          </label>
        )}

        <label className="block">
          <div className="text-xs text-slate-500 mb-1">Pomieszczenie</div>
          <input
            list="rooms-edit" value={room} onChange={(e) => setRoom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            className="pe-input text-sm w-full"
          />
          <datalist id="rooms-edit">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
        </label>

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="pe-btn-ghost flex-1 text-sm py-2">Anuluj</button>
          <button type="button" onClick={handleSave} className="pe-btn-copper flex-1 text-sm py-2">Zapisz</button>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================================
   ROZDZIELNICA ELEKTRYCZNA
   ========================================================================= */

/* =========================================================================
   ROZDZIELNICA ELEKTRYCZNA — widok frontu (rzut czołowy)
   Wymiary odwzorowują standard modułowy: 1 moduł = 17,5 mm szerokości, wysokość
   aparatu 85 mm, szyna DIN TH35. Rząd rozdzielnicy domowej to najczęściej 12 modułów.
   ========================================================================= */

const MOD_W = 34;        // szerokość 1 modułu (px na rysunku) ~ 17,5 mm
const DEV_H = 150;       // wysokość aparatu ~ 85 mm

const PHASE_COLORS = { L1: "#C6433A", L2: "#16202B", L3: "#7C5CBF", "3F": "#2D5A8C", "": "#94A3B8" };

/* Katalog aparatów, które można dołożyć ręcznie — poza tymi wynikającymi z obwodów.
   prefix wg IEC 81346: F — zabezpieczenia, Q — łączniki, K — styczniki/przekaźniki,
   T — zasilacze/transformatory, P — sygnalizacja. */
const MANUAL_DEVICE_TYPES = [
  { key: "mcb", label: "Wyłącznik nadprądowy", prefix: "F", modules: 1, poles: "1P", defLabel: "B16", accent: "#2D5A8C", ratings: ["B6", "B10", "B13", "B16", "B20", "B25", "C10", "C16", "C20", "C25", "C32"] },
  { key: "rcbo", label: "Wyłącznik różnicowo-nadprądowy", prefix: "F", modules: 2, poles: "1P+N", defLabel: "B16/30mA", accent: "#C1793F", ratings: ["B10/30mA", "B16/30mA", "B20/30mA", "C16/30mA"] },
  { key: "rcd", label: "Wyłącznik różnicowoprądowy", prefix: "FI", modules: 2, poles: "2P", defLabel: "40A/30mA", accent: "#C1793F", ratings: ["25A/30mA", "40A/30mA", "63A/30mA", "40A/300mA", "63A/300mA"] },
  { key: "ovr", label: "Czujnik zaniku / zaniku fazy (CZF)", prefix: "F", modules: 1, poles: "3P", defLabel: "CZF", accent: "#C6433A", ratings: ["CZF", "CZN", "OVR"] },
  { key: "ppoz", label: "Rozłącznik przeciwpożarowy", prefix: "Q", modules: 2, poles: "4P", defLabel: "63A", accent: "#C6433A", ratings: ["40A", "63A", "80A", "100A"] },
  { key: "stycznik", label: "Stycznik modułowy", prefix: "K", modules: 2, poles: "2P", defLabel: "20A", accent: "#3B8C63", ratings: ["16A", "20A", "25A", "40A", "63A"] },
  { key: "przekaznik", label: "Przekaźnik bistabilny", prefix: "K", modules: 1, poles: "1P", defLabel: "16A", accent: "#3B8C63", ratings: ["10A", "16A"] },
  { key: "zasilacz", label: "Zasilacz modułowy", prefix: "T", modules: 2, poles: "—", defLabel: "12V DC", accent: "#0F8A9E", ratings: ["12V DC", "24V DC", "24V AC"] },
  { key: "lampka", label: "Lampka sygnalizacyjna", prefix: "P", modules: 1, poles: "3P", defLabel: "L1-L2-L3", accent: "#B98C2F", ratings: ["L1-L2-L3", "230V"] },
  { key: "blank", label: "Rezerwa (zaślepka)", prefix: "", modules: 1, poles: "—", defLabel: "", accent: "#94A3B8", ratings: [""] },
];

/* Analiza selektywności i poprawności doboru zabezpieczeń.
   Zwraca listę spostrzeżeń: błędy (do poprawy), ostrzeżenia i informacje.
   Reguły są uproszczone — pełną selektywność zwarciową potwierdzają wyłącznie
   tabele producenta dla konkretnej pary aparatów. */
function computeSelectivity(devices, mainRating, supply3f, spdEnabled) {
  const out = [];
  const mcbs = devices.filter((d) => d.kind === "mcb" && ratedCurrent(d.label) > 0);
  const rcds = devices.filter((d) => d.kind === "rcd");

  // 1. żaden obwód nie może mieć zabezpieczenia większego niż rozłącznik główny
  const tooBig = mcbs.filter((d) => ratedCurrent(d.label) > mainRating);
  if (tooBig.length) {
    out.push({
      level: "error",
      title: "Zabezpieczenie obwodu większe niż rozłącznik główny",
      detail: `${tooBig.map((d) => `${d.tag} (${d.label})`).join(", ")} — przy zwarciu zadziała aparat główny i pozbawi zasilania cały budynek. Zwiększ rozłącznik główny (obecnie ${mainRating} A) albo zmniejsz zabezpieczenie obwodu.`,
    });
  }

  // 2. stopniowanie prądów — dla selektywności przeciążeniowej przyjmuje się krotność ok. 1,6
  const weak = mcbs.filter((d) => {
    const i = ratedCurrent(d.label);
    return i <= mainRating && mainRating / i < 1.6;
  });
  if (weak.length) {
    out.push({
      level: "warn",
      title: "Zbyt małe stopniowanie względem aparatu głównego",
      detail: `${weak.map((d) => `${d.tag} (${d.label})`).join(", ")} — stosunek prądów poniżej 1,6. Przy przeciążeniu może zadziałać aparat główny zamiast obwodowego. Zalecane In(główny) ≥ 1,6 × In(obwodu).`,
    });
  }

  // 3. różnicówka musi być zabezpieczona nadprądowo — jej prąd znamionowy nie może być
  //    mniejszy niż prąd aparatu, który ją chroni
  const weakRcd = rcds.filter((d) => ratedCurrent(d.label) > 0 && ratedCurrent(d.label) < mainRating);
  if (weakRcd.length) {
    out.push({
      level: "error",
      title: "Różnicówka niezabezpieczona przed przeciążeniem",
      detail: `${weakRcd.map((d) => `${d.tag} (${d.label})`).join(", ")} — prąd znamionowy mniejszy od rozłącznika głównego (${mainRating} A). Wyłącznik różnicowoprądowy nie ma własnego zabezpieczenia zwarciowego: dobierz go na prąd ≥ ${mainRating} A albo poprzedź osobnym wyłącznikiem nadprądowym.`,
    });
  }

  // 4. liczba obwodów przypadająca na jedną różnicówkę
  const perRcd = {};
  mcbs.forEach((d) => { if (d.rcdTag) perRcd[d.rcdTag] = (perRcd[d.rcdTag] || 0) + 1; });
  const overloaded = Object.entries(perRcd).filter(([, n]) => n > 6);
  if (overloaded.length) {
    out.push({
      level: "warn",
      title: "Dużo obwodów za jedną różnicówką",
      detail: `${overloaded.map(([t, n]) => `${t}: ${n} obwodów`).join(", ")} — prądy upływowe odbiorników sumują się, co grozi przypadkowymi wyłączeniami. Zalecane maks. 6 obwodów na jeden RCD 30 mA.`,
    });
  }

  // 5. selektywność różnicowoprądowa — RCD nadrzędny powinien być typu S
  if (rcds.length > 1) {
    out.push({
      level: "info",
      title: "Selektywność różnicowoprądowa",
      detail: `W rozdzielnicy jest ${rcds.length} wyłączników różnicowoprądowych pracujących równolegle. Jeśli któryś ma być nadrzędny (szeregowo przed pozostałymi), musi być typu S (zwłocznego) i mieć prąd różnicowy co najmniej 3× większy od podrzędnych.`,
    });
  }

  // 6. ogranicznik przepięć
  if (!spdEnabled) {
    out.push({
      level: "warn",
      title: "Brak ogranicznika przepięć",
      detail: "Instalacja nie ma ochrony przepięciowej. Przy zasilaniu napowietrznym lub instalacji odgromowej ochrona przepięciowa jest zalecana, a w wielu przypadkach wymagana.",
    });
  }

  // 7. bilans faz
  if (supply3f) {
    const load = { L1: 0, L2: 0, L3: 0 };
    mcbs.forEach((d) => {
      const i = ratedCurrent(d.label);
      if (d.poles === "3P") { load.L1 += i; load.L2 += i; load.L3 += i; }
      else if (load[d.phase] !== undefined) load[d.phase] += i;
    });
    const spread = Math.max(load.L1, load.L2, load.L3) - Math.min(load.L1, load.L2, load.L3);
    if (spread > 32) {
      out.push({
        level: "warn",
        title: "Nierównomierne obciążenie faz",
        detail: `Różnica między najbardziej i najmniej obciążoną fazą wynosi ${spread} A (L1: ${load.L1} A, L2: ${load.L2} A, L3: ${load.L3} A). Użyj przycisku „Wyrównaj fazy” lub zmień przypisanie obwodów w tabeli.`,
      });
    }
  }

  if (!out.some((o) => o.level === "error" || o.level === "warn")) {
    out.push({ level: "ok", title: "Nie wykryto problemów", detail: "Przyjęte reguły stopniowania i doboru zabezpieczeń są spełnione. Selektywność zwarciową potwierdź tabelami producenta aparatów." });
  }
  return out;
}

/* Katalog aparatów, które można dołożyć ręcznie — nie wynikają z narysowanych obwodów,
   ale realnie znajdują się w rozdzielnicach domowych. */
const EXTRA_DEVICES = [
  { key: "czn", caption: "Przekaźnik nad/podnapięciowy (CZN)", label: "63A", modules: 2, poles: "1P", tagPrefix: "K" },
  { key: "ppoz", caption: "Wyłącznik przeciwpożarowy", label: "63A", modules: 2, poles: "4P", tagPrefix: "Q" },
  { key: "stycznik", caption: "Stycznik modułowy", label: "25A", modules: 2, poles: "2P", tagPrefix: "K" },
  { key: "przekaznik", caption: "Przekaźnik bistabilny", label: "16A", modules: 1, poles: "1P", tagPrefix: "K" },
  { key: "zasilacz", caption: "Zasilacz DIN 12/24 V", label: "DC", modules: 2, poles: "—", tagPrefix: "G" },
  { key: "sterownik", caption: "Programator / sterownik czasowy", label: "T", modules: 2, poles: "—", tagPrefix: "K" },
  { key: "lampki", caption: "Lampki kontrolne faz", label: "LED", modules: 3, poles: "3P", tagPrefix: "H" },
  { key: "gniazdoDin", caption: "Gniazdo serwisowe DIN 230 V", label: "16A", modules: 3, poles: "1P", tagPrefix: "X" },
  { key: "spdT3", caption: "Ogranicznik przepięć typ 3", label: "T3", modules: 1, poles: "1P", tagPrefix: "F" },
  { key: "wylSilnikowy", caption: "Wyłącznik silnikowy", label: "M", modules: 3, poles: "3P", tagPrefix: "Q" },
];

/* Sprawdzenie selektywności i poprawności doboru aparatów.
   Zwraca listę spostrzeżeń — to kontrola pomocnicza, nie zastępuje analizy z kart katalogowych
   producenta (pełna selektywność wynika z charakterystyk czasowo-prądowych, nie z samej krotności). */
function checkSelectivity(devices, mainRating) {
  const out = [];
  const mcbs = devices.filter((d) => d.kind === "mcb");
  const rcds = devices.filter((d) => d.kind === "rcd");
  if (!mcbs.length) return out;

  // 1. selektywność: rozłącznik główny względem największego zabezpieczenia obwodowego
  const maxMcb = Math.max(...mcbs.map((d) => ratedCurrent(d.label)));
  const ratio = maxMcb > 0 ? mainRating / maxMcb : 0;
  if (ratio >= 1.6) {
    out.push({ level: "ok", title: "Selektywność zabezpieczenia głównego",
      text: `Największe zabezpieczenie obwodowe to ${maxMcb} A przy głównym ${mainRating} A (krotność ${ratio.toFixed(1)}×). Warunek orientacyjny (≥1,6×) jest spełniony.` });
  } else {
    out.push({ level: "warn", title: "Brak selektywności zabezpieczenia głównego",
      text: `Największe zabezpieczenie obwodowe to ${maxMcb} A przy głównym ${mainRating} A (krotność ${ratio.toFixed(1)}×). Przy zwarciu w obwodzie może zadziałać zabezpieczenie główne i wyłączyć całą instalację. Zwiększ prąd zabezpieczenia głównego lub zmniejsz obwodowe.` });
  }

  // 2. obciążalność różnicówek — RCD nie ma własnego zabezpieczenia zwarciowego
  rcds.forEach((r) => {
    const group = mcbs.filter((m) => m.rcdTag === r.tag);
    if (!group.length) return;
    const rcdIn = ratedCurrent(r.label);
    const maxIn = Math.max(...group.map((m) => ratedCurrent(m.label)));
    if (maxIn > rcdIn) {
      out.push({ level: "error", title: `${r.tag} — przekroczona obciążalność różnicówki`,
        text: `Za ${r.tag} (${rcdIn} A) pracuje zabezpieczenie ${maxIn} A. Prąd znamionowy wyłącznika różnicowoprądowego musi być nie mniejszy niż prąd zabezpieczenia go chroniącego.` });
    }
    if (group.length > 8) {
      out.push({ level: "warn", title: `${r.tag} — zbyt wiele obwodów`,
        text: `Za ${r.tag} pracuje ${group.length} obwodów. Prądy upływowe odbiorników sumują się — powyżej 6–8 obwodów rosną przypadkowe wyłączenia bez rzeczywistej usterki.` });
    }
  });

  // 3. ochrona przepięciowa
  const hasSpd = devices.some((d) => d.kind === "spd");
  if (!hasSpd) {
    out.push({ level: "warn", title: "Brak ogranicznika przepięć",
      text: "W instalacji nie przewidziano ogranicznika przepięć. W budynkach mieszkalnych ochrona przepięciowa jest dziś standardem, a przy instalacji odgromowej — konieczna (typ 1+2)." });
  } else if (!devices.some((d) => d.kind === "spdFuse")) {
    out.push({ level: "warn", title: "Ogranicznik przepięć bez zabezpieczenia",
      text: "Ogranicznik przepięć wymaga zabezpieczenia nadprądowego (wkładka gG) — chyba że producent dopuszcza pracę bez niego przy odpowiednim zabezpieczeniu przedlicznikowym." });
  }

  // 4. suma zabezpieczeń względem rozłącznika głównego (informacyjnie)
  const sumIn = mcbs.reduce((a, d) => a + ratedCurrent(d.label), 0);
  if (sumIn > mainRating * 3) {
    out.push({ level: "info", title: "Wysoka suma prądów zabezpieczeń",
      text: `Suma prądów znamionowych zabezpieczeń to ${sumIn} A przy głównym ${mainRating} A. To normalne (obwody nie pracują jednocześnie z pełnym obciążeniem), ale warto zweryfikować bilans mocy i moc przyłączeniową.` });
  }

  return out;
}


/* wyciąga prąd znamionowy z oznaczenia typu "B16" / "C25" */
function ratedCurrent(label) {
  const m = String(label || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/* Rozdziela obwody 1-fazowe równomiernie na L1/L2/L3 — obciążenie faz powinno być
   zrównoważone, inaczej rośnie prąd w przewodzie neutralnym i spada jakość zasilania. */
function balancePhases(devices) {
  const load = { L1: 0, L2: 0, L3: 0 };
  return devices.map((d) => {
    if (d.kind !== "mcb" || d.poles !== "1P") return d;
    const target = ["L1", "L2", "L3"].reduce((a, b) => (load[a] <= load[b] ? a : b));
    load[target] += ratedCurrent(d.label);
    return { ...d, phase: target };
  });
}

/* Zamienia obwody na listę aparatów. Oznaczenia wg IEC 81346:
   Q — łączniki (rozłącznik główny), F — zabezpieczenia, FI — różnicowoprądowe. */
function buildPanelDevices(circuits, rcdGroups, opts = {}) {
  const { supply3f = true, spd = "T1+T2", mainRating = 40 } = opts;
  const devices = [];
  const p = supply3f ? "4P" : "2P";
  const mod = supply3f ? 4 : 2;

  devices.push({ kind: "main", tag: "Q1", modules: mod, label: `${mainRating}A`, caption: "Rozłącznik izolacyjny główny", poles: p, phase: supply3f ? "3F" : "L1", key: "main" });

  if (spd !== "brak") {
    devices.push({ kind: "spdFuse", tag: "F0", modules: supply3f ? 3 : 1, label: "gG 63A", caption: "Zabezpieczenie przedlicznikowe SPD", poles: supply3f ? "3P" : "1P", phase: supply3f ? "3F" : "L1", key: "spdFuse" });
    devices.push({ kind: "spd", tag: "F00", modules: mod, label: spd, caption: `Ogranicznik przepięć ${spd}`, poles: p, phase: supply3f ? "3F" : "L1", key: "spd" });
  }

  let mcbNo = 0;
  rcdGroups.forEach((r, gi) => {
    devices.push({
      kind: "rcd", tag: `FI${gi + 1}`, modules: supply3f ? 4 : 2,
      label: supply3f ? "63A" : "40A", poles: supply3f ? "4P" : "2P",
      caption: `Wyłącznik różnicowoprądowy ${r.rating}`, phase: supply3f ? "3F" : "L1",
      key: `rcd-${r.id}`,
    });
    r.circuits.forEach((c) => {
      const threePhase = c.breaker.includes("3-faz.");
      mcbNo += 1;
      devices.push({
        kind: "mcb", tag: `F${mcbNo}`,
        modules: threePhase ? 3 : 1,
        label: c.breaker.replace(" 3-faz.", ""),
        caption: c.name,
        poles: threePhase ? "3P" : "1P",
        phase: threePhase ? "3F" : "",
        type: c.type, cable: c.cable, rcdTag: `FI${gi + 1}`,
        key: `mcb-${c.id}`,
      });
    });
  });

  const withPhases = supply3f ? balancePhases(devices) : devices.map((d) => (d.kind === "mcb" && d.poles === "1P" ? { ...d, phase: "L1" } : d));
  return withPhases.map((d, i) => ({ ...d, uid: `${d.tag}-${i}` }));
}

/* Rozkłada aparaty na rzędy — aparat nie może być „przecięty” między rzędami.
   Zwraca pozycje modułowe, potrzebne też do obsługi przeciągania. */
function layoutPanel(devices, perRow) {
  const rows = [];
  let cur = [], used = 0;
  devices.forEach((d, index) => {
    if (used + d.modules > perRow) { rows.push(cur); cur = []; used = 0; }
    cur.push({ ...d, index, slot: used });
    used += d.modules;
  });
  if (cur.length) rows.push(cur);
  return rows;
}

/* Rzut czołowy pojedynczego aparatu modułowego */
function PanelDevice({ device, x, y, dragging, onMouseDown, onDelete }) {
  const w = device.modules * MOD_W;
  const manualDef = MANUAL_DEVICE_TYPES.find((t) => t.key === device.kind);
  const accent = device.kind === "mcb" ? (device.manual ? "#2D5A8C" : colorForCircuit(device.type))
    : device.kind === "rcd" ? "#C1793F"
    : device.kind === "spd" ? "#3B8C63"
    : device.kind === "spdFuse" ? "#B98C2F"
    : manualDef ? manualDef.accent : "#16202B";
  const deletable = device.kind !== "main" && device.kind !== "blank" && onDelete;

  if (device.kind === "blank") {
    return (
      <g transform={`translate(${x},${y})`} onMouseDown={onMouseDown} style={{ cursor: "grab" }} opacity={dragging ? 0.45 : 1}>
        <rect width={w} height={DEV_H} rx="2" fill="#E9EDF1" stroke="#CBD4DD" strokeWidth="1" />
        <line x1={w * 0.3} y1={DEV_H / 2} x2={w * 0.7} y2={DEV_H / 2} stroke="#B6C1CC" strokeWidth="1.5" />
      </g>
    );
  }

  const leverY = DEV_H * 0.42;
  const isSpd = device.kind === "spd";
  const isFuse = device.kind === "spdFuse";

  return (
    <g transform={`translate(${x},${y})`} opacity={dragging ? 0.45 : 1}
      onMouseDown={onMouseDown} style={{ cursor: "grab" }}>
      {/* oznaczenie aparatu nad korpusem */}
      <text x={w / 2} y={-20} textAnchor="middle" fontSize="12" fontWeight="700" fill="#16202B" className="pe-mono">
        {device.tag}
      </text>
      {/* przycisk usuwania aparatu */}
      {deletable && (
        <g transform={`translate(${w - 9},-24)`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDelete(device.uid); }}
          style={{ cursor: "pointer" }}>
          <circle r="8" fill="#fff" stroke="#C6433A" strokeWidth="1.3" />
          <line x1="-3" y1="-3" x2="3" y2="3" stroke="#C6433A" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="3" y1="-3" x2="-3" y2="3" stroke="#C6433A" strokeWidth="1.5" strokeLinecap="round" />
          <title>Usuń aparat</title>
        </g>
      )}
      {/* pasek fazy */}
      {device.phase && (
        <>
          <rect x={0} y={-14} width={w} height="10" rx="2" fill={PHASE_COLORS[device.phase] + "22"} stroke={PHASE_COLORS[device.phase]} strokeWidth="0.7" />
          <text x={w / 2} y={-6.5} textAnchor="middle" fontSize="7" fontWeight="700" fill={PHASE_COLORS[device.phase]}>
            {device.phase === "3F" ? "L1 L2 L3" : device.phase}
          </text>
        </>
      )}

      <rect width={w} height={DEV_H} rx="2.5" fill="#F7F8FA" stroke="#9AA6B2" strokeWidth="1.2" />
      <rect x="2" y="4" width={w - 4} height="20" rx="1.5" fill="#DDE3E9" stroke="#B6C1CC" strokeWidth="0.8" />
      <rect x="2" y={DEV_H - 24} width={w - 4} height="20" rx="1.5" fill="#DDE3E9" stroke="#B6C1CC" strokeWidth="0.8" />
      {Array.from({ length: device.modules }).map((_, i) => (
        <g key={i}>
          <circle cx={MOD_W * (i + 0.5)} cy="14" r="4.5" fill="#C3CBD4" stroke="#94A0AC" strokeWidth="0.8" />
          <line x1={MOD_W * (i + 0.5) - 3} y1="14" x2={MOD_W * (i + 0.5) + 3} y2="14" stroke="#7E8B98" strokeWidth="1.2" />
          <circle cx={MOD_W * (i + 0.5)} cy={DEV_H - 14} r="4.5" fill="#C3CBD4" stroke="#94A0AC" strokeWidth="0.8" />
          <line x1={MOD_W * (i + 0.5) - 3} y1={DEV_H - 14} x2={MOD_W * (i + 0.5) + 3} y2={DEV_H - 14} stroke="#7E8B98" strokeWidth="1.2" />
        </g>
      ))}

      <rect x="2" y={DEV_H * 0.62} width={w - 4} height="22" rx="1.5" fill="#fff" stroke="#CBD4DD" strokeWidth="0.8" />
      <text x={w / 2} y={DEV_H * 0.62 + 15.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill={accent} className="pe-mono">
        {device.label}
      </text>

      {isSpd ? (
        /* ogranicznik przepięć — wymienne wkłady z okienkiem kontrolnym stanu */
        Array.from({ length: device.modules }).map((_, i) => (
          <g key={i}>
            <rect x={MOD_W * i + 5} y={leverY - 16} width={MOD_W - 10} height="30" rx="2" fill="#3B8C63" opacity="0.16" stroke="#3B8C63" strokeWidth="0.9" />
            <rect x={MOD_W * i + 9} y={leverY - 11} width={MOD_W - 18} height="11" rx="1.5" fill="#3B8C63" />
            <rect x={MOD_W * i + 11} y={leverY + 3} width={MOD_W - 22} height="6" rx="1" fill="#fff" stroke="#3B8C63" strokeWidth="0.6" />
          </g>
        ))
      ) : isFuse ? (
        /* rozłącznik bezpiecznikowy — uchylna pokrywa z wkładką */
        Array.from({ length: device.modules }).map((_, i) => (
          <g key={i}>
            <rect x={MOD_W * i + 5} y={leverY - 16} width={MOD_W - 10} height="30" rx="2" fill="#B98C2F" opacity="0.14" stroke="#B98C2F" strokeWidth="0.9" />
            <circle cx={MOD_W * (i + 0.5)} cy={leverY - 1} r="5" fill="none" stroke="#B98C2F" strokeWidth="1.4" />
            <circle cx={MOD_W * (i + 0.5)} cy={leverY - 1} r="1.8" fill="#B98C2F" />
          </g>
        ))
      ) : (
        <>
          <rect x={w / 2 - 8} y={leverY - 14} width="16" height="26" rx="2" fill="#2B3440" />
          <rect x={w / 2 - 5.5} y={leverY - 11} width="11" height="9" rx="1" fill="#4C5866" />
          <text x={w / 2} y={leverY + 8} textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">I</text>
        </>
      )}

      {device.kind === "rcd" && (
        <>
          <rect x={w - 16} y={leverY - 14} width="12" height="12" rx="1.5" fill="#C6433A" />
          <text x={w - 10} y={leverY - 5} textAnchor="middle" fontSize="6.5" fontWeight="700" fill="#fff">T</text>
        </>
      )}

      <rect x="2" y={DEV_H - 30} width={w - 4} height="4" rx="1" fill={accent} opacity="0.85" />
    </g>
  );
}

/* ---------- Generator PDF legendy rozdzielnicy ----------
   Napisany od zera, bez zewnętrznych bibliotek (jsPDF nie jest w tym środowisku dostępny).
   Polskie znaki: standardowe kodowanie WinAnsi nie zawiera ą/ć/ę/ł/ń/ś/ź/ż, więc font dostaje
   własną tablicę /Differences mapującą kody 128+ na nazwy glifów — dzięki temu w gotowym PDF
   polskie znaki wyświetlają się poprawnie, a nie jako "krzaki". */

const PDF_POLISH = {
  "ą": 128, "ć": 129, "ę": 130, "ł": 131, "ń": 132, "ó": 133, "ś": 134, "ź": 135, "ż": 136,
  "Ą": 137, "Ć": 138, "Ę": 139, "Ł": 140, "Ń": 141, "Ó": 142, "Ś": 143, "Ź": 144, "Ż": 145,
};
const PDF_DIFF_NAMES = [
  "aogonek", "cacute", "eogonek", "lslash", "nacute", "oacute", "sacute", "zacute", "zdotaccent",
  "Aogonek", "Cacute", "Eogonek", "Lslash", "Nacute", "Oacute", "Sacute", "Zacute", "Zdotaccent",
];
const PDF_FALLBACK = { "—": "-", "–": "-", "·": "-", "„": '"', "”": '"', "²": "2", "×": "x", "…": "...", "\u00A0": " ",
  "Ω": "Ohm", "°": "st.", "Δ": "d", "μ": "u", "≤": "<=", "≥": ">=" };

/* Metryki fontów (jednostki/1000) — kody 32..126 wg AFM Helvetiki, następnie 127 (nieużywany)
   i 128..145 dla polskich glifów zdefiniowanych w /Differences.
   Bez tablicy /Widths czytnik nie zna szerokości kodów spoza standardowego kodowania i wstawia
   wartość domyślną — właśnie to powodowało rozjeżdżone odstępy przy polskich znakach. */
const PDF_W_REG = [
  278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,
  278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  278,278,278,469,556,222,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,
  334,260,334,584,
  0, // 127
  556,500,556,222,556,556,500,500,500,   // ą ć ę ł ń ó ś ź ż
  667,722,667,556,722,778,667,611,611,   // Ą Ć Ę Ł Ń Ó Ś Ź Ż
];
const PDF_W_BOLD = [
  278,333,474,556,556,889,722,278,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,
  333,333,584,584,584,611,975,
  722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,
  333,278,333,584,556,278,
  556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,
  389,280,389,584,
  0, // 127
  556,556,556,278,611,611,556,500,500,
  722,722,667,611,722,778,667,611,611,
];

/* Zamienia znak na kod używany w strumieniu PDF (z uwzględnieniem polskich znaków i zamienników) */
function pdfCharCode(ch) {
  if (PDF_POLISH[ch] !== undefined) return PDF_POLISH[ch];
  const code = ch.codePointAt(0);
  if (code >= 32 && code <= 126) return code;
  const fb = PDF_FALLBACK[ch];
  if (fb !== undefined && fb.length === 1) return fb.codePointAt(0);
  return 63; // "?"
}

function pdfCharWidth(code, bold) {
  const table = bold ? PDF_W_BOLD : PDF_W_REG;
  const w = table[code - 32];
  return w === undefined ? 556 : w;
}

/* Szerokość napisu w punktach — pozwala przycinać tekst do realnej szerokości kolumny,
   zamiast zgadywać po liczbie znaków (co przy polskich literach dawało błędne wyniki). */
function pdfTextWidth(str, size, bold) {
  let total = 0;
  for (const ch of String(str)) {
    if (PDF_FALLBACK[ch] !== undefined && PDF_FALLBACK[ch].length > 1) {
      for (const c2 of PDF_FALLBACK[ch]) total += pdfCharWidth(c2.codePointAt(0), bold);
      continue;
    }
    total += pdfCharWidth(pdfCharCode(ch), bold);
  }
  return (total * size) / 1000;
}

function pdfFitText(str, maxWidth, size, bold) {
  if (pdfTextWidth(str, size, bold) <= maxWidth) return str;
  const ell = "..";
  let out = "";
  for (const ch of String(str)) {
    if (pdfTextWidth(out + ch + ell, size, bold) > maxWidth) break;
    out += ch;
  }
  return out + ell;
}

function pdfEscape(str) {
  let out = "";
  for (const ch of String(str)) {
    if (PDF_POLISH[ch] !== undefined) { out += "\\" + PDF_POLISH[ch].toString(8).padStart(3, "0"); continue; }
    if (ch === "(" || ch === ")" || ch === "\\") { out += "\\" + ch; continue; }
    const code = ch.codePointAt(0);
    if (code < 32 || code > 126) { out += PDF_FALLBACK[ch] !== undefined ? PDF_FALLBACK[ch] : "?"; continue; }
    out += ch;
  }
  return out;
}

/* Uniwersalny silnik PDF — wielostronicowy dokument z tekstem, liniami i tłem.
   Używany przez protokoły pomiarowe; dzięki temu logika składania pliku jest w jednym miejscu. */
function createPdfDoc({ pageW = 595.28, pageH = 841.89, margin = 42, footer = null } = {}) {
  const pages = [];
  let content = [];
  let y = pageH - margin;
  let onNewPage = null;
  const footerReserve = footer ? 50 : 26; // zarezerwowane miejsce nad tabliczką rysunkową

  const api = {
    get y() { return y; },
    set y(v) { y = v; },
    get pageW() { return pageW; },
    get margin() { return margin; },
    get innerW() { return pageW - margin * 2; },
    setNewPageHandler(fn) { onNewPage = fn; },
    text(str, x, yy, size = 9, bold = false, gray = 0) {
      content.push(`${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${yy.toFixed(1)} Td (${pdfEscape(str)}) Tj ET 0 g`);
    },
    line(x1, y1, x2, y2, w = 0.6, gray = 0.75) {
      content.push(`${gray} G ${w} w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`);
    },
    box(x, yy, w, h, gray = 0.93) {
      content.push(`${gray} g ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f 0 g`);
    },
    /* zapewnia miejsce na kolejny blok; w razie potrzeby rysuje tabliczkę na bieżącej
       stronie i zaczyna nową */
    ensure(h) {
      if (y - h < margin + footerReserve) {
        if (footer) footer(api);
        pages.push(content.join("\n"));
        content = [];
        y = pageH - margin;
        if (onNewPage) onNewPage(api);
        return true;
      }
      return false;
    },
    finish(filename) {
      if (footer) footer(api);
      pages.push(content.join("\n"));
      return assemblePdf(pages, pageW, pageH, filename);
    },
  };
  return api;
}

/* Tabliczka rysunkowa (metryka) rysowana na dole każdej strony — standard dokumentacji
   technicznej: obiekt, tytuł rysunku, numer i rewizja, data, wykonawca. */
function drawTitleBlock(doc, header, docTitle) {
  const M = doc.margin, W = doc.innerW;
  const H = 40, y0 = M - 6; // pasek tuż nad marginesem dolnym
  const c1 = 190, c2 = 130; // szerokości pierwszych dwóch kolumn

  doc.box(M, y0, W, H, 0.98);
  doc.line(M, y0 + H, M + W, y0 + H, 1, 0.25);
  doc.line(M, y0, M + W, y0, 0.7, 0.55);
  doc.line(M, y0, M, y0 + H, 0.7, 0.55);
  doc.line(M + W, y0, M + W, y0 + H, 0.7, 0.55);
  doc.line(M + c1, y0, M + c1, y0 + H, 0.5, 0.65);
  doc.line(M + c1 + c2, y0, M + c1 + c2, y0 + H, 0.5, 0.65);

  doc.text("OBIEKT", M + 6, y0 + H - 10, 6.5, true, 0.5);
  doc.text(pdfFitText(header.obiekt || "—", c1 - 10, 9, true), M + 6, y0 + H - 21, 9, true);
  doc.text(pdfFitText(header.adres || "", c1 - 10, 7.5, false), M + 6, y0 + 8, 7.5, false, 0.4);

  doc.text("RYSUNEK / DOKUMENT", M + c1 + 6, y0 + H - 10, 6.5, true, 0.5);
  doc.text(pdfFitText(docTitle || "—", c2 - 10, 8.5, true), M + c1 + 6, y0 + H - 21, 8.5, true);
  doc.text(pdfFitText(header.wykonawca ? `Wykonał: ${header.wykonawca}` : "", c2 - 10, 7.5, false), M + c1 + 6, y0 + 8, 7.5, false, 0.4);

  const c3x = M + c1 + c2 + 6;
  doc.text("NR RYS.", c3x, y0 + H - 10, 6.5, true, 0.5);
  doc.text(header.drawingNo || "—", c3x, y0 + H - 21, 9, true);
  doc.text("REW.", c3x + 55, y0 + H - 10, 6.5, true, 0.5);
  doc.text(header.revision || "—", c3x + 55, y0 + H - 21, 9, true);
  doc.text("DATA", c3x, y0 + 17, 6.5, true, 0.5);
  doc.text(header.data || "—", c3x, y0 + 7, 8);
  doc.text("pomocnikelektryka.pl", c3x + 55, y0 + 7, 6.5, false, 0.55);
}

/* Składa strumienie stron w kompletny plik PDF i uruchamia pobieranie */
function assemblePdf(pages, PW, PH, filename) {
  const objs = [];
  const push = (s) => { objs.push(s); return objs.length; };

  const contentIds = pages.map((c) => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
  const encId = push(`<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 ${PDF_DIFF_NAMES.map((n) => "/" + n).join(" ")}] >>`);
  const fontCommon = `/Type /Font /Subtype /Type1 /FirstChar 32 /LastChar 145 /Encoding ${encId} 0 R`;
  const f1 = push(`<< ${fontCommon} /BaseFont /Helvetica /Widths [${PDF_W_REG.join(" ")}] >>`);
  const f2 = push(`<< ${fontCommon} /BaseFont /Helvetica-Bold /Widths [${PDF_W_BOLD.join(" ")}] >>`);

  const pagesId = objs.length + pages.length + 1;
  const kidsIds = pages.map((_, i) => push(
    `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PW.toFixed(2)} ${PH.toFixed(2)}] ` +
    `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${contentIds[i]} 0 R >>`
  ));
  push(`<< /Type /Pages /Kids [${kidsIds.map((k) => k + " 0 R").join(" ")}] /Count ${kidsIds.length} >>`);
  const catalogId = push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objs.forEach((body, idx) => {
    offsets.push(pdf.length);
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return downloadBlob(new Blob([bytes], { type: "application/pdf" }), filename);
}

function downloadPanelLegendPdf(devices, rowCount, usedModules, totalModules, perRow = 12, header = {}) {
  const COLS = [
    { key: "tag", label: "Ozn.", w: 44 },
    { key: "label", label: "Aparat", w: 60 },
    { key: "poles", label: "Bieg.", w: 38 },
    { key: "modules", label: "Mod.", w: 36 },
    { key: "caption", label: "Opis obwodu", w: 215 },
    { key: "cable", label: "Przewód", w: 118 },
  ];
  const ROW_H = 19, HEAD_H = 22;

  const doc = createPdfDoc({ footer: (d) => drawTitleBlock(d, header, "Legenda rozdzielnicy elektrycznej") });
  const M = doc.margin, W = doc.innerW;

  const drawHead = (first) => {
    if (first) {
      doc.text("LEGENDA ROZDZIELNICY ELEKTRYCZNEJ", M, doc.y - 14, 14, true);
      doc.y -= 32;
      doc.text(`Rzędów: ${rowCount} x ${perRow} modułów   |   Zajęte moduły: ${usedModules} z ${totalModules}`, M, doc.y, 9);
      doc.y -= 20;
    } else {
      doc.text("LEGENDA ROZDZIELNICY (cd.)", M, doc.y - 12, 11, true);
      doc.y -= 28;
    }
    doc.box(M, doc.y - HEAD_H + 5, W, HEAD_H, 0.88);
    let cx = M + 5;
    COLS.forEach((c) => { doc.text(c.label, cx, doc.y - HEAD_H + 11, 9, true); cx += c.w; });
    doc.y -= HEAD_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.8, 0.4);
  };
  doc.setNewPageHandler(() => drawHead(false));
  drawHead(true);

  devices.forEach((d, i) => {
    if (doc.ensure(ROW_H)) { /* nagłówek już narysowany przez onNewPage */ }
    if (i % 2 === 1) doc.box(M, doc.y - ROW_H + 5, W, ROW_H, 0.965);

    const row = {
      tag: d.tag || "", label: d.label || "", poles: d.poles || "", modules: String(d.modules || ""),
      caption: (d.caption || "") + (d.rcdTag ? ` (za ${d.rcdTag})` : ""),
      cable: d.cable || "-",
    };
    let cx = M + 5;
    COLS.forEach((c) => {
      const bold = c.key === "tag";
      doc.text(pdfFitText(row[c.key], c.w - 8, 9, bold), cx, doc.y - ROW_H + 11, 9, bold);
      cx += c.w;
    });
    doc.y -= ROW_H;
    doc.line(M, doc.y + 4, M + W, doc.y + 4, 0.4, 0.85);
  });

  doc.y -= 24;
  if (!doc.ensure(24)) {
    doc.text("Data montażu: ..................................", M, doc.y, 9);
    doc.text("Wykonawca: ..................................", M + 270, doc.y, 9);
  }

  return doc.finish("legenda-rozdzielnicy.pdf");
}

function PanelTab({ circuits, rcdGroups, lowVoltage = [], docHeader = EMPTY_HEADER, goTo }) {
  const [pdfBlocked, setPdfBlocked] = useState(false);
  const [supply3f, setSupply3f] = useState(true);
  const [spd, setSpd] = useState("T1+T2");
  const [mainRating, setMainRating] = useState(40);
  const [perRow, setPerRow] = useState(12);
  const [devices, setDevices] = useState([]);
  const [drag, setDrag] = useState(null);      // { index, uid }
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ kind: "mcb", label: "B16", caption: "", poles: "1P", modules: 1, phase: "L1" });
  const [dropAt, setDropAt] = useState(null);  // docelowa pozycja wstawienia
  const [hiddenKeys, setHiddenKeys] = useState([]); // usunięte aparaty wynikające z obwodów — pamiętane, żeby nie wracały po przeliczeniu
  const svgRef = useRef(null);

  // Aparaty przeliczają się, gdy zmienią się obwody lub konfiguracja zasilania.
  // Ręczna kolejność jest wtedy nadpisywana — informujemy o tym przy przycisku resetu.
  useEffect(() => {
    // przy przeliczeniu zachowujemy aparaty dodane ręcznie i pomijamy te usunięte przez
    // użytkownika (identyfikowane stabilnym kluczem powiązanym z obwodem, nie indeksem)
    setDevices((prev) => {
      const manual = prev.filter((d) => d.manual);
      const rebuilt = buildPanelDevices(circuits, rcdGroups, { supply3f, spd, mainRating })
        .filter((d) => !hiddenKeys.includes(d.key));
      return [...rebuilt, ...manual];
    });
  }, [circuits, rcdGroups, supply3f, spd, mainRating]);

  const rows = useMemo(() => layoutPanel(devices, perRow), [devices, perRow]);
  const usedModules = devices.reduce((a, d) => a + d.modules, 0);
  const totalModules = Math.max(rows.length, 1) * perRow;
  const spareModules = totalModules - usedModules;

  // bilans obciążenia faz — suma prądów znamionowych zabezpieczeń przypisanych do każdej fazy
  const phaseLoad = useMemo(() => {
    const acc = { L1: 0, L2: 0, L3: 0 };
    devices.forEach((d) => {
      if (d.kind !== "mcb") return;
      const i = ratedCurrent(d.label);
      if (d.poles === "3P") { acc.L1 += i; acc.L2 += i; acc.L3 += i; }
      else if (acc[d.phase] !== undefined) acc[d.phase] += i;
    });
    return acc;
  }, [devices]);
  const selectivity = useMemo(
    () => computeSelectivity(devices, mainRating, supply3f, spd !== "brak"),
    [devices, mainRating, supply3f, spd]
  );
  const maxPhase = Math.max(phaseLoad.L1, phaseLoad.L2, phaseLoad.L3, 1);
  const phaseSpread = maxPhase - Math.min(phaseLoad.L1, phaseLoad.L2, phaseLoad.L3);

  const PAD = 26, TAG_H = 34;
  const rowH = DEV_H + TAG_H + 18;
  const innerW = perRow * MOD_W;
  const svgW = innerW + PAD * 2;
  const svgH = Math.max(rows.length, 1) * rowH + PAD * 2;

  /* --- przeciąganie aparatów --- */
  function svgPoint(evt) {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(ctm.inverse());
  }

  function slotIndexAt(p) {
    if (!p) return null;
    const ri = Math.floor((p.y - PAD) / rowH);
    if (ri < 0) return 0;
    if (ri >= rows.length) return devices.length;
    const row = rows[ri];
    const modOffset = (p.x - PAD) / MOD_W;
    for (const d of row) {
      if (modOffset < d.slot + d.modules / 2) return d.index;
    }
    const last = row[row.length - 1];
    return last.index + 1;
  }

  function onDeviceMouseDown(evt, d) {
    evt.preventDefault();
    setDrag({ index: d.index, uid: d.uid });
    setDropAt(d.index);
  }
  function onSvgMouseMove(evt) {
    if (!drag) return;
    setDropAt(slotIndexAt(svgPoint(evt)));
  }
  function onSvgMouseUp() {
    if (drag && dropAt !== null && dropAt !== drag.index) {
      setDevices((ds) => {
        const next = [...ds];
        const [moved] = next.splice(drag.index, 1);
        const target = dropAt > drag.index ? dropAt - 1 : dropAt;
        next.splice(target, 0, moved);
        return next;
      });
    }
    setDrag(null); setDropAt(null);
  }

  function setPhaseFor(uid, phase) {
    setDevices((ds) => ds.map((d) => (d.uid === uid ? { ...d, phase } : d)));
  }
  function autoBalance() {
    setDevices((ds) => balancePhases(ds));
  }
  function resetLayout() {
    setHiddenKeys([]);
    setDevices((prev) => {
      const manual = prev.filter((d) => d.manual);
      return [...buildPanelDevices(circuits, rcdGroups, { supply3f, spd, mainRating }), ...manual];
    });
  }

  /* --- ręczne dodawanie aparatów --- */
  function addManualDevice(form) {
    const def = MANUAL_DEVICE_TYPES.find((t) => t.key === form.kind);
    if (!def) return;
    setDevices((prev) => {
      const used = prev.filter((d) => String(d.tag || "").startsWith(def.prefix)).length;
      const tag = def.prefix ? `${def.prefix}${used + 1}` : "";
      return [...prev, {
        kind: form.kind, manual: true, tag,
        modules: Number(form.modules) || def.modules,
        label: form.label || def.defLabel,
        caption: form.caption || def.label,
        poles: form.poles || def.poles,
        phase: form.phase || (supply3f && def.poles === "1P" ? "L1" : supply3f ? "3F" : "L1"),
        uid: `m-${uid()}`,
      }];
    });
  }

  // Usuwanie modułu z rozdzielnicy. Aparaty wynikające z obwodów projektu (mcb/rcd/spd…)
  // są pamiętane jako ukryte (po stabilnym kluczu powiązanym z obwodem, nie indeksem),
  // żeby nie wracały automatycznie przy kolejnym przeliczeniu. Rozłącznika głównego nie
  // da się usunąć — każda rozdzielnica musi mieć aparat odcinający zasilanie.
  function removeDevice(target) {
    setDevices((ds) => {
      const d = ds.find((x) => x.uid === target);
      if (!d || d.kind === "main") return ds;
      if (!d.manual && d.key) setHiddenKeys((hk) => (hk.includes(d.key) ? hk : [...hk, d.key]));
      return ds.filter((x) => x.uid !== target);
    });
  }

  if (circuits.length === 0) {
    return <EmptyState goTo={goTo} text="Rozdzielnica pojawi się tu automatycznie, gdy dodasz elementy w zakładce „Zaprojektuj instalację”." />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Rozdzielnica elektryczna</h2>
        <p className="text-sm text-slate-500">
          Widok frontu rozdzielnicy — {rows.length}× rząd {perRow} modułów, zajęte {usedModules} z {totalModules}.
          Aparaty można przeciągać, aby zmienić ich kolejność na szynie.
        </p>
      </div>

      {/* konfiguracja rozdzielnicy */}
      <div className="pe-card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">Zasilanie</div>
            <select value={supply3f ? "3" : "1"} onChange={(e) => setSupply3f(e.target.value === "3")} className="pe-input text-sm">
              <option value="3">3-fazowe 400/230 V</option>
              <option value="1">1-fazowe 230 V</option>
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">Rozłącznik główny</div>
            <select value={mainRating} onChange={(e) => setMainRating(Number(e.target.value))} className="pe-input text-sm">
              {[25, 32, 40, 63, 80].map((a) => <option key={a} value={a}>{a} A</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">Ogranicznik przepięć</div>
            <select value={spd} onChange={(e) => setSpd(e.target.value)} className="pe-input text-sm">
              <option value="T1+T2">Typ 1+2 (budynek z instalacją odgromową)</option>
              <option value="T2">Typ 2 (bez instalacji odgromowej)</option>
              <option value="brak">Brak</option>
            </select>
          </label>
          <label className="block">
            <div className="text-xs text-slate-500 mb-1">Modułów w rzędzie</div>
            <select value={perRow} onChange={(e) => setPerRow(Number(e.target.value))} className="pe-input text-sm">
              {[12, 14, 18, 24].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="flex gap-2 ml-auto">
            {supply3f && <button onClick={autoBalance} className="pe-btn-ghost text-xs px-3 py-2">Wyrównaj fazy</button>}
            <button onClick={() => setAddOpen(true)} className="pe-btn-copper text-xs px-3 py-2 flex items-center gap-1.5">
              <Plus size={13} /> Dodaj aparat
            </button>
            <button onClick={resetLayout} className="pe-btn-ghost text-xs px-3 py-2">Przywróć układ</button>
          </div>
        </div>

        {supply3f && (
          <div className="mt-4 pt-4 border-t" style={{ borderColor: "#EEF1F4" }}>
            <div className="text-xs text-slate-500 mb-2">Bilans obciążenia faz (suma prądów znamionowych zabezpieczeń)</div>
            <div className="space-y-1.5">
              {["L1", "L2", "L3"].map((ph) => (
                <div key={ph} className="flex items-center gap-2">
                  <span className="pe-mono text-xs w-6 font-bold" style={{ color: PHASE_COLORS[ph] }}>{ph}</span>
                  <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "#EEF1F4" }}>
                    <div style={{ width: `${(phaseLoad[ph] / maxPhase) * 100}%`, height: "100%", background: PHASE_COLORS[ph], opacity: 0.75 }} />
                  </div>
                  <span className="pe-mono text-xs w-14 text-right text-slate-600">{phaseLoad[ph]} A</span>
                </div>
              ))}
            </div>
            <div className="text-[11px] mt-2" style={{ color: phaseSpread > 32 ? "#A2352C" : "#64748B" }}>
              {phaseSpread > 32
                ? `Różnica między najbardziej i najmniej obciążoną fazą wynosi ${phaseSpread} A — rozważ przepięcie obwodów lub użyj „Wyrównaj fazy”.`
                : `Rozrzut między fazami: ${phaseSpread} A — obciążenie rozłożone równomiernie.`}
            </div>
          </div>
        )}
      </div>

      {/* front rozdzielnicy */}
      <div className="pe-card p-5 overflow-auto pe-scroll">
        <svg ref={svgRef} viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH}
          style={{ maxWidth: "100%", height: "auto", userSelect: "none" }}
          onMouseMove={onSvgMouseMove} onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp}>
          <rect x="0" y="0" width={svgW} height={svgH} rx="8" fill="#EDF0F3" stroke="#B6C1CC" strokeWidth="2" />
          <rect x="8" y="8" width={svgW - 16} height={svgH - 16} rx="5" fill="#F7F9FB" stroke="#CBD4DD" strokeWidth="1" />

          {rows.map((row, ri) => {
            const rowY = PAD + ri * rowH + TAG_H;
            return (
              <g key={ri}>
                <rect x={PAD - 6} y={rowY + DEV_H / 2 - 6} width={innerW + 12} height="12" rx="1.5"
                  fill="#C8D0D8" stroke="#A7B2BD" strokeWidth="0.8" />
                <rect x={PAD - 10} y={rowY - 5} width={innerW + 20} height="5" rx="1.5" fill="#DDE3E9" />
                <rect x={PAD - 10} y={rowY + DEV_H} width={innerW + 20} height="5" rx="1.5" fill="#DDE3E9" />

                {row.map((d) => (
                  <PanelDevice key={d.uid} device={d} x={PAD + d.slot * MOD_W} y={rowY}
                    dragging={drag?.uid === d.uid}
                    onMouseDown={(e) => onDeviceMouseDown(e, d)}
                    onDelete={removeDevice} />
                ))}

                {/* wskaźnik miejsca wstawienia podczas przeciągania */}
                {drag && dropAt !== null && row.some((d) => d.index === dropAt) && (() => {
                  const t = row.find((d) => d.index === dropAt);
                  return <line x1={PAD + t.slot * MOD_W} y1={rowY - 6} x2={PAD + t.slot * MOD_W} y2={rowY + DEV_H + 6}
                    stroke="#C1793F" strokeWidth="3" strokeLinecap="round" />;
                })()}
              </g>
            );
          })}
        </svg>
        <p className="text-[11px] text-slate-400 mt-2">
          Przeciągnij aparat, aby zmienić jego pozycję, kliknij „×” w rogu albo kosz w tabeli, aby go usunąć.
          Wolne miejsce: {spareModules} modułów
          {spareModules < usedModules * 0.2 && " — zalecana rezerwa to ok. 20–25% szerokości rozdzielnicy."}
        </p>

        {hiddenKeys.length > 0 && (
          <div className="mt-2 p-2.5 rounded-md flex items-center justify-between gap-2 flex-wrap" style={{ background: "#C1793F14" }}>
            <span className="text-[11px]" style={{ color: "#8A5526" }}>
              Usunięto {hiddenKeys.length} {hiddenKeys.length === 1 ? "aparat wynikający" : "aparaty/ów wynikających"} z obwodów —
              odpowiadające im obwody nadal istnieją w projekcie, ale nie mają zabezpieczenia w rozdzielnicy.
            </span>
            <button onClick={resetLayout} className="pe-btn-ghost text-[11px] px-2 py-1 shrink-0">Przywróć wszystkie</button>
          </div>
        )}
      </div>

      {/* analiza selektywności i poprawności doboru */}
      <div className="pe-card p-5">
        <h3 className="pe-display text-[15px] mb-1">Sprawdzenie selektywności i doboru zabezpieczeń</h3>
        <p className="text-xs text-slate-500 mb-3">
          Automatyczna kontrola stopniowania zabezpieczeń, ochrony różnicówek i rozkładu obciążenia.
        </p>
        <div className="space-y-2">
          {selectivity.map((s, i) => {
            const style = s.level === "error" ? { bg: "#C6433A14", fg: "#A2352C", Icon: AlertTriangle }
              : s.level === "warn" ? { bg: "#C1793F14", fg: "#8A5526", Icon: AlertTriangle }
              : s.level === "ok" ? { bg: "#3B8C631A", fg: "#2C6B4A", Icon: Check }
              : { bg: "#2D5A8C12", fg: "#2D5A8C", Icon: Info };
            const Icon = style.Icon;
            return (
              <div key={i} className="p-3 rounded-lg flex items-start gap-2" style={{ background: style.bg }}>
                <Icon size={15} className="shrink-0 mt-0.5" style={{ color: style.fg }} />
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: style.fg }}>{s.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">{s.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* legenda do naklejenia w rozdzielnicy */}
      <div className="pe-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
          <div>
            <h3 className="pe-display text-[15px]">Legenda rozdzielnicy</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Opis aparatów do wydrukowania i naklejenia wewnątrz drzwiczek rozdzielnicy.
            </p>
          </div>
          <button onClick={() => {
              const ok = downloadPanelLegendPdf(devices, rows.length, usedModules, totalModules, perRow, docHeader);
              setPdfBlocked(!ok);
            }}
            className="pe-btn-copper text-xs px-3 py-2 flex items-center gap-1.5">
            <Download size={14} /> Pobierz legendę (PDF)
          </button>
        </div>

        {pdfBlocked && (
          <div className="text-xs p-2.5 rounded-md flex gap-2 mt-2" style={{ background: "#C1793F14", color: "#8A5526" }}>
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            Przeglądarka zablokowała pobieranie w tym widoku (typowe dla podglądu osadzonego w ramce).
            Otwórz aplikację w osobnej karcie — wtedy plik zapisze się normalnie.
          </div>
        )}

        <table className="w-full text-sm mt-3">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b" style={{ borderColor: "#DCE2E8" }}>
              <th className="py-2 w-14">Ozn.</th>
              <th className="py-2 w-20">Aparat</th>
              <th className="py-2 w-14">Bieg.</th>
              <th className="py-2 w-20">Faza</th>
              <th className="py-2 w-14">Mod.</th>
              <th className="py-2">Opis obwodu</th>
              <th className="py-2 w-32">Przewód</th>
              <th className="py-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.uid} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                <td className="py-2 pe-mono font-bold">{d.tag}</td>
                <td className="py-2 pe-mono font-semibold" style={{ color: d.kind === "mcb" ? colorForCircuit(d.type) : d.kind === "rcd" ? "#C1793F" : "#16202B" }}>
                  {d.label}
                </td>
                <td className="py-2 text-slate-500">{d.poles}</td>
                <td className="py-2">
                  {supply3f && d.kind === "mcb" && d.poles === "1P" ? (
                    <select value={d.phase || "L1"} onChange={(e) => setPhaseFor(d.uid, e.target.value)}
                      className="pe-input text-xs py-0.5 pe-mono" style={{ color: PHASE_COLORS[d.phase] }}>
                      {["L1", "L2", "L3"].map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span className="pe-mono text-xs" style={{ color: PHASE_COLORS[d.phase] }}>
                      {d.phase === "3F" ? "L1 L2 L3" : d.phase || "—"}
                    </span>
                  )}
                </td>
                <td className="py-2 text-slate-500">{d.modules}</td>
                <td className="py-2 text-slate-600">
                  {d.caption}
                  {d.rcdTag && <span className="text-slate-400"> (za {d.rcdTag})</span>}
                </td>
                <td className="py-2 text-slate-500 text-xs">{d.cable || "—"}</td>
                <td className="py-2">
                  {d.kind !== "main" && (
                    <button onClick={() => removeDevice(d.uid)} title="Usuń aparat z rozdzielnicy"
                      className="text-slate-300 hover:text-red-500"><Trash2 size={13} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lowVoltage.length > 0 && (
        <div className="pe-card p-5">
          <h3 className="pe-display text-[15px] mb-1">Instalacja niskoprądowa (teletechnika)</h3>
          <p className="text-xs text-slate-500 mb-3">
            Prowadzona poza rozdzielnicą 230V — do osobnej szafki teletechnicznej / punktu RTV. Nie wymaga zabezpieczeń nadprądowych.
          </p>
          <div className="flex flex-wrap gap-2">
            {lowVoltage.map((lv) => (
              <div key={lv.type} className="rounded-md border px-3 py-2 text-xs flex items-center gap-2"
                style={{ borderColor: "#0F8A9E", background: "#0F8A9E0D", color: "#0B6B7A" }}>
                <GlyphPreview type={lv.type} color="#0F8A9E" gangs={1} />
                <span>{lv.label} — <strong>{lv.count} szt.</strong></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2.5 text-xs text-slate-600 py-1" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" style={{ color: "#C1793F" }} />
        Rozmieszczenie aparatów, dobór ogranicznika przepięć i jego zabezpieczenia, selektywność zabezpieczeń oraz
        rozdział obwodów na fazy należy zweryfikować z projektantem lub elektrykiem z uprawnieniami.
      </div>

      <button onClick={() => goTo("schemat")} className="pe-btn-copper text-sm px-4 py-2 flex items-center gap-1.5">
        Zobacz schemat jednokreskowy <ChevronRight size={15} />
      </button>

      {addOpen && (() => {
        const def = MANUAL_DEVICE_TYPES.find((t) => t.key === addForm.kind);
        return (
          <Modal title="Dodaj aparat do rozdzielnicy" onClose={() => setAddOpen(false)} width={420}>
            <div className="space-y-3">
              <label className="block">
                <div className="text-xs text-slate-500 mb-1">Rodzaj aparatu</div>
                <select value={addForm.kind}
                  onChange={(e) => {
                    const d = MANUAL_DEVICE_TYPES.find((t) => t.key === e.target.value);
                    setAddForm({ ...addForm, kind: e.target.value, label: d.defLabel, poles: d.poles, modules: d.modules, caption: "" });
                  }}
                  className="pe-input text-sm w-full">
                  {MANUAL_DEVICE_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-slate-500 mb-1">Oznaczenie / prąd</div>
                  <select value={addForm.label} onChange={(e) => setAddForm({ ...addForm, label: e.target.value })}
                    className="pe-input text-sm w-full pe-mono">
                    {def.ratings.map((r) => <option key={r} value={r}>{r || "—"}</option>)}
                  </select>
                </label>
                <label className="block">
                  <div className="text-xs text-slate-500 mb-1">Szerokość (moduły)</div>
                  <input type="number" min="1" max="8" value={addForm.modules}
                    onChange={(e) => setAddForm({ ...addForm, modules: Number(e.target.value) })}
                    className="pe-input text-sm w-full pe-mono" />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-slate-500 mb-1">Bieguny</div>
                  <select value={addForm.poles} onChange={(e) => setAddForm({ ...addForm, poles: e.target.value })}
                    className="pe-input text-sm w-full">
                    {["1P", "1P+N", "2P", "3P", "4P", "—"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                {supply3f && (
                  <label className="block">
                    <div className="text-xs text-slate-500 mb-1">Faza</div>
                    <select value={addForm.phase} onChange={(e) => setAddForm({ ...addForm, phase: e.target.value })}
                      className="pe-input text-sm w-full pe-mono">
                      {["L1", "L2", "L3", "3F"].map((p) => <option key={p} value={p}>{p === "3F" ? "L1 L2 L3" : p}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <label className="block">
                <div className="text-xs text-slate-500 mb-1">Opis (trafi do legendy)</div>
                <input value={addForm.caption} placeholder={def.label}
                  onChange={(e) => setAddForm({ ...addForm, caption: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") { addManualDevice(addForm); setAddOpen(false); } }}
                  className="pe-input text-sm w-full" />
              </label>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAddOpen(false)} className="pe-btn-ghost flex-1 text-sm py-2">Anuluj</button>
                <button type="button" onClick={() => { addManualDevice(addForm); setAddOpen(false); }}
                  className="pe-btn-copper flex-1 text-sm py-2">Dodaj</button>
              </div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

function colorForCircuit(type) {
  return { gniazdko: "#2D5A8C", oswietlenie: "#C1793F", roleta: "#7C5CBF" }[type] || "#2D5A8C";
}

/* =========================================================================
   SCHEMAT INSTALACJI (jednokreskowy)
   ========================================================================= */

function SchemaTab({ circuits, rcdGroups, goTo }) {
  if (circuits.length === 0) {
    return <EmptyState goTo={goTo} text="Schemat wygeneruje się automatycznie po dodaniu elementów w projekcie instalacji." />;
  }

  const colW = 220;
  const width = Math.max(900, rcdGroups.length * colW + 100);
  const rowH = 34;
  const maxCircuitsInGroup = Math.max(...rcdGroups.map((g) => g.circuits.length));
  const height = 230 + maxCircuitsInGroup * rowH;
  const mainX = width / 2;
  const mainBreaker = mainBreakerFor(circuits.length);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="pe-display text-xl mb-1">Schemat instalacji (jednokreskowy)</h2>
        <p className="text-sm text-slate-500">Generowany automatycznie na podstawie obwodów z projektu instalacji.</p>
      </div>

      <div className="pe-card overflow-auto pe-scroll p-4">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ minWidth: 700 }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="#16202B" />
            </marker>
          </defs>

          <SchemaBox x={mainX - 70} y={10} w={140} h={40} label="Złącze / licznik" color="#16202B" />
          <line x1={mainX} y1={50} x2={mainX} y2={90} stroke="#16202B" strokeWidth="2" />
          <SchemaBox x={mainX - 70} y={90} w={140} h={40} label={`Rozłącznik gł. ${mainBreaker}`} color="#16202B" />
          <line x1={mainX} y1={130} x2={mainX} y2={160} stroke="#16202B" strokeWidth="2" />
          <line x1={100} y1={160} x2={width - 100} y2={160} stroke="#16202B" strokeWidth="2" />

          {rcdGroups.map((r, gi) => {
            const cx = 100 + colW * gi + colW / 2;
            return (
              <g key={r.id}>
                <line x1={cx} y1={160} x2={cx} y2={190} stroke="#16202B" strokeWidth="2" />
                <SchemaBox x={cx - 65} y={190} w={130} h={36} label={`RCD ${r.rating}`} color="#C1793F" />
                <line x1={cx} y1={226} x2={cx} y2={250} stroke="#16202B" strokeWidth="2" />
                {r.circuits.map((c, ci) => {
                  const y = 250 + ci * rowH;
                  const color = colorForCircuit(c.type);
                  return (
                    <g key={c.id}>
                      <line x1={cx} y1={ci === 0 ? 250 : y} x2={cx} y2={y + rowH / 2} stroke="#16202B" strokeWidth="1.5" />
                      <line x1={cx} y1={y + rowH / 2} x2={cx + 30} y2={y + rowH / 2} stroke="#16202B" strokeWidth="1.5" markerEnd="url(#arrow)" />
                      <rect x={cx - 22} y={y + rowH / 2 - 10} width="30" height="20" rx="3" fill="#fff" stroke={color} strokeWidth="2" />
                      <text x={cx - 7} y={y + rowH / 2 + 4} fontSize="9" textAnchor="middle" fontWeight="700" fill={color}>{c.breaker}</text>
                      <text x={cx + 36} y={y + rowH / 2 + 4} fontSize="10.5" fill="#16202B">{c.name}</text>
                      <text x={cx + 36} y={y + rowH / 2 + 15} fontSize="9" fill="#8A97A5">{c.cable} · {c.elements.length} pkt</text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="pe-chip pe-tag-blue">■ obwód gniazd</span>
        <span className="pe-chip pe-tag-copper">■ obwód oświetlenia</span>
        <span className="pe-chip" style={{ background: "#7C5CBF1A", color: "#5B3F99" }}>■ obwód rolet</span>
      </div>

      <button onClick={() => goTo("kosztorys")} className="pe-btn-copper text-sm px-4 py-2 flex items-center gap-1.5">
        Przejdź do kosztorysu <ChevronRight size={15} />
      </button>
    </div>
  );
}

function SchemaBox({ x, y, w, h, label, color }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="4" fill="#fff" stroke={color} strokeWidth="2" />
      <text x={x + w / 2} y={y + h / 2 + 4} fontSize="11.5" fontWeight="700" textAnchor="middle" fill={color}>{label}</text>
    </g>
  );
}

function EmptyState({ goTo, text }) {
  return (
    <div className="pe-card p-10 text-center max-w-xl mx-auto mt-10">
      <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: "#EEF1F4" }}>
        <Info size={20} style={{ color: "#C1793F" }} />
      </div>
      <p className="text-sm text-slate-600 mb-4">{text}</p>
      <button onClick={() => goTo("projekt")} className="pe-btn-copper text-sm px-4 py-2 inline-flex items-center gap-1.5">
        Przejdź do projektu instalacji <ChevronRight size={15} />
      </button>
    </div>
  );
}

/* =========================================================================
   KOSZTORYS
   ========================================================================= */

function CostTab({ costs, prices, setPrices }) {
  const fileRef = useRef(null);
  const { quantities } = costs;

  const rows = Object.keys(PRICE_LABELS)
    .filter((k) => quantities[k] > 0)
    .map((k) => ({ key: k, label: PRICE_LABELS[k], qty: quantities[k], price: prices[k], total: quantities[k] * prices[k] }));

  const grandTotal = rows.reduce((a, r) => a + r.total, 0);

  function updatePrice(key, val) { setPrices((p) => ({ ...p, [key]: Number(val) || 0 })); }

  function handleCsvImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).filter(Boolean);
      const map = {
        gniazdko: ["gniazdko", "gniazdo podtynkowe"],
        wlacznik: ["włącznik", "lacznik", "łącznik"],
        puszkaPodtynkowa: ["puszka podtynkowa"],
        puszkaRozgalezna: ["puszka rozgałęźna", "rozgalezna"],
        kabel15: ["ydyp 3x1,5", "ydyp 3×1,5", "1,5 mm"],
        kabel25: ["ydyp 3x2,5", "ydyp 3×2,5", "2,5 mm"],
        kabel4: ["ydyp 3x4", "ydyp 5x2,5", "4 mm"],
        mcb: ["wyłącznik nadprądowy", "wylacznik nadpradowy", " b16", " b10", " b20"],
        rcd: ["różnicowoprądowy", "roznicowopradowy", "rcd"],
        glowny: ["wyłącznik główny", "wylacznik glowny", "rozłącznik izolacyjny", "rozlacznik izolacyjny"],
        rozdzielnica: ["rozdzielnica", "obudowa"],
      };
      const updates = {};
      lines.forEach((line) => {
        const parts = line.split(/[,;\t]/);
        if (parts.length < 2) return;
        const name = parts[0].toLowerCase();
        const priceRaw = parts[parts.length - 1].replace(/[^\d.,]/g, "").replace(",", ".");
        const price = parseFloat(priceRaw);
        if (!price) return;
        for (const [key, keywords] of Object.entries(map)) {
          if (keywords.some((kw) => name.includes(kw))) { updates[key] = price; break; }
        }
      });
      if (Object.keys(updates).length) {
        setPrices((p) => ({ ...p, ...updates }));
        alert(`Zaktualizowano ${Object.keys(updates).length} pozycję/e cenowe na podstawie pliku.`);
      } else {
        alert("Nie rozpoznano pozycji w pliku. Sprawdź format: nazwa,cena (CSV wyeksportowany np. z Excela).");
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function exportCsv() {
    const header = "Pozycja;Ilość;Cena jedn. (zł);Wartość (zł)\n";
    const body = rows.map((r) => `${r.label};${r.qty};${r.price.toFixed(2)};${r.total.toFixed(2)}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + body + `\nRAZEM;;;${grandTotal.toFixed(2)}`], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "kosztorys-instalacji.csv");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="pe-display text-xl mb-1">Kosztorys instalacji elektrycznej</h2>
          <p className="text-sm text-slate-500">Ceny domyślne są orientacyjne — edytuj je ręcznie lub zaimportuj z własnego cennika (CSV).</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current?.click()} className="pe-btn-ghost text-xs px-3 py-2 flex items-center gap-1.5">
            <Upload size={14} /> Importuj cennik CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvImport} />
          <button onClick={exportCsv} className="pe-btn-copper text-xs px-3 py-2 flex items-center gap-1.5">
            <Download size={14} /> Eksportuj kosztorys
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2.5 text-xs text-slate-600 py-1" style={{ borderLeft: "3px solid #C1793F", paddingLeft: 12 }}>
        <Info size={15} className="shrink-0 mt-0.5" style={{ color: "#2D5A8C" }} />
        Import cen: wgraj plik CSV w formacie <span className="pe-mono">nazwa;cena</span> — aplikacja dopasuje pozycje po
        słowach kluczowych. Ze względu na brak dostępu do internetu w tej aplikacji ceny nie pobierają się automatycznie
        na żywo ze stron sklepów.
      </div>

      <div className="pe-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b" style={{ borderColor: "#DCE2E8" }}>
              <th className="p-3">Pozycja</th>
              <th className="p-3 w-24">Ilość</th>
              <th className="p-3 w-32">Cena jedn.</th>
              <th className="p-3 w-32 text-right">Wartość</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0" style={{ borderColor: "#EEF1F4" }}>
                <td className="p-3">{r.label}</td>
                <td className="p-3 pe-mono">{r.qty}</td>
                <td className="p-3">
                  <input type="number" value={r.price} onChange={(e) => updatePrice(r.key, e.target.value)} className="pe-input text-sm w-24 pe-mono" step="0.5" />
                </td>
                <td className="p-3 text-right pe-mono">{r.total.toFixed(2)} zł</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="p-3 pe-display font-bold" colSpan={3}>RAZEM</td>
              <td className="p-3 text-right pe-display font-bold text-lg" style={{ color: "#C1793F" }}>{grandTotal.toFixed(2)} zł</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="text-xs text-slate-400">
        Ilość przewodów i puszek jest szacowana na podstawie liczby punktów instalacyjnych i wygenerowanych obwodów
        (ok. 5 mb kabla na punkt + 10 mb do rozdzielnicy na obwód). Zweryfikuj długości na realnym rzucie budynku
        przed zakupem materiału.
      </div>
    </div>
  );
}
