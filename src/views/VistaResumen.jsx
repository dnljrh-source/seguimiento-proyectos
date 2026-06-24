import { formatearFecha } from "../lib/fechas";

// Tabla "Resumen por Sprint": una fila por sprint con fechas planificadas vs.
// proyectadas y días de atraso.
export default function VistaResumen({ proyectoSeleccionado, datoGrafico, tema }) {
  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tema.borde}`, background: tema.fondo }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: tema.textoClaro }}>Resumen por Sprint</h3>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: tema.textoMedio }}>Fechas planificadas, avance real y estimación de término basada en proyección</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: tema.fondo }}>
              {["Proyecto", "Sprint", "Progreso", "F. Inicio Plan.", "F. Término Plan.", "F. Inicio Real", "F. Término Est.", "Días de Atraso"].map((col, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datoGrafico.resumenSprints.map((fila, i) => {
              const colorPct = fila.pct >= 100 ? tema.verdeExito : fila.pct > 0 ? tema.acento : tema.textoMedio;
              const diasAtraso = fila.diasAtraso;
              const colorAtraso = diasAtraso === null ? tema.textoMedio : diasAtraso > 0 ? tema.rojo : diasAtraso < 0 ? tema.verde : tema.verde;
              const labelAtraso = diasAtraso === null
                ? "—"
                : diasAtraso > 0
                  ? `+${diasAtraso}d`
                  : diasAtraso < 0
                    ? `${diasAtraso}d`
                    : "A tiempo";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                  <td style={{ padding: "10px 14px", color: tema.textoClaro, fontWeight: 500, whiteSpace: "nowrap" }}>{proyectoSeleccionado}</td>
                  <td style={{ padding: "10px 14px", color: tema.morado, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>Sprint {fila.sprint}</td>
                  <td style={{ padding: "10px 14px", minWidth: 140 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 6, background: tema.fondo, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                        <div style={{ width: `${fila.pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${colorPct},${colorPct}88)` }} />
                      </div>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 600, color: colorPct, minWidth: 36 }}>{fila.pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: tema.texto }}>{formatearFecha(fila.planStart)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: tema.texto }}>{formatearFecha(fila.planEnd)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: fila.realStart ? tema.texto : tema.textoMedio }}>{fila.realStart ? formatearFecha(fila.realStart) : "—"}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: fila.proyectedEnd ? (fila.pct >= 100 ? tema.verdeExito : tema.naranja) : tema.textoMedio }}>{fila.proyectedEnd ? formatearFecha(fila.proyectedEnd) : "—"}</td>
                  <td style={{ padding: "10px 14px" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: colorAtraso, background: `${colorAtraso}18`, padding: "3px 10px", borderRadius: 4, fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>{labelAtraso}</span>
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
