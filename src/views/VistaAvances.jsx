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

  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden", marginBottom: 24 }}>
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
  );
}
