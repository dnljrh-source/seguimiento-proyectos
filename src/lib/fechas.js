// Feriados Chile y helpers de fechas / días hábiles.
// Estos helpers están duplicados en scripts/import-excel.js (Node CJS).
// Si se actualizan acá, también actualizar el script.

export const CHILE_HOLIDAYS = [
  "2025-01-01","2025-04-18","2025-04-19","2025-05-01","2025-05-21","2025-06-20",
  "2025-06-29","2025-07-16","2025-08-15","2025-09-18","2025-09-19","2025-10-12",
  "2025-10-31","2025-11-01","2025-12-08","2025-12-25",
  "2026-01-01","2026-04-03","2026-04-04","2026-05-01","2026-05-21","2026-06-29",
  "2026-07-16","2026-08-15","2026-09-18","2026-09-19","2026-10-12","2026-10-31",
  "2026-11-01","2026-12-08","2026-12-25",
  "2027-01-01","2027-03-26","2027-03-27","2027-05-01","2027-05-21","2027-06-21",
  "2027-06-28","2027-07-16","2027-08-15","2027-09-18","2027-09-19","2027-10-11",
  "2027-10-31","2027-11-01","2027-12-08","2027-12-25"
];

// Todas las fechas se anclan al MEDIODÍA (12:00) en vez de medianoche. Así, un
// desfase de ±1h por el cambio de horario de verano (Chile adelanta/atrasa el
// reloj) nunca cruza el límite del día, y las comparaciones `fecha <= fin` entre
// una fecha iterada con sumarDias y una fecha parseada siguen siendo correctas.
export function parsearFecha(v) {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) { const d = new Date(v); return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12); }
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  }
  const s = String(v).trim();
  // DD-MM-YY o DD-MM-YYYY (también con /)
  const m1 = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m1) {
    let y = +m1[3];
    if (y < 100) y += y >= 50 ? 1900 : 2000; // 25 → 2025, 99 → 1999
    return new Date(y, +m1[2] - 1, +m1[1], 12);
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3], 12);
  const d = new Date(s);
  return isNaN(d) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

export function formatearFecha(d) {
  if (!d) return "";
  return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`;
}

export function claveFecha(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function sumarDias(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(12, 0, 0, 0); return r; }

export function esDiaHabil(d, holidays = []) {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const k = claveFecha(d);
  return !CHILE_HOLIDAYS.includes(k) && !holidays.includes(k);
}

export function diasHabilesEntre(s, e, h = []) {
  let c = 0, diaActual = new Date(s);
  while (diaActual <= e) { if (esDiaHabil(diaActual, h)) c++; diaActual = sumarDias(diaActual, 1); }
  return c;
}

// Avanza al primer día hábil desde d (inclusive)
export function primerDiaHabilDesde(d) {
  let r = new Date(d);
  while (!esDiaHabil(r)) r = sumarDias(r, 1);
  return r;
}

// Retorna la fecha que resulta de contar n días hábiles desde inicio (inclusive)
export function agregarDiasHabiles(inicio, n) {
  let count = 0, d = new Date(inicio);
  while (count < n) {
    if (esDiaHabil(d)) count++;
    if (count < n) d = sumarDias(d, 1);
  }
  return d;
}
