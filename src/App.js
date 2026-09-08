import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import html2canvas from "html2canvas";
import datosRaw from "./datos-proyecto.json";
import buildInfo from "./build-info.json";
import {
  parsearFecha,
  formatearFecha,
  sumarDias,
  diasHabilesEntre,
} from "./lib/fechas";
import {
  normalizarTexto,
  normalizarClave,
  claveHistoria,
  normalizarPorcentaje,
} from "./lib/texto";
import { tema, ORDEN_ESTADOS } from "./ui/tema";
import { hidratarDatos } from "./lib/hidratar";
import { calcularEstadosProyectos } from "./lib/estadoProyecto";
import { construirDatosCurva } from "./lib/curvaS";
import { construirResumenProyectos } from "./lib/resumenProyectos";
import VistaDashboard from "./views/VistaDashboard";
import PlanificadorView from "./views/PlanificadorView";
import VistaCurvaS from "./views/VistaCurvaS";
import VistaPlanificacion from "./views/VistaPlanificacion";
import VistaResumen from "./views/VistaResumen";
import VistaAvances from "./views/VistaAvances";
import VistaEnPlanificacion from "./views/VistaEnPlanificacion";
import VistaQA from "./views/VistaQA";

// ── Main Component ─────────────────────────────────────────────────
export default function App() {
  const [proyectos, setProyectos] = useState(() => hidratarDatos(datosRaw));
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState(null);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState("chart");
  const [modoGeneral, setModoGeneral] = useState(true); // vista general (dashboard) vs detalle por proyecto
  const [filtroEstado, setFiltroEstado] = useState(null); // null = Todos
  const [filtroDesarrollador, setFiltroDesarrollador] = useState(null); // null = Todos
  const [filtroContraparte, setFiltroContraparte] = useState(null); // null = Todas
  const [versionDatos, setVersionDatos] = useState(0);
  const [verCalculadora, setVerCalculadora] = useState(false);
  const [verMenu, setVerMenu] = useState(false);
  const refMenu = useRef();
  const [exportandoZip, setExportandoZip] = useState(false);
  const [progresoZip, setProgresoZip] = useState({ actual: 0, total: 0 });
  const [mostrarSombrasSprint, setMostrarSombrasSprint] = useState(false);
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

  // Etapa de planificación (1-7) o 0 si finalizada / no aplica.
  // Espejo de parsearEtapaPlan en scripts/import-excel.js.
  const parsearEtapaPlan = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = parseInt(v);
    if (!isNaN(n)) return n >= 1 && n <= 7 ? n : 0;
    const s = normalizarTexto(v);
    if (!s || s.includes("finaliz") || s.includes("complet")) return 0;
    const etapas = [
      "kick off y hallazgos", "propuesta de requerimientos funcionales",
      "desarrollo de interfaces", "reunion de avances con contraparte",
      "resolucion de observaciones", "creacion de planificacion de desarrollo (sprints)",
      "firma de documentos",
    ];
    for (let i = 0; i < etapas.length; i++) {
      if (s.includes(etapas[i]) || etapas[i].includes(s)) return i + 1;
    }
    return 0;
  };

  // Nivel de fidelidad de interfaz (0=Sin interfaz, 1=Low, 2=Mid, 3=High).
  const parsearInterfaz = (v) => {
    if (v === null || v === undefined || v === "") return 0;
    const n = parseInt(v);
    if (!isNaN(n)) return n >= 0 && n <= 3 ? n : 0;
    const s = normalizarTexto(v);
    if (s.includes("high")) return 3;
    if (s.includes("mid")) return 2;
    if (s.includes("low")) return 1;
    return 0;
  };

  const manejarArchivo = useCallback((evento) => {
    const file = evento.target.files[0];
    if (!file) return;
    setError(null);
    // Reset completo: limpiar dataset previo antes de cargar el nuevo
    setProyectos({});
    setProyectoSeleccionado(null);
    setVista("chart");
    setFiltroEstado(null);
    setFiltroDesarrollador(null);
    setFiltroContraparte(null);
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
        const hojaProyectos = buscarHoja(["PROYECTOS"]);
        if (!hojaPlantificacion) { setError('Hoja "PLANIFICACIÓN" no encontrada.'); return; }

        const filasPlanificacion = XLSX.utils.sheet_to_json(hojaPlantificacion, { defval: "", raw: true });
        const filasAvances = hojaAvances ? XLSX.utils.sheet_to_json(hojaAvances, { defval: "", raw: true }) : [];
        const filasQA = hojaQA ? XLSX.utils.sheet_to_json(hojaQA, { defval: "", raw: true }) : [];
        const filasValid = hojaValid ? XLSX.utils.sheet_to_json(hojaValid, { defval: "", raw: true }) : [];
        const filasProyectos = hojaProyectos ? XLSX.utils.sheet_to_json(hojaProyectos, { defval: "", raw: true }) : [];
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
          const colCiclo = buscarColumna(fila, ["ciclo"]);
          const colFEntrega = buscarColumna(fila, ["fecha entrega", "entrega a qa", "entrega"]);
          const colFResultado = buscarColumna(fila, ["fecha resultado", "fecha de resultado", "fecha veredicto"]);
          let colEstado = buscarColumna(fila, ["resultado", "veredicto", "estado"]);
          const colDefectos = buscarColumna(fila, ["defectos", "n defectos", "nro defectos", "numero de defectos"]);
          const colObs = buscarColumna(fila, ["observaciones", "observacion", "comentarios", "comentario"]);
          const colFecha = buscarColumna(fila, ["fecha"]); // fallback hojas antiguas
          if (colEstado && (colEstado === colFResultado || colEstado === colFEntrega)) colEstado = null;
          if (!colProyecto || !colSprint || !colEstado) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const sprint = String(fila[colSprint]).trim();
          const estadoRaw = String(fila[colEstado]).trim();
          if (!nombreProyecto || !sprint || !estadoRaw) continue;
          const estadoNorm = normalizarTexto(estadoRaw);
          let estado;
          if (estadoNorm.includes("aprob")) estado = "Aprobado";
          else if (estadoNorm.includes("rechaz") || estadoNorm.includes("devuelt")) estado = "Rechazado";
          else estado = estadoRaw;
          const ciclo = colCiclo ? (parseInt(fila[colCiclo]) || null) : null;
          const fechaEntrega = colFEntrega ? parsearFecha(fila[colFEntrega]) : null;
          const fechaResultado = colFResultado ? parsearFecha(fila[colFResultado])
            : (colFecha && colFecha !== colFEntrega ? parsearFecha(fila[colFecha]) : null);
          const defectos = colDefectos ? (parseInt(fila[colDefectos]) || 0) : null;
          const observaciones = colObs ? String(fila[colObs]).trim() : "";
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
          if (!mapaProyectos[nombreProyecto].qa) mapaProyectos[nombreProyecto].qa = [];
          mapaProyectos[nombreProyecto].qa.push({ sprint, ciclo, fechaEntrega, fecha: fechaResultado, estado, defectos, observaciones });
        }

        for (const fila of filasValid) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colFecha = buscarColumna(fila, ["fecha"]);
          const colValidado = buscarColumna(fila, ["validado", "validacion", "aprobado"]);
          const colOcultar = buscarColumna(fila, ["ocultar"]);
          if (!colProyecto) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          const fechaValid = parsearFecha(fila[colFecha]);
          const valRaw = colValidado ? String(fila[colValidado]).trim() : "";
          const validado = /^(si|sí|yes|y|true|1|x)$/i.test(valRaw);
          const ocultRaw = colOcultar ? String(fila[colOcultar]).trim() : "";
          const ocultar = /^(si|sí|yes|y|true|1|x)$/i.test(ocultRaw);
          if (!nombreProyecto) continue;
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
          if (!mapaProyectos[nombreProyecto].validacionFinal) mapaProyectos[nombreProyecto].validacionFinal = [];
          mapaProyectos[nombreProyecto].validacionFinal.push({ fecha: fechaValid, validado, ocultar });
        }

        for (const fila of filasProyectos) {
          const colProyecto = buscarColumna(fila, ["proyecto"]);
          const colNombre = buscarColumna(fila, ["nombre"]);
          const colContraparte = buscarColumna(fila, ["contraparte"]);
          const colInterfaz = buscarColumna(fila, ["estado interfaz", "interfaz"]);
          let colEstado = buscarColumna(fila, ["estado", "etapa"]);
          // Evita que "Estado interfaz" sea capturada por la búsqueda de "estado".
          if (colEstado && colEstado === colInterfaz) colEstado = null;
          if (!colProyecto) continue;
          const nombreProyecto = String(fila[colProyecto]).trim();
          if (!nombreProyecto) continue;
          const nombre = colNombre ? String(fila[colNombre]).trim() : "";
          const contraparte = colContraparte ? String(fila[colContraparte]).trim() : "";
          const etapa = parsearEtapaPlan(colEstado ? fila[colEstado] : "");
          const interfaz = parsearInterfaz(colInterfaz ? fila[colInterfaz] : "");
          if (!mapaProyectos[nombreProyecto]) mapaProyectos[nombreProyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
          mapaProyectos[nombreProyecto].planificacion = { nombre, contraparte, etapa, interfaz };
        }

        setProyectos(mapaProyectos);
        // No autoseleccionar: se muestra el prompt "selecciona un proyecto".
        setProyectoSeleccionado(null);
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

  // Proyectos ocultos: la entrada de validación final vigente (más reciente)
  // tiene "Ocultar" = Sí. Se excluyen del seguimiento y de los conteos.
  const proyectosOcultos = useMemo(() => {
    const ocultos = new Set();
    for (const [nombre, datos] of Object.entries(proyectos)) {
      const vf = (datos.validacionFinal || []).slice().sort((a, b) => {
        const fa = a.fecha ? a.fecha.getTime() : 0;
        const fb = b.fecha ? b.fecha.getTime() : 0;
        return fb - fa;
      });
      if (vf[0]?.ocultar) ocultos.add(nombre);
    }
    return ocultos;
  }, [proyectos]);

  const listaProyectos = useMemo(() => {
    return Object.keys(proyectos).filter(n => !proyectosOcultos.has(n)).sort((a, b) => {
      const pa = ORDEN_ESTADOS[estadosPorProyecto[a]] ?? 99;
      const pb = ORDEN_ESTADOS[estadosPorProyecto[b]] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.localeCompare(b);
    });
  }, [proyectos, estadosPorProyecto, proyectosOcultos]);

  // Color asociado a cada estado general (reutilizado en filtro y selector).
  const colorDeEstado = (estado) =>
      estado === "Finalizado" ? tema.verdeExito
    : estado === "EN VALIDACIÓN FINAL" ? tema.acento
    : estado === "En QA" ? tema.verde
    : estado === "En Desarrollo" ? tema.naranja
    : estado === "En Planificación" ? tema.lila
    : tema.textoMedio;

  // Conteo de proyectos por estado y estados presentes (en orden lógico).
  const conteosPorEstado = useMemo(() => {
    const conteo = {};
    for (const nombre of listaProyectos) {
      const estado = estadosPorProyecto[nombre];
      conteo[estado] = (conteo[estado] || 0) + 1;
    }
    return conteo;
  }, [listaProyectos, estadosPorProyecto]);

  const estadosDisponibles = useMemo(
    () => Object.keys(ORDEN_ESTADOS).filter(estado => conteosPorEstado[estado]),
    [conteosPorEstado]
  );

  // Conteo de proyectos por desarrollador asignado (según tareas).
  const conteosPorDesarrollador = useMemo(() => {
    const conteo = {};
    for (const nombre of listaProyectos) {
      const devs = new Set((proyectos[nombre]?.tareas || []).map(t => (t.assigned || "").trim()).filter(Boolean));
      for (const dev of devs) conteo[dev] = (conteo[dev] || 0) + 1;
    }
    return conteo;
  }, [listaProyectos, proyectos]);

  const desarrolladoresDisponibles = useMemo(
    () => Object.keys(conteosPorDesarrollador).sort((a, b) => a.localeCompare(b)),
    [conteosPorDesarrollador]
  );

  const proyectoTieneDev = (nombre, dev) =>
    (proyectos[nombre]?.tareas || []).some(t => (t.assigned || "").trim() === dev);

  // Contrapartes de un proyecto: se separan por " y " (ej. "Comercial y
  // Operaciones" = dos contrapartes distintas).
  const contrapartesDe = (nombre) =>
    String(proyectos[nombre]?.planificacion?.contraparte || "")
      .split(/\s+y\s+/i).map(s => s.trim()).filter(Boolean);

  const conteosPorContraparte = useMemo(() => {
    const conteo = {};
    for (const nombre of listaProyectos) {
      for (const cp of new Set(contrapartesDe(nombre))) conteo[cp] = (conteo[cp] || 0) + 1;
    }
    return conteo;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaProyectos, proyectos]);

  const contrapartesDisponibles = useMemo(
    () => Object.keys(conteosPorContraparte).sort((a, b) => a.localeCompare(b)),
    [conteosPorContraparte]
  );

  // Lista visible según los filtros de estado, desarrollador y contraparte.
  const filtrarProyectos = (estado, dev, contraparte) => listaProyectos.filter(n =>
    (!estado || estadosPorProyecto[n] === estado) &&
    (!dev || proyectoTieneDev(n, dev)) &&
    (!contraparte || contrapartesDe(n).includes(contraparte))
  );

  const listaProyectosVisible = useMemo(
    () => filtrarProyectos(filtroEstado, filtroDesarrollador, filtroContraparte),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listaProyectos, estadosPorProyecto, proyectos, filtroEstado, filtroDesarrollador, filtroContraparte]
  );

  // Al cambiar un filtro, si el proyecto activo quedó fuera, se deselecciona.
  const aplicarFiltro = (nuevo) => {
    setFiltroEstado(nuevo);
    const visibles = filtrarProyectos(nuevo, filtroDesarrollador, filtroContraparte);
    if (proyectoSeleccionado && !visibles.includes(proyectoSeleccionado)) setProyectoSeleccionado(null);
  };

  const aplicarFiltroDev = (nuevo) => {
    setFiltroDesarrollador(nuevo);
    const visibles = filtrarProyectos(filtroEstado, nuevo, filtroContraparte);
    if (proyectoSeleccionado && !visibles.includes(proyectoSeleccionado)) setProyectoSeleccionado(null);
  };

  const aplicarFiltroContraparte = (nuevo) => {
    setFiltroContraparte(nuevo);
    const visibles = filtrarProyectos(filtroEstado, filtroDesarrollador, nuevo);
    if (proyectoSeleccionado && !visibles.includes(proyectoSeleccionado)) setProyectoSeleccionado(null);
  };

  // Selección de proyecto: los proyectos "En QA" abren directamente la pestaña QA.
  // Si venías en QA y el nuevo proyecto no está En QA, vuelve a la Curva S.
  const seleccionarProyecto = (nombre) => {
    setProyectoSeleccionado(nombre);
    setModoGeneral(false); // al elegir un proyecto se pasa al detalle
    if (estadosPorProyecto[nombre] === "En QA") setVista("qa");
    else if (vista === "qa") setVista("chart");
  };

  // Resumen de cada proyecto visible (para la vista general / dashboard).
  const resumenesVisibles = useMemo(
    () => construirResumenProyectos(proyectos, estadosPorProyecto, listaProyectosVisible),
    [proyectos, estadosPorProyecto, listaProyectosVisible]
  );

  // Si el proyecto seleccionado quedó oculto o fuera de la lista, se deselecciona
  // (vuelve al estado "sin selección"). No se fuerza selección en el arranque.
  useEffect(() => {
    if (proyectoSeleccionado && !listaProyectos.includes(proyectoSeleccionado)) {
      setProyectoSeleccionado(null);
    }
  }, [listaProyectos, proyectoSeleccionado]);

  const proyectoActual = proyectoSeleccionado && proyectos[proyectoSeleccionado];
  const enPlanificacion = estadosPorProyecto[proyectoSeleccionado] === "En Planificación";
  // Con desarrollo al 100% (QA / Validación Final / Finalizado) las métricas de
  // avance vs. planificado y días faltantes/atraso pierden sentido.
  const devCompleto = ["En QA", "EN VALIDACIÓN FINAL", "Finalizado"].includes(estadosPorProyecto[proyectoSeleccionado]);
  const datoGrafico = useMemo(() =>
    proyectoActual ? construirDatosCurva(proyectoActual.tareas, proyectoActual.avances) : { datos: [], hoy: null, areasSprint: [], inicioProyecto: null, finProyecto: null, resumenSprints: [] },
    [proyectoActual]
  );

  const totalDiasHabiles = proyectoActual ? proyectoActual.tareas.reduce((s, tarea) => s + (tarea.workdays || 0), 0) : 0;
  const listaSprints = proyectoActual ? [...new Set(proyectoActual.tareas.map(tarea => tarea.sprint))] : [];
  const asignadosActual = proyectoActual
    ? [...new Set(proyectoActual.tareas.map(t => (t.assigned || "").trim()).filter(Boolean))]
    : [];
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

    // Hoja QA (ciclos por sprint)
    const filasQA = (proyectoActual.qa || [])
      .slice()
      .sort((a, b) => String(a.sprint).localeCompare(String(b.sprint)) || (a.ciclo || 0) - (b.ciclo || 0))
      .map(q => ({
        Sprint: q.sprint,
        Ciclo: q.ciclo ?? "",
        "Fecha Entrega a QA": q.fechaEntrega ? formatearFecha(q.fechaEntrega) : "",
        "Fecha Resultado": q.fecha ? formatearFecha(q.fecha) : "",
        Resultado: q.estado,
        "N° Defectos": q.defectos ?? "",
        Observaciones: q.observaciones || "",
      }));
    if (filasQA.length) {
      const wsQA = XLSX.utils.json_to_sheet(filasQA);
      wsQA["!cols"] = [{ wch: 8 }, { wch: 7 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, wsQA, "QA");
    }

    XLSX.writeFile(wb, `${proyectoSeleccionado}.xlsx`);
  }, [proyectoActual, mapaAvancePorTarea, datoGrafico, proyectoSeleccionado]);

  // Exporta TODA la base (todos los proyectos, incluidos ocultos) en el mismo
  // formato de las hojas de carga, de modo que el archivo pueda re-importarse.
  // Las fechas van como texto DD-MM-YYYY y los avances como decimal (0-1),
  // tal como los espera manejarArchivo / scripts/import-excel.js.
  const descargarBaseCompleta = useCallback(() => {
    const nombres = Object.keys(proyectos);
    if (!nombres.length) return;

    const filasPlan = [];
    const filasAv = [];
    const filasQA = [];
    const filasVF = [];
    const filasProy = [];

    for (const nombre of nombres) {
      const datos = proyectos[nombre];
      for (const t of datos.tareas || []) {
        filasPlan.push({
          Proyecto: nombre,
          Sprint: t.sprint,
          Tarea: t.task,
          Inicio: t.start || "",
          Fin: t.end || "",
          "Días Hábiles": t.workdays || 0,
          Asignado: t.assigned || "",
        });
      }
      for (const a of datos.avances || []) {
        filasAv.push({
          Proyecto: nombre,
          Sprint: a.sprint,
          Tarea: a.task,
          "Fecha Inicio": a.dateStart || "",
          "Fecha Fin": a.dateEnd || "",
          Porcentaje: Number(((a.pct || 0) / 100).toFixed(4)), // decimal 0-1
        });
      }
      for (const q of datos.qa || []) {
        filasQA.push({
          Proyecto: nombre,
          Sprint: q.sprint,
          Ciclo: q.ciclo ?? "",
          "Fecha Entrega a QA": q.fechaEntrega || "",
          "Fecha Resultado": q.fecha || "",
          Resultado: q.estado || "",
          "N° Defectos": q.defectos ?? "",
          Observaciones: q.observaciones || "",
        });
      }
      for (const v of datos.validacionFinal || []) {
        filasVF.push({
          Proyecto: nombre,
          Fecha: v.fecha || "",
          Validado: v.validado ? "Sí" : "No",
          Ocultar: v.ocultar ? "Sí" : "No",
        });
      }
      if (datos.planificacion) {
        const etapa = datos.planificacion.etapa || 0;
        filasProy.push({
          Proyecto: nombre,
          Nombre: datos.planificacion.nombre || "",
          Contraparte: datos.planificacion.contraparte || "",
          Estado: etapa >= 1 && etapa <= 7 ? etapa : "Finalizada",
          "Estado interfaz": datos.planificacion.interfaz || 0,
        });
      }
    }

    const wb = XLSX.utils.book_new();

    // Marca las columnas indicadas como celdas de fecha nativas de Excel
    // (tipo 'd') con formato DD-MM-YYYY, para que se vean/editen como fechas.
    const aplicarFormatoFecha = (ws, columnas) => {
      if (!ws["!ref"]) return;
      const rango = XLSX.utils.decode_range(ws["!ref"]);
      const colsFecha = [];
      for (let C = rango.s.c; C <= rango.e.c; C++) {
        const encabezado = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
        if (encabezado && columnas.includes(encabezado.v)) colsFecha.push(C);
      }
      for (const C of colsFecha) {
        for (let R = 1; R <= rango.e.r; R++) {
          const celda = ws[XLSX.utils.encode_cell({ r: R, c: C })];
          if (celda && celda.t === "d") celda.z = "dd-mm-yyyy";
        }
      }
    };

    const wsPlan = XLSX.utils.json_to_sheet(filasPlan, { cellDates: true });
    wsPlan["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 48 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 20 }];
    aplicarFormatoFecha(wsPlan, ["Inicio", "Fin"]);
    XLSX.utils.book_append_sheet(wb, wsPlan, "PLANIFICACIÓN");

    const wsAv = XLSX.utils.json_to_sheet(filasAv, { cellDates: true });
    wsAv["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 48 }, { wch: 13 }, { wch: 13 }, { wch: 12 }];
    aplicarFormatoFecha(wsAv, ["Fecha Inicio", "Fecha Fin"]);
    XLSX.utils.book_append_sheet(wb, wsAv, "AVANCE");

    if (filasQA.length) {
      const wsQA = XLSX.utils.json_to_sheet(filasQA, { cellDates: true });
      wsQA["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 7 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 11 }, { wch: 40 }];
      aplicarFormatoFecha(wsQA, ["Fecha Entrega a QA", "Fecha Resultado"]);
      XLSX.utils.book_append_sheet(wb, wsQA, "QA");
    }

    if (filasVF.length) {
      const wsVF = XLSX.utils.json_to_sheet(filasVF, { cellDates: true });
      wsVF["!cols"] = [{ wch: 12 }, { wch: 13 }, { wch: 10 }, { wch: 10 }];
      aplicarFormatoFecha(wsVF, ["Fecha"]);
      XLSX.utils.book_append_sheet(wb, wsVF, "VALIDACIÓN FINAL");
    }

    if (filasProy.length) {
      const wsProy = XLSX.utils.json_to_sheet(filasProy);
      wsProy["!cols"] = [{ wch: 12 }, { wch: 30 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsProy, "PROYECTOS");
    }

    const hoy = new Date();
    const stamp = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    XLSX.writeFile(wb, `base-proyectos-${stamp}.xlsx`);
  }, [proyectos]);

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
                  <button onClick={() => { descargarBaseCompleta(); setVerMenu(false); }} style={{
                    display: "block", width: "100%", textAlign: "left",
                    background: "transparent", border: "none", borderRadius: 6,
                    padding: "8px 12px", fontSize: 12, color: tema.textoClaro, cursor: "pointer",
                  }}>Descargar base (Excel)</button>
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
            <div>Proyecto | Sprint | Ciclo | Fecha Entrega a QA | Fecha Resultado | Resultado (Aprobado / Rechazado) | N° Defectos | Observaciones</div>
            <div style={{ color: tema.naranja, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>VALIDACIÓN FINAL (opcional):</div>
            <div>Proyecto | Fecha | Validado (Sí / No) | Ocultar (Sí = ocultar del seguimiento)</div>
            <div style={{ color: tema.naranja, fontWeight: 600, marginTop: 12, marginBottom: 4 }}>PROYECTOS (opcional · fase de planificación):</div>
            <div>Proyecto | Nombre | Contraparte | Estado (etapa 1-7 · "Finalizada" al terminar) | Estado interfaz (0=Sin interfaz · 1-3)</div>
          </div>
        </div>
      )}

      {listaProyectos.length > 0 && (
        <>
          {/* Toggle: vista general (dashboard) vs detalle por proyecto */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
            {[
              { k: true, l: "Vista general" },
              { k: false, l: "Detalle por proyecto" },
            ].map(opcion => (
              <button key={String(opcion.k)} onClick={() => setModoGeneral(opcion.k)} style={{
                background: modoGeneral === opcion.k ? tema.superficieHover : "transparent",
                color: modoGeneral === opcion.k ? tema.textoClaro : tema.textoMedio,
                border: `1px solid ${modoGeneral === opcion.k ? tema.bordeHover : tema.borde}`,
                borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}>{opcion.l}</button>
            ))}
          </div>

          {/* Filtros (estado · desarrollador · contraparte) */}
          {(() => {
            const estiloSelect = {
              background: tema.superficie, color: tema.textoClaro,
              border: `1px solid ${tema.borde}`, borderRadius: 8,
              padding: "6px 10px", fontSize: 12, fontFamily: "inherit",
              cursor: "pointer", outline: "none", colorScheme: "dark", minWidth: 150,
            };
            const etiquetaStyle = { fontSize: 10, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 };
            return (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, alignItems: "flex-end" }}>
                <label style={{ display: "flex", flexDirection: "column" }}>
                  <span style={etiquetaStyle}>Estado</span>
                  <select value={filtroEstado || ""} onChange={e => aplicarFiltro(e.target.value || null)} style={estiloSelect}>
                    <option value="">Todos ({listaProyectos.length})</option>
                    {estadosDisponibles.map(estado => (
                      <option key={estado} value={estado}>{estado} ({conteosPorEstado[estado]})</option>
                    ))}
                  </select>
                </label>

                {desarrolladoresDisponibles.length > 0 && (
                  <label style={{ display: "flex", flexDirection: "column" }}>
                    <span style={etiquetaStyle}>Desarrollador</span>
                    <select value={filtroDesarrollador || ""} onChange={e => aplicarFiltroDev(e.target.value || null)} style={estiloSelect}>
                      <option value="">Todos</option>
                      {desarrolladoresDisponibles.map(dev => (
                        <option key={dev} value={dev}>{dev} ({conteosPorDesarrollador[dev]})</option>
                      ))}
                    </select>
                  </label>
                )}

                {contrapartesDisponibles.length > 0 && (
                  <label style={{ display: "flex", flexDirection: "column" }}>
                    <span style={etiquetaStyle}>Contraparte</span>
                    <select value={filtroContraparte || ""} onChange={e => aplicarFiltroContraparte(e.target.value || null)} style={estiloSelect}>
                      <option value="">Todas</option>
                      {contrapartesDisponibles.map(cp => (
                        <option key={cp} value={cp}>{cp} ({conteosPorContraparte[cp]})</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            );
          })()}

          {/* Vista general: tabla panorámica de todos los proyectos */}
          {modoGeneral && (
            <VistaDashboard
              resumenes={resumenesVisibles}
              colorDeEstado={colorDeEstado}
              onSelect={seleccionarProyecto}
              tema={tema}
            />
          )}

          {/* Layout detalle: lista lateral de proyectos + vista */}
          {!modoGeneral && (
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* Lista lateral de proyectos */}
          <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, position: "sticky", top: 20, maxHeight: "calc(100vh - 170px)", overflowY: "auto", paddingRight: 4 }}>
            {listaProyectosVisible.map(nombre => {
              const estado = estadosPorProyecto[nombre];
              const colorEstado = colorDeEstado(estado);
              const activo = proyectoSeleccionado === nombre;
              const nombreProyecto = (proyectos[nombre]?.planificacion?.nombre || "").trim();
              return (
                <button key={nombre} onClick={() => seleccionarProyecto(nombre)} style={{
                  background: activo ? tema.superficieHover : tema.superficie,
                  color: activo ? tema.textoClaro : tema.texto,
                  border: `1px solid ${activo ? tema.bordeHover : tema.borde}`,
                  borderLeft: `3px solid ${activo ? colorEstado : "transparent"}`,
                  borderRadius: 8, padding: "8px 12px", fontSize: 15, fontWeight: 500, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3, textAlign: "left",
                  width: "100%",
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
                  {nombreProyecto && (
                    <div style={{ fontSize: 11, fontWeight: 400, color: tema.textoMedio, lineHeight: 1.3 }}>
                      {nombreProyecto}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Columna de la vista del proyecto seleccionado */}
          <div style={{ flex: 1, minWidth: 0 }}>

          {/* ───── Sin proyecto seleccionado ────────────────────────── */}
          {!proyectoActual && (
            <div style={{ background: tema.superficie, border: `1px dashed ${tema.borde}`, borderRadius: 12, padding: "70px 40px", textAlign: "center" }}>
              <h3 style={{ color: tema.textoClaro, fontSize: 19, fontWeight: 600, margin: "0 0 8px" }}>Selecciona un proyecto</h3>
              <p style={{ color: tema.textoMedio, fontSize: 13, lineHeight: 1.6, maxWidth: 420, margin: "0 auto" }}>
                Elige un proyecto de la lista de la izquierda para ver su detalle. Puedes usar los filtros de estado y desarrollador para acotar la búsqueda.
              </p>
            </div>
          )}

          {/* ───── Proyecto en fase de planificación ────────────────── */}
          {enPlanificacion && proyectoActual && (
            <VistaEnPlanificacion proyecto={proyectoSeleccionado} planificacion={proyectoActual.planificacion} tema={tema} />
          )}

          {/* ───── Proyecto en desarrollo (KPIs + Curva S + vistas) ──── */}
          {!enPlanificacion && proyectoActual && (
          <>
          {/* Info: desarrollador asignado y contraparte */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 10, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em" }}>Desarrollador asignado</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: tema.textoClaro }}>
                {asignadosActual.length ? asignadosActual.join(" · ") : "—"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontSize: 10, color: tema.textoMedio, textTransform: "uppercase", letterSpacing: "0.06em" }}>Contraparte</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: tema.textoClaro }}>
                {(proyectoActual?.planificacion?.contraparte || "").trim() || "—"}
              </span>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 18 }}>
            {[
              (() => {
                const estadoProy = estadosPorProyecto[proyectoSeleccionado];
                if (estadoProy === "Finalizado") return { l: "Estado", v: "Finalizado", c: tema.verdeExito };
                if (estadoProy === "EN VALIDACIÓN FINAL") return { l: "Estado", v: "En Val. Final", c: tema.acento };
                if (estadoProy === "En QA") return { l: "Estado", v: "En QA", c: tema.verde };
                if (estadoProy === "En Desarrollo") return { l: "Estado", v: "En Desarrollo", c: desviacion >= 0 ? tema.verde : tema.naranja };
                return { l: "Estado", v: "Sin Iniciar Dev", c: tema.textoMedio };
              })(),
              ...(devCompleto ? [] : [
                { l: "Avance Real", v: `${pctAvanceReal.toFixed(1)}%`, c: tema.verde },
                { l: "Planificado Hoy", v: `${pctPlanificadoHoy.toFixed(1)}%`, c: tema.acento },
              ]),
            ].map((indicador, i) => (
              <div key={i} style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "9px 13px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${indicador.c},transparent)` }} />
                <div style={{ fontSize: 10, color: tema.texto, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{indicador.l}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: indicador.c, fontFamily: "'JetBrains Mono',monospace" }}>{indicador.v}</div>
              </div>
            ))}

            {/* Sprints · Historias · Días Hábiles — tarjeta compacta */}
            <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "9px 13px", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${tema.morado},${tema.naranja},${tema.turquesa})` }} />
              <div style={{ fontSize: 10, color: tema.texto, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Sprints · Historias · Días Háb.</div>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: tema.morado, fontFamily: "'JetBrains Mono',monospace" }}>{listaSprints.length}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>SP</span>
                </div>
                <span style={{ color: tema.borde, fontSize: 14 }}>·</span>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: tema.naranja, fontFamily: "'JetBrains Mono',monospace" }}>{proyectoActual?.tareas.length || 0}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>HU</span>
                </div>
                <span style={{ color: tema.borde, fontSize: 14 }}>·</span>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: tema.turquesa, fontFamily: "'JetBrains Mono',monospace" }}>{totalDiasHabiles}</span>
                  <span style={{ fontSize: 9, color: tema.textoMedio, marginLeft: 3 }}>DH</span>
                </div>
              </div>
            </div>

            {/* Días hábiles faltantes: solo mientras hay desarrollo activo */}
            {!devCompleto && (
              <div style={{ background: tema.superficie, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "9px 13px", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg,${tema.turquesa},transparent)` }} />
                <div style={{ fontSize: 10, color: tema.texto, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Días Háb. Faltantes</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: tema.textoClaro, fontFamily: "'JetBrains Mono',monospace" }}>{diasHabilFaltantes}</div>
              </div>
            )}
          </div>

          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { k: "chart", l: "Curva S" },
              { k: "planning", l: "Planificación" },
              { k: "advances", l: "Avances" },
              { k: "qa", l: "QA" },
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

          {vista === "chart" && (
            <VistaCurvaS
              proyectoSeleccionado={proyectoSeleccionado}
              versionDatos={versionDatos}
              refGrafico={refGrafico}
              tema={tema}
              mostrarSombrasSprint={mostrarSombrasSprint}
              setMostrarSombrasSprint={setMostrarSombrasSprint}
              descargarGrafico={descargarGrafico}
              datoGrafico={datoGrafico}
              tieneAvances={tieneAvances}
              proyectoActual={proyectoActual}
              listaSprints={listaSprints}
              mapaAvancePorTarea={mapaAvancePorTarea}
            />
          )}

          {/* ───── VIEW: Planning ───────────────────────────────────── */}
          {vista === "planning" && proyectoActual && (
            <VistaPlanificacion proyectoActual={proyectoActual} mapaAvancePorTarea={mapaAvancePorTarea} tema={tema} />
          )}

          {/* ───── VIEW: Summary ────────────────────────────────────── */}
          {vista === "summary" && proyectoActual && (
            <VistaResumen proyectoSeleccionado={proyectoSeleccionado} datoGrafico={datoGrafico} tema={tema} />
          )}

          {vista === "advances" && proyectoActual && (
            <VistaAvances proyectoActual={proyectoActual} tema={tema} />
          )}

          {/* ───── VIEW: QA ─────────────────────────────────────────── */}
          {vista === "qa" && proyectoActual && (
            <VistaQA proyectoActual={proyectoActual} mapaAvancePorTarea={mapaAvancePorTarea} tema={tema} />
          )}
          </>
          )}
          </div>
          </div>
          )}


        </>
      )}
    </div>
  );
}
