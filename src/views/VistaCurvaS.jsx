import { useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { parsearFecha, formatearFecha } from "../lib/fechas";
import { claveHistoria } from "../lib/texto";
import { calcularEstadoQA, ordenarCiclosQA } from "../lib/estadoProyecto";
import { COLORES_SPRINT, colorEstadoQA } from "../ui/tema";

// Tooltip inline: Recharts solo lo invoca durante hover. No vale la pena
// memoizarlo. Se mantiene dentro del archivo de la vista por proximidad.
function TooltipCurvaS({ active, payload, label, tema }) {
  if (!active || !payload?.length) return null;
  const fecha = parsearFecha(label);
  const vistos = new Set();
  const payloadUnico = payload.filter(entrada => {
    if (vistos.has(entrada.dataKey)) return false;
    vistos.add(entrada.dataKey);
    return entrada.value !== undefined && entrada.value !== null;
  });
  if (!payloadUnico.length) return null;
  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.bordeHover}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: tema.texto, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
      <div style={{ color: tema.textoClaro, fontWeight: 600, marginBottom: 6 }}>{fecha ? formatearFecha(fecha) : label}</div>
      {payloadUnico.map((entrada, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entrada.color, display: "inline-block" }} />
          <span>{entrada.name}:</span>
          <span style={{ fontWeight: 600, color: tema.textoClaro }}>{entrada.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// Vista "Curva S": gráfico con curvas planificada/real/proyectada + breakdown
// de sprints debajo. Incluye el botón "Descargar PNG" y el toggle
// "Graficar Planificación de Sprints" (sombreado de sprints, off por defecto).
export default function VistaCurvaS({
  proyectoSeleccionado,
  versionDatos,
  refGrafico,
  tema,
  mostrarSombrasSprint,
  setMostrarSombrasSprint,
  descargarGrafico,
  datoGrafico,
  tieneAvances,
  proyectoActual,
  listaSprints,
  mapaAvancePorTarea,
}) {
  const [sprintDetalle, setSprintDetalle] = useState(null);
  return (
    <div key={`chart-${versionDatos}-${proyectoSeleccionado}`} ref={refGrafico} style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "24px 16px 16px", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, padding: "0 8px" }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, color: tema.textoClaro, margin: 0 }}>Curva S — {proyectoSeleccionado}</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 10, color: tema.textoMedio }}>
          <button data-download-btn onClick={() => setMostrarSombrasSprint(v => !v)} style={{
            background: mostrarSombrasSprint ? tema.superficieHover : "transparent",
            color: mostrarSombrasSprint ? tema.textoClaro : tema.textoMedio,
            border: `1px solid ${mostrarSombrasSprint ? tema.bordeHover : tema.borde}`,
            borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 500, cursor: "pointer",
          }}>Graficar Planificación de Sprints</button>
          <button data-download-btn onClick={descargarGrafico} style={{
            background: tema.superficieHover, color: tema.textoClaro, border: `1px solid ${tema.bordeHover}`,
            borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 500, cursor: "pointer",
          }}>Descargar PNG</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <ComposedChart data={datoGrafico.datos} margin={{ top: 25, right: 20, left: 10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={tema.borde} />
          <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: tema.textoMedio }}
            tickFormatter={v => { const d = parsearFecha(v); return d ? `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}` : v; }}
            interval="preserveStartEnd" minTickGap={40} stroke={tema.borde}
            label={{ value: "Fecha", position: "insideBottom", offset: -15, fill: tema.textoMedio, fontSize: 12, fontWeight: 500 }} />
          <YAxis tick={{ fontSize: 10, fill: tema.textoMedio }} domain={[0, 100]} tickFormatter={v => `${v}%`} stroke={tema.borde}
            label={{ value: "% Avance", angle: -90, position: "insideLeft", offset: 5, fill: tema.textoMedio, fontSize: 12, fontWeight: 500 }} />
          <Tooltip content={<TooltipCurvaS tema={tema} />} />
          <Legend wrapperStyle={{ fontSize: 12, color: tema.texto, paddingTop: 20 }} />

          {/* Sprint shading */}
          {mostrarSombrasSprint && datoGrafico.areasSprint.map((areaSprint, i) => (
            <ReferenceArea
              key={areaSprint.name}
              x1={areaSprint.start} x2={areaSprint.end}
              y1={0} y2={100}
              fill={COLORES_SPRINT[i % COLORES_SPRINT.length]}
              stroke={tema.morado}
              strokeOpacity={0.3}
              strokeDasharray="2 4"
              label={{ value: areaSprint.name, position: "insideTop", fill: tema.morado, fontSize: 9, dy: 4 }}
            />
          ))}

          {datoGrafico.hoy && (
            <ReferenceLine x={datoGrafico.hoy} stroke={tema.naranja} strokeDasharray="4 4" strokeWidth={1.5}
              label={{ value: "Hoy", position: "top", fill: tema.naranja, fontSize: 10 }} />
          )}

          <Line type="monotone" dataKey="planificado" name="Planificado" stroke={tema.acento} strokeWidth={2.5} dot={false} strokeDasharray="6 3" connectNulls={false} isAnimationActive={false} />
          {tieneAvances && <Line type="monotone" dataKey="real" name="Real" stroke={tema.verde} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />}
          {tieneAvances && <Line type="monotone" dataKey="proyectado" name="Proyectado" stroke={tema.naranja} strokeWidth={2} dot={false} strokeDasharray="4 2" connectNulls isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Sprint breakdown — incluido en la captura PNG */}
      {proyectoActual && listaSprints.length > 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 12, marginTop: 20 }}>
          {listaSprints.map(nombreSprint => {
            const tareasDelSprint = proyectoActual.tareas.filter(tarea => tarea.sprint === nombreSprint);
            const diasSprint = tareasDelSprint.reduce((s, tarea) => s + (tarea.workdays || 0), 0);
            let pctSprint = 0;
            if (diasSprint > 0) {
              for (const tarea of tareasDelSprint) {
                const pctTarea = mapaAvancePorTarea[claveHistoria(tarea.sprint, tarea.task)] || 0;
                pctSprint += (pctTarea / 100) * (tarea.workdays / diasSprint) * 100;
              }
            }
            pctSprint = Math.min(Math.round(pctSprint * 100) / 100, 100);
            const qa = calcularEstadoQA(pctSprint, proyectoActual.qa, nombreSprint);
            const colorQA = colorEstadoQA(qa.estado, tema);
            return (
              <div data-export-card key={nombreSprint} onClick={() => setSprintDetalle(nombreSprint)}
                title="Ver detalle del sprint"
                style={{ background: tema.fondo, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: 16, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: tema.morado }}>Sprint {nombreSprint}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 9, color: tema.texto, textTransform: "uppercase", letterSpacing: "0.05em" }}>Avance desarrollo</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: pctSprint >= 100 ? tema.verdeExito : tema.textoClaro }}>{pctSprint.toFixed(0)}%</span>
                  </span>
                </div>
                <div data-export-track style={{ height: 6, background: tema.borde, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pctSprint, 100)}%`, height: "100%", borderRadius: 3, background: pctSprint >= 100 ? `linear-gradient(90deg,${tema.verdeExito},#4ADE80)` : `linear-gradient(90deg,${tema.verde},#0099CC)` }} />
                </div>
                <div style={{ fontSize: 11, color: tema.textoMedio, marginTop: 8 }}>{tareasDelSprint.length} historias · {diasSprint} días hábiles</div>
                {qa.estado && (
                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: colorQA, background: `${colorQA}18`,
                      padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap",
                    }}>{qa.estado}</span>
                    {qa.pruebas > 0 && (
                      <span style={{ fontSize: 10, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace" }}>
                        {qa.ciclo ? `Ciclo ${qa.ciclo}` : `${qa.pruebas} ciclo${qa.pruebas !== 1 ? "s" : ""}`}
                        {qa.defectos != null && <> · {qa.defectos} def</>}
                        {qa.fecha && <> · {formatearFecha(qa.fecha)}</>}
                      </span>
                    )}
                  </div>
                )}
                <div data-download-btn style={{ marginTop: 10, fontSize: 10, fontWeight: 600, color: tema.verde, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Ver detalle →
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: detalle del sprint */}
      {sprintDetalle && proyectoActual && (() => {
        const tareas = proyectoActual.tareas.filter(t => t.sprint === sprintDetalle);
        const diasSprint = tareas.reduce((s, t) => s + (t.workdays || 0), 0);
        let pctSprint = 0;
        if (diasSprint > 0) {
          for (const t of tareas) {
            const pctT = mapaAvancePorTarea[claveHistoria(t.sprint, t.task)] || 0;
            pctSprint += (pctT / 100) * (t.workdays / diasSprint) * 100;
          }
        }
        pctSprint = Math.min(Math.round(pctSprint * 100) / 100, 100);
        const qa = calcularEstadoQA(pctSprint, proyectoActual.qa, sprintDetalle);
        const colorQA = colorEstadoQA(qa.estado, tema);
        const ciclosQA = ordenarCiclosQA(
          (proyectoActual.qa || []).filter(q => String(q.sprint).trim() === String(sprintDetalle).trim())
        );
        return (
          <div onClick={() => setSprintDetalle(null)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: tema.superficie, border: `1px solid ${tema.bordeHover}`, borderRadius: 14,
              width: "min(760px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}>
              {/* Encabezado */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "18px 22px", borderBottom: `1px solid ${tema.borde}` }}>
                <div>
                  <div style={{ fontSize: 12, color: tema.textoMedio }}>{proyectoSeleccionado}</div>
                  <h3 style={{ margin: "2px 0 0", fontSize: 19, fontWeight: 700, color: tema.textoClaro }}>Sprint {sprintDetalle}</h3>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: tema.textoMedio }}>
                      Avance: <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: pctSprint >= 100 ? tema.verdeExito : tema.textoClaro }}>{pctSprint.toFixed(1)}%</span>
                    </span>
                    <span style={{ fontSize: 12, color: tema.textoMedio }}>{tareas.length} historias · {diasSprint} días hábiles</span>
                    {qa.estado && (
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: colorQA, background: `${colorQA}18`, padding: "3px 8px", borderRadius: 4 }}>{qa.estado}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setSprintDetalle(null)} style={{
                  background: "transparent", border: `1px solid ${tema.borde}`, borderRadius: 8,
                  width: 32, height: 32, cursor: "pointer", color: tema.textoMedio, fontSize: 18, lineHeight: 1, flexShrink: 0,
                }} title="Cerrar">×</button>
              </div>

              {/* Tabla de historias */}
              <div style={{ overflowY: "auto", padding: "8px 22px 20px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Historia", "Asignado", "Inicio", "Fin", "Días", "% Avance"].map((h, i) => (
                        <th key={i} style={{ position: "sticky", top: 0, background: tema.superficie, textAlign: i >= 4 ? "right" : "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", padding: "10px 8px", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tareas.map((t, i) => {
                      const pctT = Math.round((mapaAvancePorTarea[claveHistoria(t.sprint, t.task)] || 0) * 10) / 10;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                          <td style={{ padding: "9px 8px", fontSize: 12, color: tema.textoClaro, minWidth: 220 }}>{t.task}</td>
                          <td style={{ padding: "9px 8px", fontSize: 12, color: tema.texto, whiteSpace: "nowrap" }}>{t.assigned || "—"}</td>
                          <td style={{ padding: "9px 8px", fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{t.start ? formatearFecha(t.start) : "—"}</td>
                          <td style={{ padding: "9px 8px", fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{t.end ? formatearFecha(t.end) : "—"}</td>
                          <td style={{ padding: "9px 8px", fontSize: 12, color: tema.texto, fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}>{t.workdays || 0}</td>
                          <td style={{ padding: "9px 8px", textAlign: "right", minWidth: 120 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                              <div style={{ width: 60, height: 5, background: tema.borde, borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ width: `${pctT}%`, height: "100%", borderRadius: 3, background: pctT >= 100 ? tema.verdeExito : tema.verde }} />
                              </div>
                              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: pctT >= 100 ? tema.verdeExito : tema.textoClaro, minWidth: 40, textAlign: "right" }}>{pctT.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Historial de ciclos de QA */}
                {ciclosQA.length > 0 && (
                  <div style={{ marginTop: 22 }}>
                    <div style={{ fontSize: 11, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                      Historial de QA · {ciclosQA.length} ciclo{ciclosQA.length !== 1 ? "s" : ""}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          {["Ciclo", "Entrega a QA", "Resultado", "Veredicto", "Defectos", "Observaciones"].map((h, i) => (
                            <th key={i} style={{ textAlign: i === 4 ? "right" : "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", padding: "8px", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ciclosQA.map((c, i) => {
                          const cColor = colorEstadoQA(c.estado, tema);
                          return (
                            <tr key={i} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                              <td style={{ padding: "9px 8px", fontSize: 12, color: tema.textoClaro, fontFamily: "'JetBrains Mono',monospace" }}>{c.ciclo ?? "—"}</td>
                              <td style={{ padding: "9px 8px", fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{c.fechaEntrega ? formatearFecha(c.fechaEntrega) : "—"}</td>
                              <td style={{ padding: "9px 8px", fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{c.fecha ? formatearFecha(c.fecha) : "—"}</td>
                              <td style={{ padding: "9px 8px", whiteSpace: "nowrap" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: cColor, background: `${cColor}18`, padding: "3px 8px", borderRadius: 4 }}>{c.estado}</span>
                              </td>
                              <td style={{ padding: "9px 8px", fontSize: 12, color: (c.defectos > 0 ? tema.rojo : tema.texto), fontFamily: "'JetBrains Mono',monospace", textAlign: "right" }}>{c.defectos != null ? c.defectos : "—"}</td>
                              <td style={{ padding: "9px 8px", fontSize: 12, color: tema.texto, minWidth: 180 }}>{c.observaciones || "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
