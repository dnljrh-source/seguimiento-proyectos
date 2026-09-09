import { formatearFecha } from "../lib/fechas";
import { claveHistoria } from "../lib/texto";

// Tabla "Registro de Avances": una fila por avance individual, con % acumulado
// por historia.
export default function VistaAvances({ proyectoActual, tema }) {
  // Ordenar avances por fecha fin y calcular acumulado por tarea
  const avancesOrdenados = [...proyectoActual.avances]
    .filter(avance => avance.dateEnd)
    .sort((a, b) => a.dateEnd - b.dateEnd);
  const acumulado = {};

  // Pausas no vigentes (ya finalizadas): se listan en su propia subsección para
  // no entorpecer el gráfico. Una pausa es vigente si ya inició y aún no termina.
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const pausasCerradas = (proyectoActual.pausas || [])
    .filter(p => p.inicio && !(p.inicio <= hoy && (!p.termino || p.termino >= hoy)))
    .sort((a, b) => a.inicio - b.inicio);

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap", marginBottom: 24 }}>
    <div style={{ flex: 1, minWidth: 320, background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tema.borde}`, background: tema.fondo }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: tema.textoClaro }}>Registro de Avances</h3>
        <p style={{ margin: "4px 0 0", fontSize: 11, color: tema.textoMedio }}>Cada fila es un avance individual. Los % se acumulan por historia.</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: tema.fondo }}>
              {["#", "Sprint", "Historia", "Fecha Inicio", "Fecha Fin", "% Registrado", "% Acumulado"].map((encabezado, i) => (
                <th key={i} style={{ padding: "10px 14px", textAlign: "left", color: tema.textoMedio, fontWeight: 600, textTransform: "uppercase", fontSize: 10, letterSpacing: "0.06em", borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap" }}>{encabezado}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {avancesOrdenados.map((avance, i) => {
              const clave = claveHistoria(avance.sprint, avance.task);
              if (!acumulado[clave]) acumulado[clave] = 0;
              acumulado[clave] = Math.min(acumulado[clave] + (avance.pct || 0), 100);
              const estaCompleta = acumulado[clave] >= 100;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                  <td style={{ padding: "10px 14px", color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{i + 1}</td>
                  <td style={{ padding: "10px 14px", color: tema.morado, fontWeight: 500, fontFamily: "'JetBrains Mono',monospace" }}>{avance.sprint}</td>
                  <td style={{ padding: "10px 14px", color: tema.textoClaro, maxWidth: 400, fontSize: 12 }}>{avance.task}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap" }}>{formatearFecha(avance.dateStart)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap" }}>{formatearFecha(avance.dateEnd)}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: tema.acento }}>+{(avance.pct || 0).toFixed(0)}%</td>
                  <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: estaCompleta ? tema.verdeExito : tema.textoClaro }}>{acumulado[clave].toFixed(0)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>

    {pausasCerradas.length > 0 && (
      <div style={{ width: 320, flexShrink: 0, background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${tema.borde}`, background: tema.fondo }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: tema.textoClaro }}>Pausas del desarrollo</h3>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: tema.textoMedio }}>Pausas ya finalizadas.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14 }}>
          {pausasCerradas.map((p, i) => (
            <div key={i} style={{ background: `${tema.pausa}14`, border: `1px solid ${tema.pausa}55`, borderLeft: `4px solid ${tema.pausa}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: tema.textoClaro }}>
                {formatearFecha(p.inicio)} → {formatearFecha(p.termino)}
              </div>
              {p.comentario && <div style={{ fontSize: 12, color: tema.textoMedio, marginTop: 4, lineHeight: 1.4 }}>{p.comentario}</div>}
            </div>
          ))}
        </div>
      </div>
    )}
    </div>
  );
}
