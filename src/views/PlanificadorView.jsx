import { useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import {
  parsearFecha,
  formatearFecha,
  sumarDias,
  primerDiaHabilDesde,
  agregarDiasHabiles,
} from "../lib/fechas";
import { parsearDecimal } from "../lib/texto";

// Calculadora de planificación: el usuario ingresa tareas y días hábiles,
// el componente calcula fechas inicio/fin acumulando secuencialmente y
// exporta el resultado a Excel.
export default function PlanificadorView({ tema }) {
  const [proyecto, setProyecto] = useState("");
  const [fechaInicioStr, setFechaInicioStr] = useState("");
  const [filas, setFilas] = useState([
    { id: 1, sprint: "1", tarea: "", asignado: "", diasHabiles: "" },
  ]);
  const [exportado, setExportado] = useState(false);
  const [errorImport, setErrorImport] = useState(null);
  const nextId = useRef(2);
  const refInputPlan = useRef();

  const fechaInicioProyecto = useMemo(() => parsearFecha(fechaInicioStr), [fechaInicioStr]);

  // Calcula fechas acumulando secuencialmente fila a fila
  const filasCalc = useMemo(() => {
    if (!fechaInicioProyecto) return filas.map(f => ({ ...f, inicio: null, fin: null }));
    let cursor = primerDiaHabilDesde(fechaInicioProyecto);
    return filas.map(fila => {
      const dias = parsearDecimal(fila.diasHabiles);
      if (!fila.tarea.trim() || dias <= 0) return { ...fila, inicio: null, fin: null };
      const inicio = new Date(cursor);
      const fin = agregarDiasHabiles(inicio, dias);
      cursor = primerDiaHabilDesde(sumarDias(fin, 1));
      return { ...fila, inicio, fin };
    });
  }, [filas, fechaInicioProyecto]);

  const agregarFila = () => {
    const ultima = filas[filas.length - 1];
    setFilas(prev => [...prev, {
      id: nextId.current++,
      sprint: ultima?.sprint || "1",
      tarea: "",
      asignado: ultima?.asignado || "",
      diasHabiles: "",
    }]);
  };

  const eliminarFila = (id) => setFilas(prev => prev.filter(f => f.id !== id));

  const importarDesdeExcel = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setErrorImport(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array", cellDates: true });
        // Buscar primera hoja con datos
        const hoja = wb.Sheets[wb.SheetNames[0]];
        const filasBruto = XLSX.utils.sheet_to_json(hoja, { defval: "", raw: true });
        if (!filasBruto.length) { setErrorImport("El archivo no tiene filas de datos."); return; }

        // Detectar columnas flexiblemente
        const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
        const buscar = (fila, cands) => Object.keys(fila).find(k => cands.some(c => norm(k) === c || norm(k).includes(c))) || null;

        const nuevas = [];
        let idCounter = nextId.current;

        for (const fila of filasBruto) {
          const colSprint  = buscar(fila, ["sprint"]);
          const colTarea   = buscar(fila, ["tarea", "historia", "actividad"]);
          const colAsig    = buscar(fila, ["asignado", "responsable", "recurso"]);
          const colDias    = buscar(fila, ["dias habiles", "dias", "dias hab", "workdays", "duracion"]);

          const tarea = colTarea ? String(fila[colTarea]).trim() : "";
          if (!tarea) continue;

          nuevas.push({
            id: idCounter++,
            sprint:      colSprint ? String(fila[colSprint]).trim() : "1",
            tarea,
            asignado:    colAsig   ? String(fila[colAsig]).trim()   : "",
            diasHabiles: colDias   ? (parsearDecimal(fila[colDias]) ? String(parsearDecimal(fila[colDias])) : "") : "",
          });
        }

        if (!nuevas.length) { setErrorImport("No se encontraron tareas válidas en el archivo."); return; }

        nextId.current = idCounter;
        setFilas(nuevas);
      } catch (err) {
        setErrorImport("Error al leer el archivo: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };

  const actualizarFila = (id, campo, valor) =>
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [campo]: valor } : f));

  const exportarExcel = () => {
    const datos = filasCalc
      .filter(f => f.tarea.trim() && f.inicio && f.fin)
      .map(f => ({
        Proyecto: proyecto || "Sin nombre",
        Sprint: f.sprint,
        Tarea: f.tarea,
        Asignado: f.asignado,
        Inicio: formatearFecha(f.inicio),
        Fin: formatearFecha(f.fin),
        "Dias Habiles": parsearDecimal(f.diasHabiles),
      }));
    if (!datos.length) return;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(datos);
    // Ancho de columnas
    ws["!cols"] = [{ wch: 28 }, { wch: 8 }, { wch: 48 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws, "PLANIFICACIÓN");
    XLSX.writeFile(wb, `${proyecto || "planificacion"}.xlsx`);
    setExportado(true);
    setTimeout(() => setExportado(false), 2000);
  };

  const inputStyle = {
    background: tema.fondo, color: tema.textoClaro, border: `1px solid ${tema.borde}`,
    borderRadius: 6, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", width: "100%",
    outline: "none", boxSizing: "border-box",
  };

  const totalDias = filasCalc.reduce((s, f) => s + parsearDecimal(f.diasHabiles), 0);
  const fechaFinal = filasCalc.filter(f => f.fin).slice(-1)[0]?.fin || null;

  const btnSmall = {
    background: "transparent", color: tema.textoMedio, border: `1px solid ${tema.borde}`,
    borderRadius: 5, padding: "3px 10px", fontSize: 10, fontWeight: 500, cursor: "pointer",
  };

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Encabezado + acciones en una sola barra */}
      <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          {/* Inputs */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={proyecto}
              onChange={e => setProyecto(e.target.value)}
              placeholder="Nombre del proyecto"
              style={{ ...inputStyle, width: 200 }}
            />
            <input
              type="date"
              value={fechaInicioStr}
              onChange={e => setFechaInicioStr(e.target.value)}
              style={{ ...inputStyle, width: 150, colorScheme: "dark" }}
            />
            {fechaInicioProyecto && totalDias > 0 && (
              <span style={{ fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace" }}>
                <span style={{ color: tema.verde, fontWeight: 600 }}>{totalDias}</span> días hábiles
                {fechaFinal && <> · hasta <span style={{ color: tema.textoClaro }}>{formatearFecha(fechaFinal)}</span></>}
              </span>
            )}
          </div>
          {/* Botones */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => refInputPlan.current?.click()} style={{ ...btnSmall, color: tema.textoClaro, borderColor: tema.bordeHover }}>Cargar Excel</button>
            <input ref={refInputPlan} type="file" accept=".xlsx,.xls,.xlsm" onChange={importarDesdeExcel} style={{ display: "none" }} />
            <button onClick={agregarFila} style={btnSmall}>+ Fila</button>
            <button onClick={exportarExcel} style={{
              ...btnSmall,
              color: exportado ? tema.verdeExito : tema.textoMedio,
              borderColor: exportado ? tema.verdeExito : tema.borde,
            }}>{exportado ? "Exportado" : "Exportar"}</button>
            {errorImport && <span style={{ fontSize: 10, color: tema.rojo }}>{errorImport}</span>}
          </div>
        </div>
      </div>

      {/* Tabla de tareas */}
      <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: tema.fondo }}>
                {["#", "Sprint", "Tarea", "Asignado a", "Días Háb.", "Inicio", "Fin", ""].map((h, i) => (
                  <th key={i} style={{
                    padding: "10px 12px", textAlign: "left", color: tema.textoMedio,
                    fontWeight: 600, textTransform: "uppercase", fontSize: 10,
                    letterSpacing: "0.06em", borderBottom: `1px solid ${tema.borde}`,
                    whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filasCalc.map((fila, idx) => (
                <tr key={fila.id} style={{ borderBottom: `1px solid ${tema.borde}` }}>
                  <td style={{ padding: "8px 12px", color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace", fontSize: 11, width: 32 }}>{idx + 1}</td>
                  <td style={{ padding: "6px 8px", width: 70 }}>
                    <input
                      value={fila.sprint}
                      onChange={e => actualizarFila(fila.id, "sprint", e.target.value)}
                      style={{ ...inputStyle, textAlign: "center", fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: tema.morado }}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", minWidth: 260 }}>
                    <input
                      value={fila.tarea}
                      onChange={e => actualizarFila(fila.id, "tarea", e.target.value)}
                      placeholder="Nombre de la tarea..."
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", width: 150 }}>
                    <input
                      value={fila.asignado}
                      onChange={e => actualizarFila(fila.id, "asignado", e.target.value)}
                      placeholder="Responsable"
                      style={inputStyle}
                    />
                  </td>
                  <td style={{ padding: "6px 8px", width: 90 }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={fila.diasHabiles}
                      onChange={e => actualizarFila(fila.id, "diasHabiles", e.target.value)}
                      placeholder="0"
                      style={{ ...inputStyle, textAlign: "center", fontFamily: "'JetBrains Mono',monospace" }}
                    />
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: fila.inicio ? tema.verde : tema.textoMedio, minWidth: 100 }}>
                    {fila.inicio ? formatearFecha(fila.inicio) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, whiteSpace: "nowrap", color: fila.fin ? tema.textoClaro : tema.textoMedio, minWidth: 100 }}>
                    {fila.fin ? formatearFecha(fila.fin) : "—"}
                  </td>
                  <td style={{ padding: "6px 8px", width: 36 }}>
                    {filas.length > 1 && (
                      <button
                        onClick={() => eliminarFila(fila.id)}
                        style={{ background: "transparent", border: "none", color: tema.textoMedio, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px", borderRadius: 4 }}
                        title="Eliminar fila"
                      >×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
