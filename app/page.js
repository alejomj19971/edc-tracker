"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";

const TABLE = "actividades";

const ESTADOS = [
  { value: "Pendiente", text: "#C9C2DE", bg: "rgba(156,147,181,0.16)" },
  { value: "En progreso", text: "#FFC65C", bg: "rgba(255,176,32,0.16)" },
  { value: "Completado", text: "#5EEAD4", bg: "rgba(45,212,191,0.16)" },
  { value: "Atrasado", text: "#FF8FA3", bg: "rgba(255,77,109,0.16)" },
];

const DEADLINE = new Date(2026, 9, 10, 23, 59, 59).getTime();

function getRemaining() {
  const diff = DEADLINE - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

const pad2 = (n) => String(n).padStart(2, "0");

function todayStamp() {
  const d = new Date();
  return `${pad2(d.getDate())}${pad2(d.getMonth() + 1)}${d.getFullYear()}`;
}

function daysInfo(fecha) {
  if (!fecha) return { text: "–", color: "#6B6180" };
  const target = new Date(fecha + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((target - today) / 86400000);
  if (diff < 0) return { text: `vencida ${Math.abs(diff)}d`, color: "#FF6B81" };
  if (diff === 0) return { text: "hoy", color: "#FFC65C" };
  if (diff <= 3) return { text: `${diff} día${diff === 1 ? "" : "s"}`, color: "#FFC65C" };
  return { text: `${diff} días`, color: "#9C93B5" };
}

function emptyRow() {
  return {
    tema: "",
    actividad: "",
    responsable: "",
    fecha_inicio: null,
    fecha_fin: null,
    estado: "Pendiente",
    alerta: "",
  };
}

// Textarea que crece hacia abajo a medida que se escribe, para poder ver
// todo el texto de la celda en vez de que quede oculto en una sola linea.
function AutoTextarea({ value, onChange, placeholder, className }) {
  const ref = useRef(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={onChange}
      onInput={resize}
    />
  );
}

export default function Home() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | error
  // Empieza en `undefined` (todavia no sabemos el tiempo restante) para que
  // el primer render en el servidor y en el cliente coincidan exactamente.
  // El valor real solo se calcula dentro de useEffect, es decir, despues de
  // que React ya hidrato la pagina. Esto evita el error de "Hydration failed"
  // que ocurria porque Date.now() daba un segundo distinto en servidor y
  // cliente.
  const [remaining, setRemaining] = useState(undefined);
  const timers = useRef({});

  useEffect(() => {
    setRemaining(getRemaining());
    const t = setInterval(() => setRemaining(getRemaining()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from(TABLE)
        .select("*")
        .order("created_at", { ascending: true });
      if (!cancelled) {
        if (!error && data) setRows(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleSave = useCallback((id, patch) => {
    if (timers.current[id]) clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      setSaveState("saving");
      const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
      setSaveState(error ? "error" : "idle");
    }, 400);
  }, []);

  async function addRow() {
    setSaveState("saving");
    const { data, error } = await supabase
      .from(TABLE)
      .insert(emptyRow())
      .select()
      .single();
    if (error || !data) {
      setSaveState("error");
      return;
    }
    setRows((prev) => [...prev, data]);
    setSaveState("idle");
  }

  const DATE_FIELDS = ["fecha_inicio", "fecha_fin"];

  function editCell(id, field, value) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const isEmptyDate = value === "" && DATE_FIELDS.includes(field);
    scheduleSave(id, { [field]: isEmptyDate ? null : value });
  }

  async function removeRow(id) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) setSaveState("error");
  }

  const estadoStyle = (v) => ESTADOS.find((e) => e.value === v) || ESTADOS[0];

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (!a.fecha_inicio && !b.fecha_inicio) return 0;
      if (!a.fecha_inicio) return 1;
      if (!b.fecha_inicio) return -1;
      return a.fecha_inicio.localeCompare(b.fecha_inicio);
    });
  }, [rows]);

  const totalTasks = rows.length;
  const completedTasks = rows.filter((r) => r.estado === "Completado").length;
  const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function exportExcel() {
    const data = sortedRows.map((r, i) => ({
      "#": i + 1,
      Tema: r.tema,
      Actividad: r.actividad,
      Responsable: r.responsable,
      "Fecha inicio": r.fecha_inicio,
      "Fecha fin": r.fecha_fin,
      "Días restantes": daysInfo(r.fecha_fin).text,
      Estado: r.estado,
      Alerta: r.alerta,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 4 },
      { wch: 20 },
      { wch: 32 },
      { wch: 18 },
      { wch: 12 },
      { wch: 12 },
      { wch: 15 },
      { wch: 14 },
      { wch: 26 },
    ];
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: 8 } }),
    };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Actividades");
    XLSX.writeFile(wb, `EDC${todayStamp()}.xlsx`);
  }

  function exportPDF() {
    const prevTitle = document.title;
    document.title = `EDC${todayStamp()}`;
    window.print();
    document.title = prevTitle;
  }

  return (
    <div
      className="sa-app"
      style={{
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: "#15101F",
        color: "#EDE9F7",
        padding: "28px 32px",
        borderRadius: "14px",
        maxWidth: "1080px",
        margin: "0 auto",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <style>{`
        .sa-title { font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', serif; color: #F5F2FC; }
        .sa-input { border: none; background: transparent; width: 100%; padding: 6px 4px; font-size: 13.5px; color: #EDE9F7; border-radius: 4px; box-sizing: border-box; font-family: inherit; line-height: 1.4; resize: none; overflow: hidden; display: block; }
        .sa-input:focus { outline: none; background: rgba(255,255,255,0.04); box-shadow: 0 0 0 1.5px rgba(139,92,246,0.55); }
        .sa-input::placeholder { color: #5A5270; }
        .sa-date-input { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); width: 100%; padding: 7px 8px; font-size: 12.5px; color: #EDE9F7; border-radius: 6px; box-sizing: border-box; font-family: inherit; cursor: pointer; color-scheme: dark; }
        .sa-date-input:hover { border-color: rgba(139,92,246,0.4); }
        .sa-date-input:focus { outline: none; border-color: #8B5CF6; box-shadow: 0 0 0 1.5px rgba(139,92,246,0.55); }
        .sa-date-input::-webkit-calendar-picker-indicator { filter: invert(0.9) brightness(1.4); cursor: pointer; padding: 3px; border-radius: 4px; margin-left: 4px; }
        .sa-date-input::-webkit-calendar-picker-indicator:hover { background: rgba(139,92,246,0.3); }
        .sa-select { border: none; font-size: 12.5px; font-weight: 600; padding: 5px 10px; border-radius: 20px; cursor: pointer; appearance: none; -webkit-appearance: none; }
        .sa-select:focus { outline: none; box-shadow: 0 0 0 1.5px rgba(139,92,246,0.55); }
        .sa-add-row-btn { width: 100%; background: transparent; border: 1.5px dashed rgba(139,92,246,0.4); color: #C9BFEA; border-radius: 8px; padding: 12px; font-size: 13px; cursor: pointer; font-weight: 600; }
        .sa-add-row-btn:hover { border-color: #8B5CF6; border-style: solid; background: rgba(139,92,246,0.08); color: #F5F2FC; }
        .sa-export-btn { background: transparent; color: #C9BFEA; border: 1.5px solid rgba(139,92,246,0.4); padding: 8px 14px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; }
        .sa-export-btn:hover { border-color: #8B5CF6; background: rgba(139,92,246,0.12); }
        .sa-del-btn { background: transparent; border: none; color: #6B6180; cursor: pointer; padding: 4px 6px; border-radius: 4px; opacity: 0; transition: opacity .12s; font-size: 13px; }
        .sa-row:hover .sa-del-btn { opacity: 1; }
        .sa-del-btn:hover { color: #FF6B81; background: rgba(255,77,109,0.14); }
        .sa-row { border-bottom: 1px solid rgba(255,255,255,0.07); }
        .sa-row td { vertical-align: top; padding-top: 8px; padding-bottom: 8px; }
        .sa-row:last-child { border-bottom: none; }
        .sa-table { border-collapse: collapse; width: 100%; table-layout: fixed; }
        .sa-table th { text-align: left; font-size: 11.5px; font-weight: 600; color: #8A81A3; padding: 0 4px 10px 4px; border-bottom: 1.5px solid rgba(139,92,246,0.45); }
        .sa-check-btn { width: 21px; height: 21px; border-radius: 50%; border: 1.5px solid #4B4460; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0; font-size: 12px; line-height: 1; color: transparent; flex-shrink: 0; }
        .sa-check-btn:hover { border-color: #2DD4BF; }
        .sa-check-btn.done { background: #2DD4BF; border-color: #2DD4BF; color: #0B3B36; }
        .sa-row-done { background: rgba(45,212,191,0.05); }
        .sa-row-done .sa-input, .sa-row-done .sa-select { color: #7FA69D; }
        .sa-progress { margin-bottom: 20px; }
        .sa-progress-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
        .sa-progress-label { font-size: 12.5px; color: #9C93B5; }
        .sa-progress-count { font-size: 13px; font-weight: 600; color: #F5F2FC; }
        .sa-progress-track { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; }
        .sa-progress-fill { height: 100%; border-radius: 4px; background: linear-gradient(90deg, #FF3EA5, #A855F7, #22D3EE); transition: width 0.3s ease; }
        .sa-countdown { background: #0E0A17; border: 1px solid rgba(168,85,247,0.15); border-radius: 16px; padding: 30px 20px; margin-bottom: 22px; text-align: center; box-shadow: 0 0 50px rgba(168, 85, 247, 0.18); }
        .sa-countdown-label { font-size: 12.5px; color: #9C93B5; margin: 0 0 16px 0; }
        .sa-countdown-units { display: flex; justify-content: center; align-items: flex-start; gap: 28px; flex-wrap: wrap; }
        .sa-countdown-num { display: block; font-size: 44px; font-weight: 700; line-height: 1; font-variant-numeric: tabular-nums; }
        .sa-countdown-unit-label { display: block; margin-top: 8px; font-size: 12px; color: #8A81A3; }
        .sa-print-table { display: none; }
        .sa-print-table, .sa-print-table * { color: #111 !important; }
        .sa-print-table th, .sa-print-table td { border: 1px solid #ccc; padding: 6px 8px; font-size: 12px; text-align: left; }
        .sa-print-table table { border-collapse: collapse; width: 100%; }
        @media print {
          .sa-app > *:not(.sa-print-table) { display: none !important; }
          .sa-app { box-shadow: none !important; padding: 0 !important; background: #fff !important; border: none !important; }
          .sa-print-table { display: block !important; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h2 className="sa-title" style={{ fontSize: "22px", fontWeight: 500, margin: 0 }}>
            Seguimiento de actividades EDC
          </h2>
          <p style={{ fontSize: "12.5px", color: "#9C93B5", margin: "4px 0 0 0" }}>
            {loading
              ? "Cargando actividades…"
              : rows.length === 0
              ? "Aun no hay actividades registradas"
              : `${rows.length} actividad${rows.length === 1 ? "" : "es"} registrada${rows.length === 1 ? "" : "s"}`}
            {saveState === "saving" && " · guardando…"}
            {saveState === "error" && " · no se pudo guardar"}
          </p>
        </div>
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "22px" }}>
        <button className="sa-export-btn" onClick={exportExcel}>
          Exportar Excel
        </button>
        <button className="sa-export-btn" onClick={exportPDF}>
          Exportar PDF
        </button>
      </div>
      <div className="sa-progress">
        <div className="sa-progress-row">
          <span className="sa-progress-label">Tareas completadas</span>
          <span className="sa-progress-count">{completedTasks} / {totalTasks}</span>
        </div>
        <div className="sa-progress-track">
          <div className="sa-progress-fill" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <div className="sa-countdown">
        {remaining === undefined ? (
          <p style={{ fontSize: "13px", color: "#6B6180", margin: 0 }}>Calculando tiempo restante…</p>
        ) : remaining ? (
          <>
            <p className="sa-countdown-label">Faltan para el 10 de octubre</p>
            <div className="sa-countdown-units">
              <div>
                <span className="sa-countdown-num" style={{ color: "#FF3EA5" }}>{remaining.days}</span>
                <span className="sa-countdown-unit-label">día{remaining.days === 1 ? "" : "s"}</span>
              </div>
              <div>
                <span className="sa-countdown-num" style={{ color: "#A855F7" }}>{pad2(remaining.hours)}</span>
                <span className="sa-countdown-unit-label">horas</span>
              </div>
              <div>
                <span className="sa-countdown-num" style={{ color: "#22D3EE" }}>{pad2(remaining.minutes)}</span>
                <span className="sa-countdown-unit-label">min</span>
              </div>
              <div>
                <span className="sa-countdown-num" style={{ color: "#FF3EA5" }}>{pad2(remaining.seconds)}</span>
                <span className="sa-countdown-unit-label">seg</span>
              </div>
            </div>
          </>
        ) : (
          <p style={{ fontSize: "15px", color: "#FF3EA5", margin: 0 }}>El plazo del 10 de octubre ya se cumplió</p>
        )}
      </div>
      {!loading && sortedRows.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <p style={{ color: "#6B6180", fontSize: "13.5px", marginBottom: "16px" }}>
            Aun no hay actividades registradas.
          </p>
          <button className="sa-add-row-btn" style={{ width: "auto", padding: "10px 20px" }} onClick={addRow}>
            + Agregar primera actividad
          </button>
        </div>
      ) : loading ? (
        <div style={{ padding: "32px 0", textAlign: "center", color: "#6B6180", fontSize: "13.5px" }}>
          Cargando…
        </div>
      ) : (
        <>
        <table className="sa-table">
          <thead>
            <tr>
              <th style={{ width: "22px" }}>#</th>
              <th style={{ width: "26px" }}></th>
              <th style={{ width: "10%" }}>Tema</th>
              <th style={{ width: "14%" }}>Actividad</th>
              <th style={{ width: "10%" }}>Responsable</th>
              <th style={{ width: "11%" }}>Inicio</th>
              <th style={{ width: "11%" }}>Fin</th>
              <th style={{ width: "8%" }} title="Días restantes para la fecha fin">Días</th>
              <th style={{ width: "10%" }}>Estado</th>
              <th style={{ width: "11%" }}>Alerta</th>
              <th style={{ width: "24px" }}></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => {
              const es = estadoStyle(r.estado);
              return (
                <tr className={`sa-row${r.estado === "Completado" ? " sa-row-done" : ""}`} key={r.id}>
                  <td style={{ fontSize: "12px", color: "#6B6180", padding: "8px 4px" }}>{i + 1}</td>
                  <td>
                    <button
                      className={`sa-check-btn${r.estado === "Completado" ? " done" : ""}`}
                      onClick={() => editCell(r.id, "estado", r.estado === "Completado" ? "Pendiente" : "Completado")}
                      title={r.estado === "Completado" ? "Marcar como pendiente" : "Marcar como terminada"}
                      aria-label={r.estado === "Completado" ? "Marcar como pendiente" : "Marcar como terminada"}
                    >
                      ✓
                    </button>
                  </td>
                  <td>
                    <AutoTextarea
                      className="sa-input"
                      value={r.tema || ""}
                      placeholder="Tema"
                      onChange={(e) => editCell(r.id, "tema", e.target.value)}
                    />
                  </td>
                  <td>
                    <AutoTextarea
                      className="sa-input"
                      value={r.actividad || ""}
                      placeholder="Actividad"
                      onChange={(e) => editCell(r.id, "actividad", e.target.value)}
                    />
                  </td>
                  <td>
                    <AutoTextarea
                      className="sa-input"
                      value={r.responsable || ""}
                      placeholder="Responsable"
                      onChange={(e) => editCell(r.id, "responsable", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="sa-date-input"
                      type="date"
                      value={r.fecha_inicio || ""}
                      onChange={(e) => editCell(r.id, "fecha_inicio", e.target.value)}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          try { e.currentTarget.showPicker(); } catch (err) {}
                        }
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="sa-date-input"
                      type="date"
                      value={r.fecha_fin || ""}
                      onChange={(e) => editCell(r.id, "fecha_fin", e.target.value)}
                      onClick={(e) => {
                        if (typeof e.currentTarget.showPicker === "function") {
                          try { e.currentTarget.showPicker(); } catch (err) {}
                        }
                      }}
                    />
                  </td>
                  <td style={{ fontSize: "12.5px", fontWeight: 600, color: daysInfo(r.fecha_fin).color, padding: "8px 4px", whiteSpace: "nowrap" }}>
                    {daysInfo(r.fecha_fin).text}
                  </td>
                  <td>
                    <select
                      className="sa-select"
                      style={{ background: es.bg, color: es.text }}
                      value={r.estado}
                      onChange={(e) => editCell(r.id, "estado", e.target.value)}
                    >
                      {ESTADOS.map((e) => (
                        <option key={e.value} value={e.value}>
                          {e.value}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <AutoTextarea
                      className="sa-input"
                      value={r.alerta || ""}
                      placeholder="Alerta"
                      onChange={(e) => editCell(r.id, "alerta", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      className="sa-del-btn"
                      onClick={() => removeRow(r.id)}
                      title="Eliminar"
                      aria-label="Eliminar actividad"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="sa-add-row-btn" onClick={addRow} style={{ marginTop: "10px" }}>
          + Agregar actividad
        </button>
        </>
      )}
      <div className="sa-print-table">
        <h2 style={{ marginBottom: "4px" }}>Seguimiento de actividades EDC</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Tema</th>
              <th>Actividad</th>
              <th>Responsable</th>
              <th>Inicio</th>
              <th>Fin</th>
              <th>Días</th>
              <th>Estado</th>
              <th>Alerta</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td>{r.tema}</td>
                <td>{r.actividad}</td>
                <td>{r.responsable}</td>
                <td>{r.fecha_inicio}</td>
                <td>{r.fecha_fin}</td>
                <td>{daysInfo(r.fecha_fin).text}</td>
                <td>{r.estado}</td>
                <td>{r.alerta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
