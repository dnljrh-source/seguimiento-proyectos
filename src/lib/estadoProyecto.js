import { normalizarTexto, claveHistoria } from "./texto";

// Devuelve { estado, pruebas, fecha } del sprint según su avance y entradas QA.
// - Si desarrollo < 100%: estado null (no mostrar badge QA)
// - Si desarrollo = 100% y no hay pruebas: "En revisión QA"
// - Si desarrollo = 100% y hay pruebas: estado = la entrada QA más reciente
export function calcularEstadoQA(pctDesarrollo, entradasQA, nombreSprint) {
  // Tolerancia para precisión de punto flotante: 99.99 cuenta como 100%
  if (pctDesarrollo < 99.99) return { estado: null, pruebas: 0, fecha: null };
  const entradas = (entradasQA || []).filter(q => normalizarTexto(q.sprint) === normalizarTexto(nombreSprint));
  if (!entradas.length) return { estado: "En revisión QA", pruebas: 0, fecha: null };
  const ordenadas = [...entradas].sort((a, b) => {
    const fa = a.fecha ? a.fecha.getTime() : 0;
    const fb = b.fecha ? b.fecha.getTime() : 0;
    return fb - fa;
  });
  return { estado: ordenadas[0].estado, pruebas: entradas.length, fecha: ordenadas[0].fecha };
}

// Estado por proyecto: Finalizado / EN VALIDACIÓN FINAL / En QA / En Proceso / Sin Iniciar.
// - "Finalizado" requiere: desarrollo 100% + QA todo aprobado + validación final con "Sí".
// - "EN VALIDACIÓN FINAL" = QA todo aprobado, pero falta validación del área solicitante.
// - "En QA" = desarrollo 100% pero al menos un sprint sin aprobación vigente.
export function calcularEstadosProyectos(proyectos) {
  const estados = {};
  for (const [nombre, datos] of Object.entries(proyectos)) {
    const totalDH = datos.tareas.reduce((s, t) => s + (t.workdays || 0), 0);
    if (totalDH === 0 || datos.avances.length === 0) { estados[nombre] = "Sin Iniciar"; continue; }
    const mapaAv = {};
    for (const av of datos.avances) {
      const clave = claveHistoria(av.sprint, av.task);
      mapaAv[clave] = Math.min((mapaAv[clave] || 0) + (av.pct || 0), 100);
    }
    // % global del proyecto
    let total = 0;
    for (const tarea of datos.tareas) {
      const clave = claveHistoria(tarea.sprint, tarea.task);
      total += ((mapaAv[clave] || 0) / 100) * (tarea.workdays / totalDH) * 100;
    }
    const pct = Math.min(Math.round(total * 100) / 100, 100);

    if (pct <= 0) { estados[nombre] = "Sin Iniciar"; continue; }
    if (pct < 99.99) { estados[nombre] = "En Proceso"; continue; }

    // Desarrollo al 100%: chequear QA por sprint
    const sprintsProyecto = [...new Set(datos.tareas.map(t => t.sprint))];
    const todosAprobados = sprintsProyecto.every(sp => {
      // % desarrollo del sprint
      const tareasSp = datos.tareas.filter(t => t.sprint === sp);
      const diasSp = tareasSp.reduce((s, t) => s + (t.workdays || 0), 0);
      let pctSp = 0;
      if (diasSp > 0) {
        for (const t of tareasSp) {
          const pctT = mapaAv[claveHistoria(t.sprint, t.task)] || 0;
          pctSp += (pctT / 100) * (t.workdays / diasSp) * 100;
        }
      }
      const qa = calcularEstadoQA(pctSp, datos.qa, sp);
      return qa.estado === "Aprobado";
    });

    if (!todosAprobados) { estados[nombre] = "En QA"; continue; }

    // QA todo aprobado: chequear validación final del área solicitante.
    // Se usa la entrada más reciente como el veredicto actual.
    const entradasVF = (datos.validacionFinal || []).slice().sort((a, b) => {
      const fa = a.fecha ? a.fecha.getTime() : 0;
      const fb = b.fecha ? b.fecha.getTime() : 0;
      return fb - fa;
    });
    const vigente = entradasVF[0];
    estados[nombre] = vigente && vigente.validado ? "Finalizado" : "EN VALIDACIÓN FINAL";
  }
  return estados;
}
