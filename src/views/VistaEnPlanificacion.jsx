import { ETAPAS_PLANIFICACION, ETAPAS_INTERFAZ } from "../lib/estadoProyecto";

// Vista para proyectos en fase de planificación (previa al desarrollo).
// Reemplaza la Curva S: stepper vertical de las 7 etapas de planificación
// (izquierda) y pipeline vertical de fidelidad de interfaz (derecha).
export default function VistaEnPlanificacion({ proyecto, planificacion, tema }) {
  const total = ETAPAS_PLANIFICACION.length;
  const etapaActual = Math.min(Math.max(planificacion?.etapa || 1, 1), total);
  const completadas = etapaActual - 1;
  const pctCompleto = Math.round((completadas / total) * 100);
  const nombre = planificacion?.nombre || proyecto;
  const contraparte = planificacion?.contraparte;
  const interfaz = Math.min(Math.max(planificacion?.interfaz || 0, 0), ETAPAS_INTERFAZ.length - 1);

  return (
    <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "28px 28px 32px" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <span style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
            color: tema.lila, background: `${tema.lila}1F`, padding: "3px 8px", borderRadius: 5,
          }}>En Planificación</span>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: tema.textoClaro, margin: "12px 0 0", letterSpacing: "-0.01em" }}>{nombre}</h2>
          {contraparte && (
            <div style={{ fontSize: 13, color: tema.textoMedio, marginTop: 6 }}>
              Contraparte: <span style={{ color: tema.texto }}>{contraparte}</span>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", minWidth: 140 }}>
          <div style={{ fontSize: 11, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em" }}>Etapa</div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 700, color: tema.lila, lineHeight: 1.1 }}>
            {etapaActual}<span style={{ fontSize: 16, color: tema.textoMedio }}> / {total}</span>
          </div>
          <div style={{ marginTop: 8, height: 6, background: tema.borde, borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${pctCompleto}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${tema.lila},#B5A8E0)` }} />
          </div>
          <div style={{ fontSize: 11, color: tema.textoMedio, marginTop: 6 }}>{completadas} de {total} completadas</div>
        </div>
      </div>

      {/* Cuerpo: stepper de etapas (izq) + pipeline de interfaz vertical (der) */}
      <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Stepper vertical de las 7 etapas */}
        <div style={{ flex: 1, minWidth: 280 }}>
          {ETAPAS_PLANIFICACION.map((etapa, i) => {
            const num = i + 1;
            const esCompletada = num < etapaActual;
            const esActual = num === etapaActual;
            const esUltima = num === total;

            const colorCirculo = esCompletada ? tema.verdeExito : esActual ? tema.lila : tema.superficieHover;
            const colorBorde = esCompletada ? tema.verdeExito : esActual ? tema.lila : tema.borde;
            const colorTexto = esCompletada ? tema.texto : esActual ? tema.textoClaro : tema.textoMedio;
            const colorLinea = esCompletada ? tema.verdeExito : tema.borde;

            return (
              <div key={num} style={{ display: "flex", gap: 16, alignItems: "stretch" }}>
                {/* Columna del indicador (círculo + línea) */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                    background: esActual ? "transparent" : colorCirculo,
                    border: `2px solid ${colorBorde}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700,
                    color: esCompletada ? "#0A0A0A" : esActual ? tema.lila : tema.textoMedio,
                    boxShadow: esActual ? `0 0 0 4px ${tema.lila}22` : "none",
                  }}>
                    {esCompletada ? "✓" : num}
                  </div>
                  {!esUltima && (
                    <div style={{ width: 2, flex: 1, minHeight: 24, background: colorLinea, marginTop: 2, marginBottom: 2 }} />
                  )}
                </div>

                {/* Texto de la etapa */}
                <div style={{ paddingBottom: esUltima ? 0 : 20, paddingTop: 4 }}>
                  <div style={{ fontSize: 15, fontWeight: esActual ? 600 : 500, color: colorTexto, lineHeight: 1.3 }}>{etapa}</div>
                  <div style={{ fontSize: 11, color: esActual ? tema.lila : tema.textoMedio, marginTop: 3, fontWeight: esActual ? 600 : 400 }}>
                    {esCompletada ? "Completada" : esActual ? "En curso" : "Pendiente"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pipeline de interfaz vertical (a la derecha) */}
        <div style={{ width: 230, flexShrink: 0, background: tema.fondo, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "18px 18px 20px" }}>
          <div style={{ fontSize: 11, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em" }}>Estado interfaz</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: interfaz ? tema.verde : tema.textoMedio, margin: "4px 0 16px" }}>
            {ETAPAS_INTERFAZ[interfaz]}
          </div>
          {ETAPAS_INTERFAZ.map((nivel, i) => {
            const esCompletado = i < interfaz;
            const esActual = i === interfaz;
            const esUltimo = i === ETAPAS_INTERFAZ.length - 1;

            const colorCirculo = esCompletado ? tema.verdeExito : esActual ? tema.verde : tema.superficieHover;
            const colorBorde = esCompletado ? tema.verdeExito : esActual ? tema.verde : tema.borde;
            const colorTexto = esCompletado ? tema.texto : esActual ? tema.textoClaro : tema.textoMedio;
            const colorLinea = esCompletado ? tema.verdeExito : tema.borde;

            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 22 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
                    background: esActual ? "transparent" : colorCirculo,
                    border: `2px solid ${colorBorde}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700, color: esCompletado ? "#0A0A0A" : tema.verde,
                    boxShadow: esActual ? `0 0 0 3px ${tema.verde}22` : "none",
                  }}>
                    {esCompletado ? "✓" : esActual ? "●" : ""}
                  </div>
                  {!esUltimo && (
                    <div style={{ width: 2, flex: 1, minHeight: 16, background: colorLinea, marginTop: 2, marginBottom: 2 }} />
                  )}
                </div>
                <div style={{ paddingBottom: esUltimo ? 0 : 12, paddingTop: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: esActual ? 600 : 500, color: colorTexto, lineHeight: 1.3 }}>{nivel}</div>
                  <div style={{ fontSize: 10, color: esActual ? tema.verde : tema.textoMedio, marginTop: 2, fontWeight: esActual ? 600 : 400 }}>
                    {esCompletado ? "Completado" : esActual ? "En proceso" : "Pendiente"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
