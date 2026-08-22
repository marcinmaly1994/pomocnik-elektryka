/**
 * NIEUŻYWANY — zastąpiony przez `PanelRender.tsx` (SVG) w kroku 48.
 *
 * Zostawiony świadomie jako punkt odniesienia dla wersji Konvy, a nie przez
 * przeoczenie: projekt nie jest repozytorium git, więc skasowanie byłoby
 * nieodwracalne. Nie podpinaj go z powrotem bez decyzji — front rozdzielnicy
 * ma być wektorowy (skalowanie, wydruk, tekst jako tekst).
 */
import { useState } from "react";
import { Stage, Layer, Rect, Circle, Line, Text, Group } from "react-konva";
import { accentForDevice, DEV_H, MOD_W, PHASE_COLORS, layoutPanel } from "@/lib/panel/devices";
import type { PanelDevice } from "@/types";

interface PanelCanvasProps {
  devices: PanelDevice[];
  perRow: number;
  onDelete: (uid: string) => void;
}

const PAD = 26;
const TAG_H = 34;

/** Śruby mocujące korpus aparatu do szyny DIN — jedna para na moduł, u góry i u dołu. */
function MountingScrews({ modules }: { modules: number }) {
  return (
    <>
      {Array.from({ length: modules }).map((_, i) => (
        <Group key={i}>
          <Circle x={MOD_W * (i + 0.5)} y={14} radius={4.5} fill="#C3CBD4" stroke="#94A0AC" strokeWidth={0.8} />
          <Line points={[MOD_W * (i + 0.5) - 3, 14, MOD_W * (i + 0.5) + 3, 14]} stroke="#7E8B98" strokeWidth={1.2} />
          <Circle x={MOD_W * (i + 0.5)} y={DEV_H - 14} radius={4.5} fill="#C3CBD4" stroke="#94A0AC" strokeWidth={0.8} />
          <Line points={[MOD_W * (i + 0.5) - 3, DEV_H - 14, MOD_W * (i + 0.5) + 3, DEV_H - 14]} stroke="#7E8B98" strokeWidth={1.2} />
        </Group>
      ))}
    </>
  );
}

/** Środek korpusu aparatu — dźwignia łącznika, wkład SPD/bezpiecznika albo (dla
 *  różnicówki) dodatkowy przycisk testu T. Odpowiednik przełącznika/wkładu z wersji JS. */
function DeviceBody({ device, w }: { device: PanelDevice; w: number }) {
  const leverY = DEV_H * 0.42;
  if (device.kind === "spd") {
    return (
      <>
        {Array.from({ length: device.modules }).map((_, i) => (
          <Group key={i}>
            <Rect x={MOD_W * i + 5} y={leverY - 16} width={MOD_W - 10} height={30} cornerRadius={2} fill="#3B8C63" opacity={0.16} stroke="#3B8C63" strokeWidth={0.9} />
            <Rect x={MOD_W * i + 9} y={leverY - 11} width={MOD_W - 18} height={11} cornerRadius={1.5} fill="#3B8C63" />
            <Rect x={MOD_W * i + 11} y={leverY + 3} width={MOD_W - 22} height={6} cornerRadius={1} stroke="#3B8C63" strokeWidth={0.6} />
          </Group>
        ))}
      </>
    );
  }
  if (device.kind === "spdFuse") {
    return (
      <>
        {Array.from({ length: device.modules }).map((_, i) => (
          <Group key={i}>
            <Rect x={MOD_W * i + 5} y={leverY - 16} width={MOD_W - 10} height={30} cornerRadius={2} fill="#B98C2F" opacity={0.14} stroke="#B98C2F" strokeWidth={0.9} />
            <Circle x={MOD_W * (i + 0.5)} y={leverY - 1} radius={5} stroke="#B98C2F" strokeWidth={1.4} />
            <Circle x={MOD_W * (i + 0.5)} y={leverY - 1} radius={1.8} fill="#B98C2F" />
          </Group>
        ))}
      </>
    );
  }
  return (
    <>
      <Rect x={w / 2 - 8} y={leverY - 14} width={16} height={26} cornerRadius={2} fill="#2B3440" />
      <Rect x={w / 2 - 5.5} y={leverY - 11} width={11} height={9} cornerRadius={1} fill="#4C5866" />
      <Text text="I" x={w / 2 - 8} y={leverY + 3} width={16} align="center" fontSize={7} fontStyle="700" fill="#fff" />
      {device.kind === "rcd" && (
        <>
          <Rect x={w - 16} y={leverY - 14} width={12} height={12} cornerRadius={1.5} fill="#C6433A" />
          <Text text="T" x={w - 16} y={leverY - 12} width={12} align="center" fontSize={6.5} fontStyle="700" fill="#fff" />
        </>
      )}
    </>
  );
}

/**
 * Widok czołowy rozdzielnicy: śruby mocujące, dźwignia łącznika (lub wkład SPD /
 * bezpiecznika, przycisk testu T dla różnicówki), pasek akcentu wg typu obwodu —
 * ten sam zestaw detali co w wersji JS. Bez przeciągania myszką do zmiany
 * kolejności (aparaty przesuwa się przyciskami ↑/↓ w liście obok w `PanelTab`).
 */
