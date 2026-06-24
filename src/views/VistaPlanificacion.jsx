import { formatearFecha } from "../lib/fechas";
import { claveHistoria } from "../lib/texto";

// Tabla "Planificación y Estado por Historia": una fila por tarea, % acumulado
// y estado (Pendiente / En Progreso / Completado).
export default function VistaPlanificacion({ proyectoActual, mapaAvancePorTarea, tema }) {
  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tema.borde}`, background: tema.fondo }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: tema.textoClaro }}>Planificación y Estado por Historia</h3>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: tema.textoMedio }}>Porcentaje = suma acumulada de avances registrados</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: tema.fondo }}>
              {["Sprint", "Historia", "Asignado", "Inicio", "Fin", "Días", "Avance", "Estado"].map((encabezado, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{encabezado}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {proyectoActual.tareas.map((tarea, i) => {
              const pctTarea = mapaAvancePorTarea[claveHistoria(tarea.sprint, tarea.task)] || 0;
              const estadoTarea = pctTarea >= 100 ? "Completado" : pctTarea > 0 ? "En Progreso" : "Pendiente";
              const colorEstado = pctTarea >= 100 ? tema.verdeExito : pctTarea > 0 ? tema.naranja : tema.textoMedio;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                  <td style={{ padding: "10px 14px", color: tema.morado, fontWeight: 500, fontFamily: "'JetBrains Mono',monospace" }}>{tarea.sprint}</td>
                  <td style={{ padding: "10px 14px", color: tema.textoClaro, fontWeight: 500, maxWidth: 400 }}>{tarea.task}</td>
                  <td style={{ padding: "10px 14px", color: tema.textoMedio, fontSize: 11 }}>{tarea.assigned || "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap" }}>{formatearFecha(tarea.start)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap" }}>{formatearFecha(tarea.end)}</td>
                  <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600 }}>{tarea.workdays}</td>
                  <td style={{ padding: "10px 14px", minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: tema.fondo, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ width: `${pctTarea}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${colorEstado},${colorEstado}88)`, transition: "width 0.4s" }} />
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: colorEstado, minWidth: 36 }}>{pctTarea.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: colorEstado, background: `${colorEstado}18`, padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{estadoTarea}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
