import { formatearFecha } from "../lib/fechas";
import { claveHistoria } from "../lib/texto";
import { calcularEstadoQA, ordenarCiclosQA } from "../lib/estadoProyecto";
import { colorEstadoQA } from "../ui/tema";

// Vista QA a nivel proyecto: agrupa por sprint el historial completo de
// ciclos de QA (entrega → veredicto), con defectos y observaciones.
export default function VistaQA({ proyectoActual, mapaAvancePorTarea, tema }) {
  const sprints = [...new Set(proyectoActual.tareas.map(t => t.sprint))];

  const pctDeSprint = (nombreSprint) => {
    const tareas = proyectoActual.tareas.filter(t => t.sprint === nombreSprint);
    const dias = tareas.reduce((s, t) => s + (t.workdays || 0), 0);
    if (dias <= 0) return 0;
    let pct = 0;
    for (const t of tareas) {
      const pctT = mapaAvancePorTarea[claveHistoria(t.sprint, t.task)] || 0;
      pct += (pctT / 100) * (t.workdays / dias) * 100;
    }
    return Math.min(Math.round(pct * 100) / 100, 100);
  };

  const totalCiclos = (proyectoActual.qa || []).length;

  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 17, fontWeight: 600, color: tema.textoClaro, margin: 0 }}>Control de Calidad (QA)</h3>
        <span style={{ fontSize: 12, color: tema.textoMedio }}>{totalCiclos} ciclo{totalCiclos !== 1 ? "s" : ""} en {sprints.length} sprint{sprints.length !== 1 ? "s" : ""}</span>
      </div>

      {totalCiclos === 0 && (
        <div style={{ fontSize: 13, color: tema.textoMedio, padding: "20px 0", textAlign: "center" }}>
          Este proyecto aún no tiene registros de QA.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {sprints.map(nombreSprint => {
          const ciclos = ordenarCiclosQA(
            (proyectoActual.qa || []).filter(q => String(q.sprint).trim() === String(nombreSprint).trim())
          );
          if (!ciclos.length) return null;
          const pctSprint = pctDeSprint(nombreSprint);
          const qa = calcularEstadoQA(pctSprint, proyectoActual.qa, nombreSprint);
          const colorQA = colorEstadoQA(qa.estado, tema);
          return (
            <div key={nombreSprint} style={{ background: tema.fondo, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: 16 }}>
              {/* Encabezado del sprint */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: tema.morado }}>Sprint {nombreSprint}</span>
                {qa.estado && (
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: colorQA, background: `${colorQA}18`, padding: "3px 8px", borderRadius: 4 }}>{qa.estado}</span>
                )}
                <span style={{ fontSize: 11, color: tema.textoMedio }}>
                  {ciclos.length} ciclo{ciclos.length !== 1 ? "s" : ""}
                  {qa.defectos != null && <> · {qa.defectos} defecto{qa.defectos !== 1 ? "s" : ""} en el último</>}
                </span>
              </div>

              {/* Tabla de ciclos */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["Ciclo", "Entrega a QA", "Resultado", "Veredicto", "Defectos", "Observaciones"].map((h, i) => (
                        <th key={i} style={{ textAlign: i === 4 ? "right" : "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", padding: "8px", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ciclos.map((c, i) => {
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
