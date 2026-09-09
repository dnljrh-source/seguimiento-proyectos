import { useMemo } from "react";
import { formatearFecha } from "../lib/fechas";
import { ORDEN_ESTADOS } from "../ui/tema";

// Vista general: panorama de todos los proyectos visibles en una sola tabla,
// con KPIs de conteo por estado arriba. Cada fila abre el detalle del proyecto.
export default function VistaDashboard({ resumenes, colorDeEstado, onSelect, tema }) {
  // Conteo por estado (en orden lógico) para las tarjetas KPI.
  const conteos = useMemo(() => {
    const c = {};
    for (const r of resumenes) c[r.estado] = (c[r.estado] || 0) + 1;
    return c;
  }, [resumenes]);

  const estadosPresentes = Object.keys(ORDEN_ESTADOS).filter(e => conteos[e]);

  const th = {
    textAlign: "left", fontSize: 10, fontWeight: 600, color: tema.textoMedio,
    textTransform: "uppercase", letterSpacing: "0.06em", padding: "8px 12px",
    borderBottom: `1px solid ${tema.borde}`, whiteSpace: "nowrap",
  };
  const td = {
    fontSize: 13, color: tema.texto, padding: "10px 12px",
    borderBottom: `1px solid ${tema.borde}`, verticalAlign: "middle",
  };
  const fecha = (d) => (d ? formatearFecha(d) : "—");

  return (
    <div>
      {/* KPIs de conteo por estado */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "12px 15px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${tema.acento},transparent)` }} />
          <div style={{ fontSize: 10, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Total proyectos</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: tema.textoClaro, fontFamily: "'JetBrains Mono',monospace" }}>{resumenes.length}</div>
        </div>
        {estadosPresentes.map(estado => {
          const c = colorDeEstado(estado);
          return (
            <div key={estado} style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "12px 15px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${c},transparent)` }} />
              <div style={{ fontSize: 10, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{estado}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{conteos[estado]}</div>
            </div>
          );
        })}
      </div>

      {/* Tabla general */}
      <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr>
                <th style={th}>Proyecto</th>
                <th style={th}>Estado</th>
                <th style={th}>Desarrollador</th>
                <th style={{ ...th, minWidth: 150 }}>Avance</th>
                <th style={th}>Inicio desarrollo</th>
                <th style={th}>Término desarrollo</th>
              </tr>
            </thead>
            <tbody>
              {resumenes.map(r => {
                const cEstado = colorDeEstado(r.estado);
                const enDes = r.estado === "En Desarrollo";
                const cBarra = enDes ? (r.desviacion >= 0 ? tema.verdeExito : tema.naranja) : cEstado;
                const inicio = r.inicioReal || r.inicioPlan;
                return (
                  <tr
                    key={r.nombre}
                    onClick={() => onSelect(r.nombre)}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = tema.superficieHover)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Proyecto */}
                    <td style={{ ...td, borderLeft: `3px solid ${cEstado}` }}>
                      <div style={{ fontWeight: 600, color: tema.textoClaro, fontSize: 14 }}>{r.nombre}</div>
                      {r.nombreProyecto && (
                        <div style={{ fontSize: 11, color: tema.textoMedio, lineHeight: 1.3, marginTop: 2 }}>{r.nombreProyecto}</div>
                      )}
                    </td>

                    {/* Estado */}
                    <td style={td}>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                        color: cEstado, background: `${cEstado}18`, padding: "3px 7px", borderRadius: 4, whiteSpace: "nowrap",
                      }}>{r.estado}</span>
                      {r.pausaComentario && (
                        <div style={{ fontSize: 10, color: tema.textoMedio, marginTop: 4, maxWidth: 200, lineHeight: 1.3 }}>{r.pausaComentario}</div>
                      )}
                    </td>

                    {/* Desarrollador */}
                    <td style={{ ...td, color: tema.texto, fontSize: 12 }}>
                      {r.asignados.length ? r.asignados.join(" · ") : "—"}
                    </td>

                    {/* Avance */}
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: tema.borde, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                          <div style={{ width: `${r.pctReal}%`, height: "100%", background: cBarra, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: tema.textoClaro, fontFamily: "'JetBrains Mono',monospace", minWidth: 42, textAlign: "right" }}>
                          {r.pctReal.toFixed(0)}%
                        </span>
                      </div>
                      {enDes && (
                        <div style={{ fontSize: 10, color: r.desviacion >= 0 ? tema.verdeExito : tema.naranja, marginTop: 3 }}>
                          {r.desviacion >= 0 ? "▲" : "▼"} {r.desviacion >= 0 ? "+" : ""}{r.desviacion.toFixed(1)} pts vs. plan
                        </div>
                      )}
                    </td>

                    {/* Inicio desarrollo */}
                    <td style={{ ...td, fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: tema.textoMedio, whiteSpace: "nowrap" }}>
                      {fecha(inicio)}
                    </td>

                    {/* Término de desarrollo (real si dev completo, si no proyectado) */}
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: tema.textoClaro }}>
                        {fecha(r.finEstimado)}
                      </div>
                      {r.finEstimado && (
                        <div style={{ marginTop: 3 }}>
                          <span style={{
                            fontSize: 8.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                            color: r.finEsReal ? tema.verdeExito : tema.naranja,
                            background: `${r.finEsReal ? tema.verdeExito : tema.naranja}18`,
                            padding: "2px 6px", borderRadius: 4,
                          }}>{r.finEsReal ? "Real" : "Estimada"}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!resumenes.length && (
                <tr>
                  <td colSpan={6} style={{ ...td, textAlign: "center", color: tema.textoMedio, padding: "30px 12px" }}>
                    No hay proyectos que coincidan con los filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