export function PanelCanvas({ devices, perRow, onDelete }: PanelCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const rows = layoutPanel(devices, perRow);
  const rowH = DEV_H + TAG_H + 18;
  const innerW = perRow * MOD_W;
  const stageW = innerW + PAD * 2;
  const stageH = Math.max(rows.length, 1) * rowH + PAD * 2;

  return (
    <div className="overflow-auto rounded-card border border-border" style={{ maxHeight: 620 }}>
      <Stage width={stageW} height={stageH} style={{ background: "#EDF0F3" }}>
        <Layer>
          <Rect x={0} y={0} width={stageW} height={stageH} cornerRadius={8} fill="#EDF0F3" stroke="#B6C1CC" strokeWidth={2} />
          <Rect x={8} y={8} width={stageW - 16} height={stageH - 16} cornerRadius={5} fill="#F7F9FB" stroke="#CBD4DD" strokeWidth={1} />

          {rows.map((row, ri) => {
            const y = PAD + ri * rowH + TAG_H;
            return (
              <Group key={ri}>
                {/* szyna DIN */}
                <Rect x={PAD - 6} y={y + DEV_H / 2 - 6} width={innerW + 12} height={12} cornerRadius={1.5} fill="#C8D0D8" stroke="#A7B2BD" strokeWidth={0.8} />
                <Rect x={PAD - 10} y={y - 5} width={innerW + 20} height={5} cornerRadius={1.5} fill="#DDE3E9" />
                <Rect x={PAD - 10} y={y + DEV_H} width={innerW + 20} height={5} cornerRadius={1.5} fill="#DDE3E9" />

                {row.map((d) => {
                  const x = PAD + d.slot * MOD_W;
                  const w = d.modules * MOD_W;
                  const deletable = d.kind !== "main" && d.kind !== "blank";
                  const phaseColor = d.phase ? PHASE_COLORS[d.phase] : undefined;
                  const accent = accentForDevice(d);

                  if (d.kind === "blank") {
                    return (
                      <Group key={d.uid} x={x} y={y}>
                        <Rect width={w} height={DEV_H} cornerRadius={2} fill="#E9EDF1" stroke="#CBD4DD" strokeWidth={1} />
                        <Line points={[w * 0.3, DEV_H / 2, w * 0.7, DEV_H / 2]} stroke="#B6C1CC" strokeWidth={1.5} />
                      </Group>
                    );
                  }

                  return (
                    <Group
                      key={d.uid}
                      onMouseEnter={() => setHovered(d.uid)}
                      onMouseLeave={() => setHovered((h) => (h === d.uid ? null : h))}
                    >
                      <Text x={x} y={y - 20} width={w} align="center" text={d.tag} fontSize={12} fontStyle="700" fill="#16202B" />
                      {phaseColor && (
                        <>
                          <Rect x={x} y={y - 14} width={w} height={10} fill={`${phaseColor}22`} stroke={phaseColor} strokeWidth={0.7} cornerRadius={2} />
                          <Text
                            x={x}
                            y={y - 12.5}
                            width={w}
                            align="center"
                            text={d.phase === "3F" ? "L1 L2 L3" : d.phase}
                            fontSize={7}
                            fontStyle="700"
                            fill={phaseColor}
                          />
                        </>
                      )}

                      <Group x={x} y={y}>
                        <Rect width={w} height={DEV_H} cornerRadius={2.5} fill="#F7F8FA" stroke="#9AA6B2" strokeWidth={1.2} />
                        <Rect x={2} y={4} width={w - 4} height={20} cornerRadius={1.5} fill="#DDE3E9" stroke="#B6C1CC" strokeWidth={0.8} />
                        <Rect x={2} y={DEV_H - 24} width={w - 4} height={20} cornerRadius={1.5} fill="#DDE3E9" stroke="#B6C1CC" strokeWidth={0.8} />
                        <MountingScrews modules={d.modules} />

                        <Rect x={2} y={DEV_H * 0.62} width={w - 4} height={22} cornerRadius={1.5} stroke="#CBD4DD" strokeWidth={0.8} fill="#fff" />
                        <Text x={0} y={DEV_H * 0.62 + 5.5} width={w} align="center" text={d.label} fontSize={10.5} fontStyle="700" fill={accent} />

                        <DeviceBody device={d} w={w} />

                        <Rect x={2} y={DEV_H - 30} width={w - 4} height={4} cornerRadius={1} fill={accent} opacity={0.85} />
                      </Group>

                      {/* Opis POD aparatem, jedna linia z wielokropkiem — wcześniej stał na
                          licu aparatu (`DEV_H*0.55`) i nachodził na białe pole z wartością
                          zabezpieczenia (`DEV_H*0.62`), a przy aparatach 1-modułowych (34 px)
                          łamał się dodatkowo na kilka nieczytelnych pasków. Pełna nazwa jest
                          w liście „Aparaty" obok płótna i w legendzie PDF — tutaj wystarczy
                          skrót, bo na froncie rozdzielnicy liczą się głównie tag i wartość. */}
                      <Text
                        x={x}
                        y={y + DEV_H + 5}
                        width={w}
                        align="center"
                        text={d.caption}
                        fontSize={7.5}
                        fill="#5B6B7E"
                        wrap="none"
                        ellipsis
                      />

                      {/* Kasowanie pokazywane tylko dla aparatu pod kursorem — 16-px kółko przy
                          module o szerokości 34 px zasłaniało oznaczenie (F1, F2…) na stałe. */}
                      {deletable && hovered === d.uid && (
                        <Group
                          x={x + w - 9}
                          y={y - 24}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            onDelete(d.uid);
                          }}
                        >
                          <Rect x={-8} y={-8} width={16} height={16} cornerRadius={8} fill="#fff" stroke="#C6433A" strokeWidth={1.3} />
                          <Text x={-8} y={-8} width={16} height={16} align="center" verticalAlign="middle" text="×" fontSize={13} fill="#C6433A" />
                        </Group>
                      )}
                    </Group>
                  );
                })}
              </Group>
            );
          })}
        </Layer>
      </Stage>
    </div>
  );
}
