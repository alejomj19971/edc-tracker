"use client";

import React, { useMemo } from "react";

// Paleta de estado validada para uso como color solido de barra (contraste
// >=3:1 sobre fondo oscuro). Cada barra siempre lleva su estado como texto
// al lado (nunca solo el color), porque "Completado" (verde) y "Atrasado"
// (rojo) son el par mas dificil de distinguir para alguien con daltonismo
// rojo-verde.
const ESTADO_BAR_COLOR = {
  Pendiente: "#898781",
  "En progreso": "#fab219",
  Completado: "#0ca30c",
  Atrasado: "#d03b3b",
};

const DAY_MS = 86400000;
const DEADLINE = new Date(2026, 9, 10, 23, 59, 59).getTime();
const ROW_HEIGHT = 44;
const AXIS_HEIGHT = 28;
const BAR_HEIGHT = 24;
const LABEL_WIDTH = 240;

// Mismo truco que daysInfo() en app/page.js: fuerza medianoche local para
// que la fecha (string "YYYY-MM-DD" que viene de un <input type="date">)
// no se desplace un dia por husos horarios.
function parseDate(fecha) {
  return new Date(fecha + "T00:00:00");
}

function fmtShort(d) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function diasRestantesTexto(fechaFin) {
  if (!fechaFin) return null;
  const target = parseDate(fechaFin);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / DAY_MS);
  if (diff < 0) return `vencida ${Math.abs(diff)}d`;
  if (diff === 0) return "vence hoy";
  return `${diff} día${diff === 1 ? "" : "s"}`;
}

