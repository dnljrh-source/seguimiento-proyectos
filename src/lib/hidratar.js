import { parsearFecha } from "./fechas";

// Hidrata el JSON precargado (strings de fecha → Date objects).
// Aplica a tareas (start/end), avances (dateStart/dateEnd), qa (fecha)
// y validacionFinal (fecha).
export function hidratarDatos(raw) {
  const resultado = {};
  for (const [nombre, datos] of Object.entries(raw)) {
    resultado[nombre] = {
      tareas: datos.tareas.map(t => ({
        ...t,
        start: parsearFecha(t.start),
        end:   parsearFecha(t.end),
      })),
      avances: datos.avances.map(a => ({
        ...a,
        dateStart: a.dateStart ? parsearFecha(a.dateStart) : null,
        dateEnd:   a.dateEnd   ? parsearFecha(a.dateEnd)   : null,
      })),
      qa: (datos.qa || []).map(q => ({
        ...q,
        fecha: q.fecha ? parsearFecha(q.fecha) : null,
      })),
      validacionFinal: (datos.validacionFinal || []).map(v => ({
        ...v,
        fecha: v.fecha ? parsearFecha(v.fecha) : null,
      })),
      planificacion: datos.planificacion || null,
    };
  }
  return resultado;
}
