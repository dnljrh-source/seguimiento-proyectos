import { sumarDias, claveFecha, esDiaHabil, diasHabilesEntre, parsearFecha } from "./fechas";
import { claveHistoria, normalizarTexto } from "./texto";

// Construye los datos para la Curva S: planificado, real, proyectado, resumen por sprint y sombreado.
// Función pura — no toca React ni el DOM. Recibe tareas y avances hidratados (con Date objects).
//
// Notas:
// - Magic numbers (documentados en README):
//   - 60: días buffer pa extender la curva planificada después de finProyecto
//   - 730: máximo de días pa simular curva proyectada (~2 años)
//   - 220 / 180: umbrales de downsampling
//   - 99.99 / 99.9: tolerancia de redondeo flotante
export function construirDatosCurva(tareas, avances, feriados = []) {
  if (!tareas.length) return { datos: [], hoy: null, areasSprint: [], inicioProyecto: null, finProyecto: null };

  const tareasOrdenadas = [...tareas].sort((a, b) => a.start - b.start);
  const inicioProyecto = tareasOrdenadas[0].start;
  const finProyecto = tareasOrdenadas.reduce((m, tarea) => tarea.end > m ? tarea.end : m, tareasOrdenadas[0].end);
  const totalDiasHabiles = tareasOrdenadas.reduce((s, tarea) => s + (tarea.workdays || 0), 0);
  if (totalDiasHabiles === 0) return { datos: [], hoy: null, areasSprint: [], inicioProyecto, finProyecto };

  const finExtendido = sumarDias(finProyecto, 60);
  const claveHoy = claveFecha(new Date());

  // ── Planned curve ────────────────────────────────────────────────
  // Cada tarea aporta exactamente (task.workdays / totalDiasHabiles) * 100 al total,
  // distribuido equitativamente sobre sus días hábiles reales en [start, end].
  // Esto garantiza que la curva llega al 100% en finProyecto independientemente
  // de si los días hábiles reales coinciden con el valor del Excel.
  const diasRealesPorTarea = {};
  for (const tarea of tareasOrdenadas) {
    diasRealesPorTarea[claveHistoria(tarea.sprint, tarea.task)] = Math.max(1, diasHabilesEntre(tarea.start, tarea.end));
  }

  const planificado = {};
  let acumPlanificado = 0;
  planificado[claveFecha(inicioProyecto)] = 0; // arranca explícitamente en 0%
  let diaActual = sumarDias(new Date(inicioProyecto), 1);
  // Acumular solo hasta finProyecto (después las tareas ya terminaron)
  while (diaActual <= finProyecto) {
    const clave = claveFecha(diaActual);
    if (esDiaHabil(diaActual, feriados)) {
      for (const tarea of tareasOrdenadas) {
        if (diaActual >= tarea.start && diaActual <= tarea.end) {
          const diasHabilesReales = diasRealesPorTarea[claveHistoria(tarea.sprint, tarea.task)];
          acumPlanificado += (tarea.workdays / diasHabilesReales / totalDiasHabiles) * 100;
        }
      }
    }
    planificado[clave] = Math.min(acumPlanificado, 100);
    diaActual = sumarDias(diaActual, 1);
  }
  // Desde finProyecto hasta finExtendido: exactamente 100% (sin floating-point residual)
  // Esto evita deltas negativos en la curva proyectada al leer planificado[clave] > finProyecto
  diaActual = new Date(finProyecto);
  while (diaActual <= finExtendido) {
    planificado[claveFecha(diaActual)] = 100;
    diaActual = sumarDias(diaActual, 1);
  }

  // ── Real curve ───────────────────────────────────────────────────
  // Cada avance genera una recta lineal desde su fecha inicio hasta su fecha fin.
  // La contribución de cada tarea al % del proyecto se pondera por sus días hábiles.
  // Entre avances y después del último avance, la curva mantiene el último valor (plana).
  // Si todas las tareas llegan al 100%, la curva termina exactamente en el último avance.

  const tareasPorClave = {};
  for (const tarea of tareasOrdenadas) tareasPorClave[claveHistoria(tarea.sprint, tarea.task)] = tarea;

  // Agrupar y ordenar avances por tarea
  const avancesPorTareaMap = {};
  for (const avance of avances) {
    if (!avance.dateEnd) continue;
    const clave = claveHistoria(avance.sprint, avance.task);
    if (!tareasPorClave[clave]) continue;
    if (!avancesPorTareaMap[clave]) avancesPorTareaMap[clave] = [];
    avancesPorTareaMap[clave].push(avance);
  }
  for (const clave of Object.keys(avancesPorTareaMap)) {
    avancesPorTareaMap[clave].sort((a, b) => {
      const dif = a.dateEnd - b.dateEnd;
      return dif !== 0 ? dif : (a.dateStart || a.dateEnd) - (b.dateStart || b.dateEnd);
    });
  }

  // Construir segmentos lineales por tarea.
  // valInicio/valFin = contribución de esta tarea al % total del proyecto
  // en el instante de inicio/fin del avance.
  const segmentosPorTarea = {};
  const pctAcumPorTarea = {}; // último % acumulado por tarea (para curva proyectada)

  for (const [claveTarea, listaAvances] of Object.entries(avancesPorTareaMap)) {
    const tarea = tareasPorClave[claveTarea];
    const peso = tarea.workdays / totalDiasHabiles;
    let pctAcum = 0;
    segmentosPorTarea[claveTarea] = [];

    for (const avance of listaAvances) {
      const pctPrevio = pctAcum;
      const pctNuevo = Math.min(pctAcum + (avance.pct || 0), 100);
      const ganancia = pctNuevo - pctPrevio;
      pctAcum = pctNuevo;
      if (ganancia <= 0) continue;

      // Clamp start: nunca antes del inicio del proyecto
      const inicioRaw = avance.dateStart || avance.dateEnd;
      const fechaInicio = inicioRaw >= inicioProyecto ? inicioRaw : new Date(inicioProyecto);

      segmentosPorTarea[claveTarea].push({
        inicioMs: fechaInicio.getTime(),
        finMs: avance.dateEnd.getTime(),
        valInicio: (pctPrevio / 100) * peso * 100,
        valFin: (pctNuevo / 100) * peso * 100,
      });
    }
    pctAcumPorTarea[claveTarea] = pctAcum;
  }

  // Contribución de una tarea al % del proyecto en un instante dado (ms).
  // Si el instante cae dentro de un segmento: interpolación lineal.
  // Si el instante supera todos los segmentos: mantiene el valor final (plana).
  const contribTareaMs = (claveTarea, dMs) => {
    const segs = segmentosPorTarea[claveTarea];
    if (!segs || !segs.length) return 0;
    let ultimo = 0;
    for (const seg of segs) {
      if (dMs >= seg.finMs) {
        ultimo = seg.valFin; // segmento completado: acumular su valor final
      } else if (dMs >= seg.inicioMs) {
        // Segmento activo: interpolar linealmente por tiempo calendario
        const dur = seg.finMs - seg.inicioMs;
        const t = dur > 0 ? (dMs - seg.inicioMs) / dur : 1;
        return seg.valInicio + t * (seg.valFin - seg.valInicio);
      } else {
        break; // segmento futuro: no sumar
      }
    }
    return ultimo;
  };

  // Rango: desde inicioProyecto hasta el último avance (o hoy, lo que sea mayor)
  const todasFinMs = Object.values(segmentosPorTarea).flatMap(s => s.map(x => x.finMs));
  const fechaMaxAvance = todasFinMs.length ? new Date(Math.max(...todasFinMs)) : null;
  const fechaHoy = parsearFecha(claveHoy);

  const curvaReal = {};
  curvaReal[claveFecha(inicioProyecto)] = 0;

  if (fechaMaxAvance) {
    // Si la curva no llega a hoy, extender hasta hoy para mostrar la línea plana
    const fechaFinReal = fechaHoy > fechaMaxAvance ? fechaHoy : fechaMaxAvance;
    let fechaActual = sumarDias(new Date(inicioProyecto), 1);
    while (fechaActual <= fechaFinReal) {
      const dMs = fechaActual.getTime();
      let total = 0;
      for (const claveTarea of Object.keys(segmentosPorTarea)) {
        total += contribTareaMs(claveTarea, dMs);
      }
      curvaReal[claveFecha(fechaActual)] = Math.min(Math.round(total * 100) / 100, 100);
      fechaActual = sumarDias(fechaActual, 1);
    }
  }

  // Último punto real (para la curva proyectada)
  const clavesRealOrdenadas = Object.keys(curvaReal).sort();
  let ultimaClaveReal = clavesRealOrdenadas.length > 1
    ? clavesRealOrdenadas[clavesRealOrdenadas.length - 1]
    : null;
  let ultimoValorReal = ultimaClaveReal ? curvaReal[ultimaClaveReal] : 0;

  // ── Per-task real end dates (for sprint summary) ─────────────────
  const fechaFinRealPorTarea = {};
  for (const avance of avances) {
    if (!avance.dateEnd) continue;
    const clave = claveHistoria(avance.sprint, avance.task);
    if (!fechaFinRealPorTarea[clave] || avance.dateEnd > fechaFinRealPorTarea[clave]) {
      fechaFinRealPorTarea[clave] = avance.dateEnd;
    }
  }

  // Fecha de inicio real por sprint (menor fecha de inicio de avances del sprint)
  const realStartPorSprint = {};
  for (const avance of avances) {
    if (!avance.dateEnd) continue;
    const sprintNorm = normalizarTexto(avance.sprint);
    const fechaRef = avance.dateStart || avance.dateEnd;
    if (!realStartPorSprint[sprintNorm] || fechaRef < realStartPorSprint[sprintNorm]) {
      realStartPorSprint[sprintNorm] = fechaRef;
    }
  }

  // Fecha estimada de término por tarea (llenada durante la simulación de proyección)
  const fechaFinProyectadaPorTarea = {};

  // ── Projected curve ──────────────────────────────────────────────
  // Cada persona asignada trabaja en una tarea a la vez (en orden de
  // fecha inicio planificada). Si una persona está ocupada con una tarea,
  // no puede avanzar otra simultáneamente.
  // Los días hábiles que necesita cada tarea se estiman proporcionalmente
  // a su avance restante sobre sus días planificados.
  const proyectado = {};
  if (ultimaClaveReal && ultimoValorReal < 100) {
    const fechaInicioProyeccion = parsearFecha(ultimaClaveReal);

    // Agrupar tareas incompletas por persona asignada
    const tareasPorPersona = {};
    let idSinAsignar = 0;
    for (const tarea of tareasOrdenadas) {
      const clave = claveHistoria(tarea.sprint, tarea.task);
      const pctActual = pctAcumPorTarea[clave] || 0;
      if (pctActual >= 100) continue;

      const pctRestante = 100 - pctActual;
      // Tareas sin asignado se tratan como personas independientes
      const persona = tarea.assigned && tarea.assigned.trim() !== ""
        ? normalizarTexto(tarea.assigned)
        : `__na_${idSinAsignar++}`;

      if (!tareasPorPersona[persona]) tareasPorPersona[persona] = [];
      tareasPorPersona[persona].push({
        task: tarea,
        remainPct: pctRestante,
        wdNeeded: Math.max(1, Math.ceil(tarea.workdays * (pctRestante / 100))),
        contrib: (pctRestante / 100) * (tarea.workdays / totalDiasHabiles) * 100,
      });
    }

    // Ordenar tareas de cada persona por fecha inicio planificada
    for (const persona of Object.keys(tareasPorPersona)) {
      tareasPorPersona[persona].sort((a, b) => a.task.start - b.task.start);
    }

    // Estado por persona: tarea actual, días hábiles restantes, aporte diario
    const estadoPorPersona = {};
    for (const [persona, listaTareas] of Object.entries(tareasPorPersona)) {
      const primeraTarea = listaTareas[0];
      estadoPorPersona[persona] = {
        indice: 0,
        diasRestantes: primeraTarea.wdNeeded,
        tasaDiaria: primeraTarea.contrib / primeraTarea.wdNeeded,
      };
    }

    // Simular día a día hasta que todas las personas terminen
    proyectado[ultimaClaveReal] = ultimoValorReal;
    let acumProyectado = ultimoValorReal;
    let fecha = sumarDias(fechaInicioProyeccion, 1);
    const fechaMaxima = sumarDias(fechaInicioProyeccion, 730);

    while (acumProyectado < 100 && fecha <= fechaMaxima) {
      const clave = claveFecha(fecha);
      if (esDiaHabil(fecha, feriados)) {
        // Verificar si queda alguna persona con tareas pendientes
        const hayPersonasActivas = Object.entries(estadoPorPersona).some(([persona, estado]) => estado.indice < tareasPorPersona[persona].length);
        if (!hayPersonasActivas) {
          // Todas las personas terminaron: cerrar la curva en 100%
          proyectado[clave] = 100;
          break;
        }

        for (const [persona, estado] of Object.entries(estadoPorPersona)) {
          const listaTareas = tareasPorPersona[persona];
          if (estado.indice >= listaTareas.length) continue;

          acumProyectado = Math.min(acumProyectado + estado.tasaDiaria, 100);
          estado.diasRestantes--;

          if (estado.diasRestantes <= 0) {
            // Registrar la fecha estimada de término de esta tarea
            const claveTareaFin = claveHistoria(listaTareas[estado.indice].task.sprint, listaTareas[estado.indice].task.task);
            if (!fechaFinProyectadaPorTarea[claveTareaFin]) {
              fechaFinProyectadaPorTarea[claveTareaFin] = new Date(fecha);
            }
            estado.indice++;
            if (estado.indice < listaTareas.length) {
              const siguiente = listaTareas[estado.indice];
              estado.diasRestantes = siguiente.wdNeeded;
              estado.tasaDiaria = siguiente.contrib / siguiente.wdNeeded;
            }
          }
        }
      }
      if (acumProyectado >= 99.9) acumProyectado = 100;
      proyectado[clave] = Math.round(acumProyectado * 100) / 100;
      fecha = sumarDias(fecha, 1);
    }

    // Asegurar que la curva proyectada termine en 100%
    const clavesProyOrdenadas = Object.keys(proyectado).sort();
    if (clavesProyOrdenadas.length) {
      proyectado[clavesProyOrdenadas[clavesProyOrdenadas.length - 1]] = 100;
    }

    // Extender planificado a 100% para cubrir el rango de la proyectada
    const clavesProyOrdenadas2 = Object.keys(proyectado).sort();
    if (clavesProyOrdenadas2.length) {
      const ultimaFechaProyectado = parsearFecha(clavesProyOrdenadas2[clavesProyOrdenadas2.length - 1]);
      if (ultimaFechaProyectado > finExtendido) {
        let diaExtension = sumarDias(finExtendido, 1);
        while (diaExtension <= ultimaFechaProyectado) {
          planificado[claveFecha(diaExtension)] = 100;
          diaExtension = sumarDias(diaExtension, 1);
        }
      }
    }
  }

  // Garantizar que la curva proyectada sea monotónicamente creciente:
  // una vez que llega al 100%, no puede bajar
  {
    let maxVisto = 0;
    for (const clave of Object.keys(proyectado).sort()) {
      maxVisto = Math.max(maxVisto, proyectado[clave]);
      proyectado[clave] = maxVisto;
    }
  }

  // ── Sprint areas (para sombrear) ─────────────────────────────────
  const areasSprint = [];
  const gruposSprint = {};
  for (const tarea of tareasOrdenadas) {
    if (!gruposSprint[tarea.sprint]) gruposSprint[tarea.sprint] = { start: tarea.start, end: tarea.end };
    else {
      if (tarea.start < gruposSprint[tarea.sprint].start) gruposSprint[tarea.sprint].start = tarea.start;
      if (tarea.end > gruposSprint[tarea.sprint].end) gruposSprint[tarea.sprint].end = tarea.end;
    }
  }
  const sprintsOrdenados = Object.entries(gruposSprint).sort((a, b) => a[1].start - b[1].start);
  sprintsOrdenados.forEach(([nombreSprint, rangoSprint], i) => {
    areasSprint.push({
      name: `Sprint ${nombreSprint}`,
      start: claveFecha(rangoSprint.start),
      end: claveFecha(rangoSprint.end),
      evenOdd: i % 2
    });
  });

  // ── Sprint summary (para vista Resumen) ─────────────────────────
  const resumenSprints = sprintsOrdenados.map(([nombreSprint, rangoSprint]) => {
    const tareasDelSprint = tareasOrdenadas.filter(t => t.sprint === nombreSprint);
    const totalDiasSprint = tareasDelSprint.reduce((s, t) => s + (t.workdays || 0), 0);

    // Progreso ponderado del sprint
    let pctSprint = 0;
    if (totalDiasSprint > 0) {
      for (const tarea of tareasDelSprint) {
        const clave = claveHistoria(tarea.sprint, tarea.task);
        const pct = pctAcumPorTarea[clave] || 0;
        pctSprint += (pct / 100) * (tarea.workdays / totalDiasSprint) * 100;
      }
    }
    pctSprint = Math.min(Math.round(pctSprint * 100) / 100, 100);

    // Fecha de inicio real del sprint
    const sprintNorm = normalizarTexto(nombreSprint);
    const realStart = realStartPorSprint[sprintNorm] || null;

    // Fecha de término estimada: máxima entre las fechas proyectadas/reales de todas las tareas
    let proyectedEnd = null;
    for (const tarea of tareasDelSprint) {
      const clave = claveHistoria(tarea.sprint, tarea.task);
      const pctTarea = pctAcumPorTarea[clave] || 0;
      let finTarea = null;
      if (pctTarea >= 100) {
        finTarea = fechaFinRealPorTarea[clave] || tarea.end;
      } else {
        finTarea = fechaFinProyectadaPorTarea[clave] || null;
      }
      if (finTarea && (!proyectedEnd || finTarea > proyectedEnd)) {
        proyectedEnd = finTarea;
      }
    }

    // Días de atraso: positivo = atrasado, negativo = adelantado
    let diasAtraso = null;
    if (proyectedEnd) {
      diasAtraso = Math.round((proyectedEnd.getTime() - rangoSprint.end.getTime()) / (24 * 60 * 60 * 1000));
    }

    return {
      sprint: nombreSprint,
      pct: pctSprint,
      planStart: rangoSprint.start,
      planEnd: rangoSprint.end,
      realStart,
      proyectedEnd,
      diasAtraso,
    };
  });

  // ── Merge all into chart data ────────────────────────────────────
  const todasLasClaves = [...new Set([
    ...Object.keys(planificado),
    ...Object.keys(curvaReal),
    ...Object.keys(proyectado),
    ...areasSprint.flatMap(areaSprint => [areaSprint.start, areaSprint.end])
  ])].sort();

  // Extender planificado a 100% para cualquier fecha del gráfico que quede
  // más allá de finExtendido (cuando real o proyectado se prolongan mucho).
  for (const clave of todasLasClaves) {
    if (planificado[clave] === undefined) planificado[clave] = 100;
  }

  // Determinar la fecha de corte: cuando planificado llega al 100%,
  // el gráfico se extiende hasta que real O proyectado también lleguen al 100%.
  let claveCierre = null;
  {
    let planificadoEn100 = null;
    let realEn100 = null;
    let proyectadoEn100 = null;
    for (const clave of todasLasClaves) {
      if (!planificadoEn100 && planificado[clave] !== undefined && planificado[clave] >= 100) planificadoEn100 = clave;
      if (!realEn100 && curvaReal[clave] !== undefined && curvaReal[clave] >= 100) realEn100 = clave;
      if (!proyectadoEn100 && proyectado[clave] !== undefined && proyectado[clave] >= 100) proyectadoEn100 = clave;
    }
    if (planificadoEn100) {
      // El gráfico termina en la última de las tres curvas en llegar al 100%
      const candidatos = [planificadoEn100, realEn100, proyectadoEn100].filter(Boolean);
      claveCierre = candidatos.reduce((max, c) => c > max ? c : max, planificadoEn100);
    }
  }

  const clavesFiltradas = claveCierre ? todasLasClaves.filter(clave => clave <= claveCierre) : todasLasClaves;

  let datosCurva = clavesFiltradas.map(clave => {
    const punto = { fecha: clave };
    if (planificado[clave] !== undefined) punto.planificado = Math.round(planificado[clave] * 100) / 100;
    if (curvaReal[clave] !== undefined) punto.real = Math.round(curvaReal[clave] * 100) / 100;
    if (proyectado[clave] !== undefined) punto.proyectado = Math.round(proyectado[clave] * 100) / 100;
    return punto;
  });

  // Downsample para que no sea un dataset enorme, pero preservando puntos clave
  const clavesImportantes = new Set([
    ...Object.keys(curvaReal),
    ...Object.keys(proyectado),
    claveHoy,
    ...areasSprint.flatMap(areaSprint => [areaSprint.start, areaSprint.end])
  ]);
  if (datosCurva.length > 220) {
    const intervalo = Math.max(1, Math.ceil(datosCurva.length / 180));
    datosCurva = datosCurva.filter((punto, i) =>
      i === 0 || i === datosCurva.length - 1 || i % intervalo === 0 || clavesImportantes.has(punto.fecha)
    );
  }

  return { datos: datosCurva, hoy: claveHoy, areasSprint, inicioProyecto, finProyecto, resumenSprints };
}