export default function GanttChart({ rows }) {
  const withDates = useMemo(
    () => rows.filter((r) => r.fecha_inicio && r.fecha_fin),
    [rows]
  );
  const withoutDatesCount = rows.length - withDates.length;

  const range = useMemo(() => {
    if (withDates.length === 0) return null;
    let min = parseDate(withDates[0].fecha_inicio).getTime();
    let max = parseDate(withDates[0].fecha_fin).getTime();
    for (const r of withDates) {
      const s = parseDate(r.fecha_inicio).getTime();
      const e = parseDate(r.fecha_fin).getTime();
      if (s < min) min = s;
      if (e > max) max = e;
    }
    min -= 2 * DAY_MS;
    max += 2 * DAY_MS;
    const totalDays = Math.max(1, Math.round((max - min) / DAY_MS));
    const weekTicks = [];
    for (let d = 0; d <= totalDays; d += 7) weekTicks.push(d);
    return { start: min, totalDays, weekTicks };
  }, [withDates]);

  if (!range) {
    return (
      <div style={{ padding: "48px 0", textAlign: "center", color: "#6B6180", fontSize: "13.5px" }}>
        Ninguna actividad tiene fecha de inicio y fecha fin todavia.
        <br />
        Agrega fechas en la vista de Tabla para verlas aqui.
      </div>
    );
  }

  // Ancho en pantalla: suficiente separacion entre semanas sin quedar
  // apretado. En impresion, .sa-gantt-track pasa a 100% (ver @media print)
  // y las posiciones -en porcentaje- se reacomodan solas a la pagina.
  const pxPerDay = Math.min(48, Math.max(14, Math.round(1800 / range.totalDays)));
  const trackWidthPx = range.totalDays * pxPerDay;
  const bodyHeight = withDates.length * ROW_HEIGHT;
  const pct = (days) => `${(days / range.totalDays) * 100}%`;

  const todayDays = (Date.now() - range.start) / DAY_MS;
  const deadlineDays = (DEADLINE - range.start) / DAY_MS;
  const showToday = todayDays >= 0 && todayDays <= range.totalDays;
  const showDeadline = deadlineDays >= 0 && deadlineDays <= range.totalDays;

  return (
    <div className="sa-gantt">
      <style>{`
        .sa-gantt-body { display: flex; }
        .sa-gantt-labels { flex: 0 0 ${LABEL_WIDTH}px; padding-right: 10px; }
        .sa-gantt-label { height: ${ROW_HEIGHT}px; display: flex; flex-direction: column; justify-content: center; border-bottom: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
        .sa-gantt-label-tema { font-size: 13px; font-weight: 600; color: #EDE9F7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sa-gantt-label-act { font-size: 11.5px; color: #8A81A3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
        .sa-gantt-scroll { flex: 1; overflow-x: auto; overflow-y: hidden; }
        .sa-gantt-track { position: relative; }
        .sa-gantt-axis-tick { position: absolute; top: 0; font-size: 11px; color: #8A81A3; white-space: nowrap; }
        .sa-gantt-gridline { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,0.06); }
        .sa-gantt-marker { position: absolute; top: 0; bottom: 0; width: 2px; }
        .sa-gantt-row-line { position: absolute; left: 0; right: 0; height: 1px; background: rgba(255,255,255,0.05); }
        .sa-gantt-bar { position: absolute; border-radius: 5px; min-width: 4px; }
        .sa-gantt-bar-tag { position: absolute; font-size: 11.5px; font-weight: 600; white-space: nowrap; line-height: ${BAR_HEIGHT}px; padding-left: 8px; }
        .sa-gantt-legend { display: flex; gap: 20px; flex-wrap: wrap; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.07); }
        .sa-gantt-legend-item { display: flex; align-items: center; gap: 7px; font-size: 12px; color: #9C93B5; }
        .sa-gantt-legend-dot { width: 11px; height: 11px; border-radius: 3px; flex-shrink: 0; }
        .sa-gantt-note { margin-top: 12px; font-size: 11.5px; color: #6B6180; }
        @page {
          size: landscape;
          margin: 12mm;
        }
        @media print {
          .sa-gantt { background: #fff !important; }
          .sa-gantt-label-tema, .sa-gantt-label-act, .sa-gantt-axis-tick, .sa-gantt-legend-item, .sa-gantt-note { color: #111 !important; }
          .sa-gantt-bar-tag { color: #111 !important; }
          .sa-gantt-gridline, .sa-gantt-row-line { background: #ccc !important; }
          .sa-gantt-bar { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sa-gantt-scroll { overflow: visible !important; }
          .sa-gantt-track { width: 100% !important; }
          .sa-gantt-labels { flex: 0 0 200px !important; }
        }
      `}</style>
      <div className="sa-gantt-body">
        <div className="sa-gantt-labels">
          <div style={{ height: AXIS_HEIGHT }} />
          {withDates.map((r) => (
            <div className="sa-gantt-label" key={r.id} title={`${r.tema || "(sin tema)"} · ${r.actividad || ""}`}>
              <span className="sa-gantt-label-tema">{r.tema || "(sin tema)"}</span>
              {r.actividad && <span className="sa-gantt-label-act">{r.actividad}</span>}
            </div>
          ))}
        </div>
        <div className="sa-gantt-scroll">
          <div className="sa-gantt-track" style={{ width: `${trackWidthPx}px`, minWidth: "100%" }}>
            <div style={{ position: "relative", height: AXIS_HEIGHT }}>
              {range.weekTicks.map((d) => (
                <span key={d} className="sa-gantt-axis-tick" style={{ left: pct(d) }}>
                  {fmtShort(new Date(range.start + d * DAY_MS))}
                </span>
              ))}
            </div>
            <div style={{ position: "relative", height: `${bodyHeight}px` }}>
              {range.weekTicks.map((d) => (
                <div key={d} className="sa-gantt-gridline" style={{ left: pct(d) }} />
              ))}
              {withDates.map((_, i) => (
                <div key={i} className="sa-gantt-row-line" style={{ top: `${(i + 1) * ROW_HEIGHT}px` }} />
              ))}
              {showToday && (
                <div className="sa-gantt-marker" title="Hoy" style={{ left: pct(todayDays), background: "#22D3EE" }} />
              )}
              {showDeadline && (
                <div className="sa-gantt-marker" title="Plazo: 10 de octubre" style={{ left: pct(deadlineDays), background: "#FF3EA5", opacity: 0.7 }} />
              )}
              {withDates.map((r, i) => {
                const s = parseDate(r.fecha_inicio).getTime();
                const e = parseDate(r.fecha_fin).getTime();
                const startDays = (s - range.start) / DAY_MS;
                const durationDays = Math.max(1, (e - s) / DAY_MS + 1);
                const top = i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2;
                const color = ESTADO_BAR_COLOR[r.estado] || ESTADO_BAR_COLOR.Pendiente;
                const dias = diasRestantesTexto(r.fecha_fin);
                return (
                  <React.Fragment key={r.id}>
                    <div
                      className="sa-gantt-bar"
                      title={`${r.estado} · ${r.fecha_inicio} → ${r.fecha_fin}`}
                      style={{ left: pct(startDays), top: `${top}px`, width: pct(durationDays), height: `${BAR_HEIGHT}px`, background: color }}
                    />
                    <span
                      className="sa-gantt-bar-tag"
                      style={{ left: `calc(${pct(startDays + durationDays)})`, top: `${top}px`, color }}
                    >
                      {r.estado}{dias ? ` · ${dias}` : ""}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="sa-gantt-legend">
        {Object.entries(ESTADO_BAR_COLOR).map(([estado, color]) => (
          <span className="sa-gantt-legend-item" key={estado}>
            <span className="sa-gantt-legend-dot" style={{ background: color }} />
            {estado}
          </span>
        ))}
      </div>
      {withoutDatesCount > 0 && (
        <p className="sa-gantt-note">
          {withoutDatesCount} actividad{withoutDatesCount === 1 ? "" : "es"} sin fecha de inicio/fin no
          {withoutDatesCount === 1 ? " aparece" : " aparecen"} en el cronograma.
        </p>
      )}
    </div>
  );
}
