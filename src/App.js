import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, ReferenceArea } from "recharts";
import html2canvas from "html2canvas";
import datosRaw from "./datos-proyecto.json";
import buildInfo from "./build-info.json";
import {
  parsearFecha,
  formatearFecha,
  claveFecha,
  sumarDias,
  esDiaHabil,
  diasHabilesEntre,
  primerDiaHabilDesde,
  agregarDiasHabiles,
} from "./lib/fechas";
import {
  normalizarTexto,
  normalizarClave,
  claveHistoria,
  normalizarPorcentaje,
  parsearDecimal,
} from "./lib/texto";
import { tema, COLORES_SPRINT, ORDEN_ESTADOS } from "./ui/tema";
import { hidratarDatos } from "./lib/hidratar";
import { calcularEstadoQA, calcularEstadosProyectos } from "./lib/estadoProyecto";
import { construirDatosCurva } from "./lib/curvaS";


// ── Planificador ───────────────────────────────────────────────────
function PlanificadorView({ tema }) {
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
        const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
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

  const sprintActual = (id) => {
    const fila = filas.find(f => f.id === id);
    return fila?.sprint || "1";
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

// ── Main Component ─────────────────────────────────────────────────
export default function App() {
  const [proyectos, setProyectos] = useState(() => hidratarDatos(datosRaw));
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(() => {
    const nombres = Object.keys(datosRaw).sort();
    return nombres.length ? nombres[0] : null;
  });
  const [error, setError] = useState(null);
  const [vista, setVista] = useState("chart");
  const [versionDatos, setVersionDatos] = useState(0);
  const [verCalculadora, setVerCalculadora] = useState(false);
  const [verMenu, setVerMenu] = useState(false);
  const refMenu = useRef();
  const [exportandoZip, setExportandoZip] = useState(false);
  const [progresoZip, setProgresoZip] = useState({ actual: 0, total: 0 });
  const [mostrarSombrasSprint, setMostrarSombrasSprint] = useState(true);
  const refInput = useRef();
  const refGrafico = useRef();

  const buscarColumna = (fila, cands) => {
    const columnas = Object.keys(fila);
    // Exact match primero
    for (const columna of columnas) {
      const claveNorm = normalizarClave(columna);
      for (const candidato of cands) { if (claveNorm === candidato) return columna; }
    }
    // Luego partial match
    for (const columna of columnas) {
      const claveNorm = normalizarClave(columna);
      for (const candidato of cands) { if (claveNorm.includes(candidato)) return columna; }
    }
    return null;
  };

  const manejarArchivo = useCallback((evento) => {
    const file = evento.target.files[0];
    if (!file) return;
    setError(null);
    // Reset completo: limpiar dataset previo antes de cargar el nuevo
    setProyectos({});
    setProyectoSeleccionado(null);
    setVista("chart");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const libro = XLSX.read(evt.target.result, { type: "array", cellDates: true });
        const buscarHoja = (pistas) => {
          for (const nombreHoja of libro.SheetNames) {
            const nombreHojaNorm = nombreHoja.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            for (const pista of pistas) { if (nombreHojaNorm.includes(pista)) return libro.Sheets[nombreHoja]; }
          }
          return null;
        };
        const hojaPlantificacion = buscarHoja(["PLANIF"]);
        const hojaAvances = buscarHoja(["AVANCE"]);
        const hojaQA = buscarHoja(["QA"]);
        const hojaValid = buscarHoja(["VALIDACION FINAL", "VALIDACIONFINAL", "VALIDACION"]);
        if (!hojaPlantificacion) { setError('Hoja "PLANIFICACIÓN" no encontrada.'); return; }

        const filasPlanificacion = XLSX.utils.sheet_to_json(hojaPlantificacion, { defval: "", raw: true });
        const filasAvances = hojaAvances ? XLSX.utils.sheet_to_json(hojaAvances, { defval: "", raw: true }) : [];
        const filasQA = hojaQA ? XLSX.utils.sheet_to_json(hojaQA, { defval: "", raw: true }) : [];
        const filasValid = hojaValid ? XLSX.utils.sheet_to_json(hojaValid, { defval: "", raw: true }) : [];
        const mapaProyectos = {};

        for (const fila of filasPlanificacion) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colSprint = buscarColumna(fila, ["sprint"]);
          const colTarea = buscarColumna(fila, ["tarea", "historia"]);
          const colInicio = buscarColumna(fila, ["inicio"]);
          const colFin = buscarColumna(fila, ["fin", "termino"]);
          const colDias = buscarColumna(fila, ["dias habiles", "dias"]);
          const colAsignado = buscarColumna(fila, ["asignado"]);
          if (!colProyecto || !colTarea) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const sprint = colSprint ? String(fila[colSprint]).trim() : "1";
          const nombreTarea = String(fila[colTarea]).trim();
          const fechaInicio = parsearFecha(fila[colInicio]);
          const fechaFin = parsearFecha(fila[colFin]);
          const diasHabiles = colDias ? parseInt(fila[colDias]) || 0 : (fechaInicio && fechaFin ? diasHabilesEntre(fechaInicio, fechaFin) : 0);
          const asignado = colAsignado ? String(fila[colAsignado]).trim() : "";
          if (!nombreProyecto || !nombreTarea || !fechaInicio || !fechaFin) continue;
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [] };
          mapaProyectos[nombreProyecto].tareas.push({ sprint: sprint, task: nombreTarea, start: fechaInicio, end: fechaFin, workdays: diasHabiles, assigned: asignado });
        }

        for (const fila of filasAvances) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colSprint = buscarColumna(fila, ["sprint"]);
          const colTarea = buscarColumna(fila, ["tarea", "historia"]);
          const colInicio = buscarColumna(fila, ["fecha inicio", "inicio"]);
          const colFin = buscarColumna(fila, ["fecha fin", "fin", "termino"]);
          const colPorcentaje = buscarColumna(fila, ["porcentaje", "avance", "%", "pct"]);
          if (!colProyecto || !colTarea) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const sprint = colSprint ? String(fila[colSprint]).trim() : "1";
          const nombreTarea = String(fila[colTarea]).trim();
          const fechaInicioAvance = parsearFecha(fila[colInicio]);
          const fechaFinAvance = parsearFecha(fila[colFin]);
          const porcentaje = colPorcentaje ? normalizarPorcentaje(fila[colPorcentaje]) : 0;
          if (!nombreProyecto || !nombreTarea) continue;
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [] };
          mapaProyectos[nombreProyecto].avances.push({ sprint: sprint, task: nombreTarea, dateStart: fechaInicioAvance, dateEnd: fechaFinAvance, pct: porcentaje });
        }

        for (const fila of filasQA) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colSprint = buscarColumna(fila, ["sprint"]);
          const colFecha = buscarColumna(fila, ["fecha"]);
          const colEstado = buscarColumna(fila, ["estado", "resultado"]);
          if (!colProyecto || !colSprint || !colEstado) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const sprint = String(fila[colSprint]).trim();
          const fechaQA = parsearFecha(fila[colFecha]);
          const estadoRaw = String(fila[colEstado]).trim();
          if (!nombreProyecto || !sprint || !estadoRaw) continue;
          const estadoNorm = normalizarTexto(estadoRaw);
          let estado;
          if (estadoNorm.includes("aprob")) estado = "Aprobado";
          else if (estadoNorm.includes("devuelt") || estadoNorm.includes("rechaz")) estado = "Devuelto a desarrollo";
          else estado = estadoRaw;
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
          if (!mapaProyectos[nombreProyecto].qa) mapaProyectos[nombreProyecto].qa = [];
          mapaProyectos[nombreProyecto].qa.push({ sprint, fecha: fechaQA, estado });
        }

        for (const fila of filasValid) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colFecha = buscarColumna(fila, ["fecha"]);
          const colValidado = buscarColumna(fila, ["validado", "validacion", "aprobado"]);
          if (!colProyecto) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const fechaValid = parsearFecha(fila[colFecha]);
          const valRaw = colValidado ? String(fila[colValidado]).trim() : "";
          const validado = /^(si|sí|yes|y|true|1|x)$/i.test(valRaw);
          if (!nombreProyecto) continue;
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
          if (!mapaProyectos[nombreProyecto].validacionFinal) mapaProyectos[nombreProyecto].validacionFinal = [];
          mapaProyectos[nombreProyecto].validacionFinal.push({ fecha: fechaValid, validado });
        }

        setProyectos(mapaProyectos);
        const nombres = Object.keys(mapaProyectos);
        if (nombres.length) setProyectoSeleccionado(nombres[0]);
        setVersionDatos(v => v + 1);
        // Limpiar input para permitir re-importar el mismo archivo
        if (evento.target) evento.target.value = "";
      } catch (ex) {
        console.error(ex);
        setError(`Error: ${ex.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const estadosPorProyecto = useMemo(() => calcularEstadosProyectos(proyectos), [proyectos]);

  const listaProyectos = useMemo(() => {
    return Object.keys(proyectos).sort((a, b) => {
      const pa = ORDEN_ESTADOS[estadosPorProyecto[a]] ?? 99;
      const pb = ORDEN_ESTADOS[estadosPorProyecto[b]] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [proyectos, estadosPorProyecto]);

  const proyectoActual = proyectoSeleccionado && proyectos[proyectoSeleccionado];
  const datoGrafico = useMemo(() =>
    proyectoActual ? construirDatosCurva(proyectoActual.tareas, proyectoActual.avances) : { datos: [], hoy: null, areasSprint: [], inicioProyecto: null, finProyecto: null, resumenSprints: [] },
    [proyectoActual]
  );

  const totalDiasHabiles = proyectoActual ? proyectoActual.tareas.reduce((s, tarea) => s + (tarea.workdays || 0), 0) : 0;
  const listaSprints = proyectoActual ? [...new Set(proyectoActual.tareas.map(tarea => tarea.sprint))] : [];
  const tieneAvances = Boolean(proyectoActual?.avances?.some(a => a.dateEnd));

  // % por tarea usando suma acumulada de avances
  const mapaAvancePorTarea = useMemo(() => {
    const m = {};
    if (!proyectoActual) return m;
    for (const avance of proyectoActual.avances) {
      const clave = claveHistoria(avance.sprint, avance.task);
      if (!m[clave]) m[clave] = 0;
      m[clave] = Math.min(m[clave] + (avance.pct || 0), 100);
    }
    return m;
  }, [proyectoActual]);

  // % avance real actual: suma ponderada directa de avances por tarea
  // (pct_tarea × días_hábiles_tarea / total_días_hábiles)
  // Independiente del gráfico para evitar distorsiones por filtros o fechas
  const pctAvanceReal = useMemo(() => {
    if (!proyectoActual || totalDiasHabiles === 0) return 0;
    let total = 0;
    for (const tarea of proyectoActual.tareas) {
      const clave = claveHistoria(tarea.sprint, tarea.task);
      const pct = mapaAvancePorTarea[clave] || 0;
      total += (pct / 100) * (tarea.workdays / totalDiasHabiles) * 100;
    }
    return Math.min(Math.round(total * 100) / 100, 100);
  }, [proyectoActual, mapaAvancePorTarea, totalDiasHabiles]);

  // % planificado hoy
  const registroHoy = datoGrafico.datos.find(punto => punto.fecha === datoGrafico.hoy);
  const pctPlanificadoHoy = registroHoy?.planificado ?? 0;
  const desviacion = pctAvanceReal - pctPlanificadoHoy;

  // Días hábiles faltantes: workdays desde hoy hasta la fecha proyectada de fin del proyecto.
  // Se deriva directamente de la curva proyectada para ser coherente con el gráfico.
  const diasHabilFaltantes = useMemo(() => {
    if (!datoGrafico.datos.length) return 0;
    const primeroProy100 = datoGrafico.datos.find(p => p.proyectado !== undefined && p.proyectado >= 100);
    if (!primeroProy100) return 0;
    const fechaProy = parsearFecha(primeroProy100.fecha);
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    if (!fechaProy || fechaProy <= hoy) return 0;
    return diasHabilesEntre(sumarDias(hoy, 1), fechaProy);
  }, [datoGrafico]);

  // Días de atraso del proyecto: cuándo llega proyectado al 100% vs finProyecto
  const diasAtrasoProyecto = useMemo(() => {
    if (!datoGrafico.finProyecto || !datoGrafico.datos.length) return null;
    const primeroProy100 = datoGrafico.datos.find(p => p.proyectado !== undefined && p.proyectado >= 100);
    if (!primeroProy100) return null;
    const fechaProy = parsearFecha(primeroProy100.fecha);
    return Math.round((fechaProy - datoGrafico.finProyecto) / (24 * 60 * 60 * 1000));
  }, [datoGrafico]);

  const descargarGrafico = useCallback(async () => {
    const elemento = refGrafico.current;
    if (!elemento) return;
    // Tema claro para la captura
    const temaClaro = {
      fondo: "#FFFFFF", borde: "#E2E8F0", texto: "#334155", textoMedio: "#64748B", textoClaro: "#0F172A",
      acento: "#2563EB", verde: "#059669", naranja: "#D97706", morado: "#7C3AED",
    };
    // Ocultar botones durante la captura
    const botonesCaptura = elemento.querySelectorAll("[data-download-btn]");
    botonesCaptura.forEach(b => { b.style.display = "none"; });
    // Guardar estilos originales y aplicar tema claro
    const fondoOriginal = elemento.style.background;
    const bordeOriginal = elemento.style.border;
    elemento.style.background = temaClaro.fondo;
    elemento.style.border = `1px solid ${temaClaro.borde}`;
    // Textos
    const textos = elemento.querySelectorAll("text, span, div, h3");
    const estilosOriginales = [];
    textos.forEach(nodo => {
      estilosOriginales.push({ color: nodo.style.color, fill: nodo.getAttribute("fill") });
      const relleno = nodo.getAttribute("fill");
      if (relleno === tema.textoMedio || relleno === tema.texto) nodo.setAttribute("fill", temaClaro.textoMedio);
      if (relleno === tema.textoClaro) nodo.setAttribute("fill", temaClaro.textoClaro);
      if (relleno === tema.morado) nodo.setAttribute("fill", temaClaro.morado);
      if (relleno === tema.naranja) nodo.setAttribute("fill", temaClaro.naranja);
      const colorTexto = nodo.style.color;
      if (colorTexto === tema.textoMedio || colorTexto === tema.texto) nodo.style.color = temaClaro.textoMedio;
      if (colorTexto === tema.textoClaro) nodo.style.color = temaClaro.textoClaro;
    });
    // Grid lines
    const lineas = elemento.querySelectorAll("line");
    const trazosOriginales = [];
    lineas.forEach(linea => {
      trazosOriginales.push(linea.getAttribute("stroke"));
      if (linea.getAttribute("stroke") === tema.borde) linea.setAttribute("stroke", temaClaro.borde);
    });
    // Sprint cards
    const exportCards = elemento.querySelectorAll("[data-export-card]");
    const exportCardsOrig = [];
    exportCards.forEach(card => {
      exportCardsOrig.push({ bg: card.style.background, border: card.style.border });
      card.style.background = "#F1F5F9";
      card.style.border = "1px solid #E2E8F0";
    });
    const exportTracks = elemento.querySelectorAll("[data-export-track]");
    const exportTracksOrig = [];
    exportTracks.forEach(track => {
      exportTracksOrig.push(track.style.background);
      track.style.background = "#E2E8F0";
    });

    try {
      const lienzo = await html2canvas(elemento, { backgroundColor: temaClaro.fondo, scale: 2 });
      const enlaceDescarga = document.createElement("a");
      enlaceDescarga.download = `curva-s-${proyectoSeleccionado || "proyecto"}.png`;
      enlaceDescarga.href = lienzo.toDataURL("image/png");
      enlaceDescarga.click();
    } finally {
      // Restaurar botones y tema oscuro
      botonesCaptura.forEach(b => { b.style.display = ""; });
      elemento.style.background = fondoOriginal;
      elemento.style.border = bordeOriginal;
      textos.forEach((nodo, i) => {
        if (estilosOriginales[i].fill !== null) nodo.setAttribute("fill", estilosOriginales[i].fill || "");
        nodo.style.color = estilosOriginales[i].color;
      });
      lineas.forEach((linea, i) => linea.setAttribute("stroke", trazosOriginales[i] || ""));
      exportCards.forEach((card, i) => {
        card.style.background = exportCardsOrig[i].bg;
        card.style.border = exportCardsOrig[i].border;
      });
      exportTracks.forEach((track, i) => { track.style.background = exportTracksOrig[i]; });
    }
  }, [proyectoSeleccionado]);

  const descargarTablasExcel = useCallback(() => {
    if (!proyectoActual) return;

    // Hoja PLANIFICACIÓN
    const filasPlan = proyectoActual.tareas.map(t => {
      const pctT = mapaAvancePorTarea[claveHistoria(t.sprint, t.task)] || 0;
      const estadoT = pctT >= 100 ? "Completado" : pctT > 0 ? "En Progreso" : "Pendiente";
      return {
        Sprint: t.sprint,
        Historia: t.task,
        Asignado: t.assigned || "",
        Inicio: formatearFecha(t.start),
        Fin: formatearFecha(t.end),
        "Días Hábiles": t.workdays || 0,
        "Avance %": Number(pctT.toFixed(1)),
        Estado: estadoT,
      };
    });

    // Hoja AVANCES (acumulado por historia)
    const avancesOrdenados = [...proyectoActual.avances]
      .filter(a => a.dateEnd)
      .sort((a, b) => a.dateEnd - b.dateEnd);
    const acumulado = {};
    const filasAv = avancesOrdenados.map(av => {
      const clave = claveHistoria(av.sprint, av.task);
      acumulado[clave] = Math.min((acumulado[clave] || 0) + (av.pct || 0), 100);
      return {
        Sprint: av.sprint,
        Historia: av.task,
        "Fecha Inicio": av.dateStart ? formatearFecha(av.dateStart) : "",
        "Fecha Fin": av.dateEnd ? formatearFecha(av.dateEnd) : "",
        "% Registrado": Number((av.pct || 0).toFixed(1)),
        "% Acumulado": Number(acumulado[clave].toFixed(1)),
      };
    });

    // Hoja RESUMEN (por sprint)
    const filasResumen = (datoGrafico.resumenSprints || []).map(fila => ({
      Sprint: fila.sprint,
      "Avance %": Number((fila.pct || 0).toFixed(1)),
      "F. Inicio Plan.": formatearFecha(fila.planStart),
      "F. Término Plan.": formatearFecha(fila.planEnd),
      "F. Inicio Real": fila.realStart ? formatearFecha(fila.realStart) : "",
      "F. Término Est.": fila.proyectedEnd ? formatearFecha(fila.proyectedEnd) : "",
      "Días de Atraso": fila.diasAtraso === null ? "" : fila.diasAtraso,
    }));

    const wb = XLSX.utils.book_new();
    const wsPlan = XLSX.utils.json_to_sheet(filasPlan);
    wsPlan["!cols"] = [{ wch: 8 }, { wch: 48 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsPlan, "PLANIFICACIÓN");

    const wsAv = XLSX.utils.json_to_sheet(filasAv);
    wsAv["!cols"] = [{ wch: 8 }, { wch: 48 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsAv, "AVANCES");

    const wsRes = XLSX.utils.json_to_sheet(filasResumen);
    wsRes["!cols"] = [{ wch: 8 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsRes, "RESUMEN");

    XLSX.writeFile(wb, `${proyectoSeleccionado}.xlsx`);
  }, [proyectoActual, mapaAvancePorTarea, datoGrafico, proyectoSeleccionado]);

  const descargarTodosZip = useCallback(async () => {
    if (!listaProyectos.length || exportandoZip) return;
    const zip = new JSZip();
    setExportandoZip(true);
    setProgresoZip({ actual: 0, total: listaProyectos.length });

    const vistaOriginal = vista;
    const proyectoOriginal = proyectoSeleccionado;
    // Asegurar vista de gráfico antes de iterar
    setVista("chart");

    try {
      for (let i = 0; i < listaProyectos.length; i++) {
        const nombre = listaProyectos[i];
        setProyectoSeleccionado(nombre);
        setProgresoZip({ actual: i + 1, total: listaProyectos.length });
        // Esperar a que React + Recharts terminen de pintar
        await new Promise(r => setTimeout(r, 500));

        const elemento = refGrafico.current;
        if (!elemento) continue;

        // Ocultar todos los botones de descarga durante la captura
        const botonesOcultos = elemento.querySelectorAll("[data-download-btn],[data-zip-btn]");
        botonesOcultos.forEach(b => { b.style.display = "none"; });

        try {
          const temaClaro = {
            fondo: "#FFFFFF", borde: "#E2E8F0", texto: "#334155",
            textoMedio: "#64748B", textoClaro: "#0F172A",
            acento: "#2563EB", verde: "#059669", naranja: "#D97706", morado: "#7C3AED",
          };
          const fondoOrig = elemento.style.background;
          const bordeOrig = elemento.style.border;
          elemento.style.background = temaClaro.fondo;
          elemento.style.border = `1px solid ${temaClaro.borde}`;
          const textos = elemento.querySelectorAll("text, span, div, h3");
          const estilosOrig = [];
          textos.forEach(nodo => {
            estilosOrig.push({ color: nodo.style.color, fill: nodo.getAttribute("fill") });
            const f = nodo.getAttribute("fill");
            if (f === tema.textoMedio || f === tema.texto) nodo.setAttribute("fill", temaClaro.textoMedio);
            if (f === tema.textoClaro) nodo.setAttribute("fill", temaClaro.textoClaro);
            if (f === tema.morado) nodo.setAttribute("fill", temaClaro.morado);
            if (f === tema.naranja) nodo.setAttribute("fill", temaClaro.naranja);
            const c = nodo.style.color;
            if (c === tema.textoMedio || c === tema.texto) nodo.style.color = temaClaro.textoMedio;
            if (c === tema.textoClaro) nodo.style.color = temaClaro.textoClaro;
          });
          const lineas = elemento.querySelectorAll("line");
          const trazosOrig = [];
          lineas.forEach(l => {
            trazosOrig.push(l.getAttribute("stroke"));
            if (l.getAttribute("stroke") === tema.borde) l.setAttribute("stroke", temaClaro.borde);
          });
          // Sprint cards
          const exportCards = elemento.querySelectorAll("[data-export-card]");
          const exportCardsOrig = [];
          exportCards.forEach(card => {
            exportCardsOrig.push({ bg: card.style.background, border: card.style.border });
            card.style.background = "#F1F5F9";
            card.style.border = "1px solid #E2E8F0";
          });
          const exportTracks = elemento.querySelectorAll("[data-export-track]");
          const exportTracksOrig = [];
          exportTracks.forEach(track => {
            exportTracksOrig.push(track.style.background);
            track.style.background = "#E2E8F0";
          });

          try {
            const lienzo = await html2canvas(elemento, { backgroundColor: temaClaro.fondo, scale: 2 });
            const blob = await new Promise(r => lienzo.toBlob(r, "image/png"));
            if (blob) zip.file(`curva-s-${nombre.replace(/[/\\?%*:|"<>]/g, "-")}.png`, blob);
          } finally {
            elemento.style.background = fondoOrig;
            elemento.style.border = bordeOrig;
            textos.forEach((nodo, idx) => {
              if (estilosOrig[idx].fill !== null) nodo.setAttribute("fill", estilosOrig[idx].fill || "");
              nodo.style.color = estilosOrig[idx].color;
            });
            lineas.forEach((l, idx) => l.setAttribute("stroke", trazosOrig[idx] || ""));
            exportCards.forEach((card, idx) => {
              card.style.background = exportCardsOrig[idx].bg;
              card.style.border = exportCardsOrig[idx].border;
            });
            exportTracks.forEach((track, idx) => { track.style.background = exportTracksOrig[idx]; });
          }
        } finally {
          botonesOcultos.forEach(b => { b.style.display = ""; });
        }
      }

      const contenido = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(contenido);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "curvas-s.zip";
      enlace.click();
      URL.revokeObjectURL(url);
    } finally {
      setProyectoSeleccionado(proyectoOriginal);
      setVista(vistaOriginal);
      setExportandoZip(false);
      setProgresoZip({ actual: 0, total: 0 });
    }
  }, [listaProyectos, proyectoSeleccionado, vista, exportandoZip]);

  const TooltipPersonalizado = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const fecha = parsearFecha(label);
    // Deduplicate entries
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
  };

  useEffect(() => {
    const handler = (e) => { if (refMenu.current && !refMenu.current.contains(e.target)) setVerMenu(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: tema.fondo, color: tema.texto, fontFamily: "'DM Sans','Segoe UI',sans-serif", padding: "20px 24px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: tema.textoClaro, margin: 0, letterSpacing: "-0.02em" }}>
            Seguimiento de Proyectos
          </h1>
          <p style={{ color: tema.textoMedio, fontSize: 14, margin: "6px 0 0" }}>Curva S · Planificado vs Real vs Proyectado</p>
          <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: tema.textoMedio, fontFamily: "'JetBrains Mono',monospace" }}>
              {"Actualizado: " + new Date(buildInfo.buildDate).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
            {error && <span style={{ fontSize: 11, color: tema.rojo, background: "rgba(239,68,68,0.1)", padding: "4px 10px", borderRadius: 5 }}>{error}</span>}
          </div>
        </div>

        {/* Input de importación montado siempre, fuera del menú para evitar desmontaje en click */}
        <input ref={refInput} type="file" accept=".xlsx,.xls,.xlsm" onChange={manejarArchivo} style={{ display: "none" }} />

        {/* Menú 3 puntos */}
        <div ref={refMenu} style={{ position: "relative" }}>
          <button
            onClick={() => setVerMenu(v => !v)}
            style={{
              background: verMenu ? tema.superficieHover : "transparent",
              border: `1px solid ${verMenu ? tema.bordeHover : tema.borde}`,
              borderRadius: 8, width: 36, height: 36, cursor: "pointer",
              color: tema.textoMedio, fontSize: 18, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Acciones"
          >⋮</button>

          {verMenu && (
            <div style={{
              position: "absolute", top: 44, right: 0, zIndex: 100,
              background: tema.superficie, border: `1px solid ${tema.bordeHover}`,
              borderRadius: 10, padding: "6px", minWidth: 190,
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              <button onClick={() => { refInput.current?.click(); setVerMenu(false); }} style={{
                display: "block", width: "100%", textAlign: "left",
                background: "transparent", border: "none", borderRadius: 6,
                padding: "8px 12px", fontSize: 12, color: tema.textoClaro, cursor: "pointer",
              }}>Importar Excel</button>
              <button onClick={() => { setVerCalculadora(v => !v); setVerMenu(false); }} style={{
                display: "block", width: "100%", textAlign: "left",
                background: verCalculadora ? tema.superficieHover : "transparent",
                border: "none", borderRadius: 6,
                padding: "8px 12px", fontSize: 12,
                color: verCalculadora ? tema.verde : tema.textoClaro, cursor: "pointer",
              }}>{verCalculadora ? "Ocultar planificador" : "Planificar nuevo proyecto"}</button>
              {listaProyectos.length > 0 && (
                <>
                  <div style={{ height: 1, background: tema.borde, margin: "4px 0" }} />
                  {proyectoActual && (
                    <button onClick={() => { descargarTablasExcel(); setVerMenu(false); }} style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: "transparent", border: "none", borderRadius: 6,
                      padding: "8px 12px", fontSize: 12,
                      color: tema.textoClaro, cursor: "pointer",
                    }}>Descargar tablas (Excel)</button>
                  )}
                  <button data-zip-btn onClick={() => { descargarTodosZip(); setVerMenu(false); }} disabled={exportandoZip} style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: "transparent", border: "none", borderRadius: 6,
                    padding: "8px 12px", fontSize: 12,
                    color: exportandoZip ? tema.textoMedio : tema.textoClaro,
                    cursor: exportandoZip ? "not-allowed" : "pointer",
                  }}>
                    {exportandoZip ? `Generando... (${progresoZip.actual}/${progresoZip.total})` : "Descargar ZIP de gráficos"}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {verCalculadora && <PlanificadorView tema={tema} />}

      {!listaProyectos.length && (
        <div style={{ background: tema.superficie, border: `1px dashed ${tema.borde}`, borderRadius: 12, padding: "60px 40px", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }} />
          <h3 style={{ color: tema.textoClaro, fontSize: 20, fontWeight: 600, margin: "0 0 10px" }}>Importa tu archivo Excel</h3>
          <p style={{ color: tema.textoMedio, fontSize: 13, lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
            Tu archivo debe tener las hojas <strong style={{ color: tema.acento }}>PLANIFICACIÓN</strong>, <strong style={{ color: tema.acento }}>AVANCE</strong> y opcionalmente <strong style={{ color: tema.acento }}>QA</strong> y <strong style={{ color: tema.acento }}>VALIDACIÓN FINAL</strong>.
          </p>
          <div style={{ marginTop: 24, background: tema.fondo, borderRadius: 8, padding: 20, textAlign: "left", display: "inline-block", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: tema.textoMedio, lineHeight: 2 }}>
            <div style={{ color: tema.naranja, fontWeight: 600, marginBottom: 4 }}>PLANIFICACIÓN:</div>
            <div>Proyecto | Sprint | Tarea | Inicio | Fin | Días Hábiles</div>
            <div style={{ color: tema.naranja, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>AVANCE:</div>
            <div>Proyecto | Sprint | Tarea | Fecha Inicio | Fecha Fin | Porcentaje</div>
            <div style={{ color: tema.naranja, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>QA (opcional):</div>
            <div>Proyecto | Sprint | Fecha | Estado (Aprobado / Devuelto a desarrollo)</div>
            <div style={{ color: tema.naranja, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>VALIDACIÓN FINAL (opcional):</div>
            <div>Proyecto | Fecha | Validado (Sí / No)</div>
          </div>
        </div>
      )}

      {listaProyectos.length > 0 && (
        <>
          {/* Selector proyecto */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
            {listaProyectos.map(nombre => {
              const estado = estadosPorProyecto[nombre];
              const colorEstado = estado === "Finalizado" ? tema.verdeExito
                                : estado === "EN VALIDACIÓN FINAL" ? tema.acento
                                : estado === "En QA" ? tema.verde
                                : estado === "En Proceso" ? tema.naranja
                                : tema.textoMedio;
              const activo = proyectoSeleccionado === nombre;
              const asignados = [...new Set(
                (proyectos[nombre]?.tareas || [])
                  .map(t => (t.assigned || "").trim())
                  .filter(Boolean)
              )];
              return (
                <button key={nombre} onClick={() => setProyectoSeleccionado(nombre)} style={{
                  background: activo ? tema.superficieHover : tema.superficie,
                  color: activo ? tema.textoClaro : tema.texto,
                  border: `1px solid ${activo ? tema.bordeHover : tema.borde}`,
                  borderRadius: 8, padding: "8px 18px", fontSize: 15, fontWeight: 500, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, textAlign: "left",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {nombre}
                    <span style={{
                      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: colorEstado,
                      background: `${colorEstado}18`,
                      padding: "2px 6px", borderRadius: 4, whiteSpace: "nowrap",
                    }}>{estado}</span>
                  </div>
                  {asignados.length > 0 && (
                    <div style={{ fontSize: 12, fontWeight: 400, color: tema.textoMedio, lineHeight: 1.3 }}>
                      {asignados.join(" · ")}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
            {[
              (() => {
                const estadoProy = estadosPorProyecto[proyectoSeleccionado];
                if (estadoProy === "Finalizado") return { l: "Estado", v: "Finalizado", c: tema.verdeExito };
                if (estadoProy === "EN VALIDACIÓN FINAL") return { l: "Estado", v: "En Val. Final", c: tema.acento };
                if (estadoProy === "En QA") return { l: "Estado", v: "En QA", c: tema.verde };
                if (estadoProy === "En Proceso") return { l: "Estado", v: "En Proceso", c: desviacion >= 0 ? tema.verde : tema.naranja };
                return { l: "Estado", v: "Sin Iniciar", c: tema.textoMedio };
              })(),
              { l: "Avance Real", v: `${pctAvanceReal.toFixed(1)}%`, c: tema.verde },
              { l: "Planificado Hoy", v: `${pctPlanificadoHoy.toFixed(1)}%`, c: tema.acento },
            ].map((indicador, i) => (
              <div key={i} style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${indicador.c},transparent)` }} />
                <div style={{ fontSize: 12, color: tema.texto, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>{indicador.l}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: indicador.c, fontFamily: "'JetBrains Mono',monospace" }}>{indicador.v}</div>
              </div>
            ))}

            {/* Sprints · Historias · Días Hábiles — tarjeta compacta */}
            <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${tema.morado},${tema.naranja},${tema.turquesa})` }} />
              <div style={{ fontSize: 12, color: tema.texto, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sprints · Historias · Días Háb.</div>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: tema.morado, fontFamily: "'JetBrains Mono',monospace" }}>{listaSprints.length}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>SP</span>
                </div>
                <span style={{ color: tema.borde, fontSize: 16 }}>·</span>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: tema.naranja, fontFamily: "'JetBrains Mono',monospace" }}>{proyectoActual?.tareas.length || 0}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>HU</span>
                </div>
                <span style={{ color: tema.borde, fontSize: 16 }}>·</span>
                <div>
                  <span style={{ fontSize: 20, fontWeight: 700, color: tema.turquesa, fontFamily: "'JetBrains Mono',monospace" }}>{totalDiasHabiles}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>DH</span>
                </div>
              </div>
            </div>

            {/* Días hábiles faltantes */}
            <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${tema.turquesa},transparent)` }} />
              <div style={{ fontSize: 12, color: tema.texto, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Días Háb. Faltantes</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: tema.textoClaro, fontFamily: "'JetBrains Mono',monospace" }}>{diasHabilFaltantes}</div>
            </div>

            {/* Días de atraso */}
            {(() => {
              const val = diasAtrasoProyecto;
              const color = val === null ? tema.textoMedio : val > 0 ? tema.rojo : tema.verde;
              const texto = val === null ? "—" : val > 0 ? `+${val}d` : val < 0 ? `${val}d` : "A tiempo";
              return (
                <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "14px 16px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${color},transparent)` }} />
                  <div style={{ fontSize: 12, color: tema.texto, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>Días de Atraso</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'JetBrains Mono',monospace" }}>{texto}</div>
                </div>
              );
            })()}
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { k: "chart", l: "Curva S" },
              { k: "planning", l: "Planificación" },
              { k: "advances", l: "Avances" },
              { k: "summary", l: "Resumen" },
            ].map(opcion => (
              <button key={opcion.k} onClick={() => setVista(opcion.k)} style={{
                background: vista === opcion.k ? tema.superficieHover : "transparent",
                color: vista === opcion.k ? tema.textoClaro : tema.textoMedio,
                border: `1px solid ${vista === opcion.k ? tema.bordeHover : "transparent"}`,
                borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 500, cursor: "pointer"
              }}>{opcion.l}</button>
            ))}
          </div>

          {/* ───── VIEW: Chart ──────────────────────────────────────── */}
          {vista === "chart" && (
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
                  <Tooltip content={<TooltipPersonalizado />} />
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
          )}

          {/* ───── VIEW: Planning ───────────────────────────────────── */}
          {vista === "planning" && proyectoActual && (
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
          )}

          {/* ───── VIEW: Summary ────────────────────────────────────── */}
          {vista === "summary" && proyectoActual && (
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
          )}

          {/* ───── VIEW: Advances ───────────────────────────────────── */}
          {vista === "advances" && proyectoActual && (
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
                    {(() => {
                      // Ordenar avances por fecha fin y calcular acumulado por tarea
                      const avancesOrdenados = [...proyectoActual.avances].filter(avance => avance.dateEnd).sort((a, b) => {
                        if (a.dateEnd - b.dateEnd !== 0) return a.dateEnd - b.dateEnd;
                        return 0;
                      });
                      const acumulado = {};
                      return avancesOrdenados.map((avance, i) => {
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
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}


        </>
      )}
    </div>
  );
}
