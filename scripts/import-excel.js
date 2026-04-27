const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const DEFAULT_EXCEL_PATH =
  "C:\\Users\\daniel.jara\\OneDrive - Empresas Lipigas\\Reporteria de avances de proyectos.xlsx";

const excelPath = process.env.EXCEL_PATH || DEFAULT_EXCEL_PATH;
const outputPath = path.join(__dirname, "..", "src", "datos-proyecto.json");

if (!fs.existsSync(excelPath)) {
  console.warn(`[import-excel] Archivo no encontrado: ${excelPath}`);
  console.warn("[import-excel] Se mantendrá el datos-proyecto.json existente.");
  process.exit(0);
}

const CHILE_HOLIDAYS = new Set([
  "2025-01-01","2025-04-18","2025-04-19","2025-05-01","2025-05-21","2025-06-20",
  "2025-06-29","2025-07-16","2025-08-15","2025-09-18","2025-09-19","2025-10-12",
  "2025-10-31","2025-11-01","2025-12-08","2025-12-25",
  "2026-01-01","2026-04-03","2026-04-04","2026-05-01","2026-05-21","2026-06-29",
  "2026-07-16","2026-08-15","2026-09-18","2026-09-19","2026-10-12","2026-10-31",
  "2026-11-01","2026-12-08","2026-12-25",
  "2027-01-01","2027-03-26","2027-03-27","2027-05-01","2027-05-21","2027-06-21",
  "2027-06-28","2027-07-16","2027-08-15","2027-09-18","2027-09-19","2027-10-11",
  "2027-10-31","2027-11-01","2027-12-08","2027-12-25",
]);

function parsearFecha(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (isNaN(v)) return null;
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m1) {
    let y = +m1[3];
    if (y < 100) y += y >= 50 ? 1900 : 2000;
    return new Date(y, +m1[2] - 1, +m1[1]);
  }
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function claveFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function esDiaHabil(d) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !CHILE_HOLIDAYS.has(claveFecha(d));
}

function diasHabilesEntre(s, e) {
  let c = 0;
  let dia = new Date(s);
  while (dia <= e) {
    if (esDiaHabil(dia)) c++;
    dia = sumarDias(dia, 1);
  }
  return c;
}

function normalizarPorcentaje(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 0;
  return Math.min(n * 100, 100);
}

