// Resumen de métricas por proyecto para la vista general (dashboard).
// Reutiliza construirDatosCurva (misma lógica que el gráfico) para que las
// fechas estimadas de término y el % planificado sean coherentes con el detalle.
import { construirDatosCurva } from "./curvaS";
import { claveHistoria } from "./texto";

// Métricas de un solo proyecto ya hidratado.
// estado: el estado general ya calculado (calcularEstadosProyectos).
export function resumenProyecto(nombre, datos, estado) {
  const tareas = datos.tareas || [];
  const avances = datos.avances || [];
  const totalDH = tareas.reduce((s, t) => s + (t.workdays || 0), 0);

  // Rango planificado de desarrollo
  const inicioPlan = tareas.length ? tareas.reduce((m, t) => (t.start < m ? t.start : m), tareas[0].start) : null;
  const finPlan = tareas.length ? tareas.reduce((m, t) => (t.end > m ? t.end : m), tareas[0].end) : null;

  // % avance real (suma ponderada por días hábiles, acumulada por tarea)
  const mapaAv = {};
  for (const a of avances) {
    const k = claveHistoria(a.sprint, a.task);
    mapaAv[k] = Math.min((mapaAv[k] || 0) + (a.pct || 0), 100);
  }
  let pctReal = 0;
  if (totalDH > 0) {
    for (const t of tareas) {
      pctReal += ((mapaAv[claveHistoria(t.sprint, t.task)] || 0) / 100) * (t.workdays / totalDH) * 100;
    }
  }
  pctReal = Math.min(Math.round(pctReal * 100) / 100, 100);

  // Datos de curva: entrega planificado hoy, inicio/fin real y estimado por sprint
  const curva = tareas.length ? construirDatosCurva(tareas, avances) : { datos: [], hoy: null, resumenSprints: [] };
  const regHoy = curva.datos.find(p => p.fecha === curva.hoy);
  const pctPlanHoy = regHoy?.planificado ?? (pctReal >= 100 ? 100 : 0);
  const desviacion = Math.round((pctReal - pctPlanHoy) * 10) / 10;

  // Inicio real de desarrollo = menor fecha de inicio real entre sprints
  // Término estimado = mayor fecha de término estimada/real entre sprints
  let inicioReal = null;
  let finEstimado = null;
  for (const s of curva.resumenSprints || []) {
    if (s.realStart && (!inicioReal || s.realStart < inicioReal)) inicioReal = s.realStart;
    if (s.proyectedEnd && (!finEstimado || s.proyectedEnd > finEstimado)) finEstimado = s.proyectedEnd;
  }

  // ¿El término de desarrollo es una fecha real o una proyección?
  // Si el desarrollo está completo (100%), finEstimado corresponde a la última
  // fecha real de avance; de lo contrario es una proyección.
  const finEsReal = pctReal >= 99.99;

  const asignados = [...new Set(tareas.map(t => (t.assigned || "").trim()).filter(Boolean))];
  const sprints = [...new Set(tareas.map(t => t.sprint))];

  return {
    nombre,
    estado,
    nombreProyecto: (datos.planificacion?.nombre || "").trim(),
    contraparte: (datos.planificacion?.contraparte || "").trim(),
    asignados,
    totalDH,
    nSprints: sprints.length,
    nHistorias: tareas.length,
    pctReal,
    pctPlanHoy: Math.round(pctPlanHoy * 10) / 10,
    desviacion,
    inicioPlan,
    finPlan,
    inicioReal,
    finEstimado,
    finEsReal,
  };
}

export function construirResumenProyectos(proyectos, estadosPorProyecto, orden) {
  return orden.map(nombre => resumenProyecto(nombre, proyectos[nombre], estadosPorProyecto[nombre]));
}
