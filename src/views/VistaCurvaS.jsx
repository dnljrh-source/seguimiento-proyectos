import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import { parsearFecha, formatearFecha } from "../lib/fechas";
import { claveHistoria } from "../lib/texto";
import { calcularEstadoQA } from "../lib/estadoProyecto";
import { COLORES_SPRINT } from "../ui/tema";

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
// de sprints debajo. Incluye el botón "Descargar PNG" y el toggle de zonas.
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
          }}>{mostrarSombrasSprint ? "Zonas activas" : "Zonas ocultas"}</button>
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
            const colorQA = qa.estado === "Aprobado" ? tema.verdeExito
                          : qa.estado === "Devuelto a desarrollo" ? tema.rojo
                          : qa.estado === "En revisión QA" ? tema.naranja
                          : tema.textoMedio;
            return (
              <div data-export-card key={nombreSprint} style={{ background: tema.fondo, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: 16 }}>
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
                        {qa.pruebas} prueba{qa.pruebas !== 1 ? "s" : ""}
                        {qa.fecha && <> · {formatearFecha(qa.fecha)}</>}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