function normalizarTexto(s) {
  return String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

function normalizarClave(k) {
  return k.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function buscarColumna(fila, cands) {
  const columnas = Object.keys(fila);
  for (const columna of columnas) {
    const claveNorm = normalizarClave(columna);
    for (const candidato of cands) if (claveNorm === candidato) return columna;
  }
  for (const columna of columnas) {
    const claveNorm = normalizarClave(columna);
    for (const candidato of cands) if (claveNorm.includes(candidato)) return columna;
  }
  return null;
}

function buscarHoja(libro, pistas) {
  for (const nombreHoja of libro.SheetNames) {
    const norm = nombreHoja.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const pista of pistas) if (norm.includes(pista)) return libro.Sheets[nombreHoja];
  }
  return null;
}

function fechaAJSON(d) {
  return d ? claveFecha(d) : null;
}

const buf = fs.readFileSync(excelPath);
const libro = XLSX.read(buf, { type: "buffer", cellDates: true });

const hojaPlan = buscarHoja(libro, ["PLANIF"]);
const hojaAvances = buscarHoja(libro, ["AVANCE"]);
const hojaQA = buscarHoja(libro, ["QA"]);
const hojaValid = buscarHoja(libro, ["VALIDACION FINAL", "VALIDACIONFINAL", "VALIDACION"]);

if (!hojaPlan) {
  console.error("[import-excel] Hoja 'PLANIFICACIÓN' no encontrada en el Excel.");
  process.exit(1);
}

const filasPlan = XLSX.utils.sheet_to_json(hojaPlan, { defval: "", raw: true });
const filasAv = hojaAvances ? XLSX.utils.sheet_to_json(hojaAvances, { defval: "", raw: true }) : [];
const filasQA = hojaQA ? XLSX.utils.sheet_to_json(hojaQA, { defval: "", raw: true }) : [];
const filasValid = hojaValid ? XLSX.utils.sheet_to_json(hojaValid, { defval: "", raw: true }) : [];

const mapa = {};

for (const fila of filasPlan) {
  const colProyecto = buscarColumna(fila, ["proyecto"]);
  const colSprint = buscarColumna(fila, ["sprint"]);
  const colTarea = buscarColumna(fila, ["tarea", "historia"]);
  const colInicio = buscarColumna(fila, ["inicio"]);
  const colFin = buscarColumna(fila, ["fin", "termino"]);
  const colDias = buscarColumna(fila, ["dias habiles", "dias"]);
  const colAsignado = buscarColumna(fila, ["asignado"]);
  if (!colProyecto || !colTarea) continue;
  const proyecto = String(fila[colProyecto]).trim();
  const sprint = colSprint ? String(fila[colSprint]).trim() : "1";
  const tarea = String(fila[colTarea]).trim();
  const inicio = parsearFecha(fila[colInicio]);
  const fin = parsearFecha(fila[colFin]);
  const dias = colDias ? parseInt(fila[colDias]) || 0 : (inicio && fin ? diasHabilesEntre(inicio, fin) : 0);
  const asignado = colAsignado ? String(fila[colAsignado]).trim() : "";
  if (!proyecto || !tarea || !inicio || !fin) continue;
  if (!mapa[proyecto]) mapa[proyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
  mapa[proyecto].tareas.push({
    sprint, task: tarea, start: fechaAJSON(inicio), end: fechaAJSON(fin), workdays: dias, assigned: asignado,
  });
}

for (const fila of filasAv) {
  const colProyecto = buscarColumna(fila, ["proyecto"]);
  const colSprint = buscarColumna(fila, ["sprint"]);
  const colTarea = buscarColumna(fila, ["tarea", "historia"]);
  const colInicio = buscarColumna(fila, ["fecha inicio", "inicio"]);
  const colFin = buscarColumna(fila, ["fecha fin", "fin", "termino"]);
  const colPct = buscarColumna(fila, ["porcentaje", "avance", "%", "pct"]);
  if (!colProyecto || !colTarea) continue;
  const proyecto = String(fila[colProyecto]).trim();
  const sprint = colSprint ? String(fila[colSprint]).trim() : "1";
  const tarea = String(fila[colTarea]).trim();
  const fIni = parsearFecha(fila[colInicio]);
  const fFin = parsearFecha(fila[colFin]);
  const pct = colPct ? normalizarPorcentaje(fila[colPct]) : 0;
  if (!proyecto || !tarea) continue;
  if (!mapa[proyecto]) mapa[proyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
  mapa[proyecto].avances.push({
    sprint, task: tarea, dateStart: fechaAJSON(fIni), dateEnd: fechaAJSON(fFin), pct,
  });
}

for (const fila of filasQA) {
  const colProyecto = buscarColumna(fila, ["proyecto"]);
  const colSprint = buscarColumna(fila, ["sprint"]);
  const colFecha = buscarColumna(fila, ["fecha"]);
  const colEstado = buscarColumna(fila, ["estado", "resultado"]);
  if (!colProyecto || !colSprint || !colEstado) continue;
  const proyecto = String(fila[colProyecto]).trim();
  const sprint = String(fila[colSprint]).trim();
  const fecha = parsearFecha(fila[colFecha]);
  const estadoRaw = String(fila[colEstado]).trim();
  if (!proyecto || !sprint || !estadoRaw) continue;
  const estadoNorm = normalizarTexto(estadoRaw);
  let estado;
  if (estadoNorm.includes("aprob")) estado = "Aprobado";
  else if (estadoNorm.includes("devuelt") || estadoNorm.includes("rechaz")) estado = "Devuelto a desarrollo";
  else estado = estadoRaw;
  if (!mapa[proyecto]) mapa[proyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
  mapa[proyecto].qa.push({ sprint, fecha: fechaAJSON(fecha), estado });
}

for (const fila of filasValid) {
  const colProyecto = buscarColumna(fila, ["proyecto"]);
  const colFecha = buscarColumna(fila, ["fecha"]);
  const colValidado = buscarColumna(fila, ["validado", "validacion", "aprobado"]);
  if (!colProyecto) continue;
  const proyecto = String(fila[colProyecto]).trim();
  const fecha = parsearFecha(fila[colFecha]);
  const valRaw = colValidado ? String(fila[colValidado]).trim() : "";
  const validado = /^(si|sí|yes|y|true|1|x)$/i.test(valRaw);
  if (!proyecto) continue;
  if (!mapa[proyecto]) mapa[proyecto] = { tareas: [], avances: [], qa: [], validacionFinal: [] };
  mapa[proyecto].validacionFinal.push({ fecha: fechaAJSON(fecha), validado });
}

fs.writeFileSync(outputPath, JSON.stringify(mapa, null, 2) + "\n");
const numProyectos = Object.keys(mapa).length;
console.log(`[import-excel] ${numProyectos} proyecto(s) escrito(s) en src/datos-proyecto.json`);
