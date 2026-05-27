// Normalización de strings, porcentajes y decimales.

// Normaliza strings para comparación: minúsculas, sin acentos, sin espacios dobles.
export function normalizarTexto(s) {
  return String(s).trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
}

// Variante para claves de columna: acepta cualquier toString() y aplica trim.
export function normalizarClave(k) {
  return k.toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

export function claveHistoria(sp, tk) {
  return `${normalizarTexto(sp)}|||${normalizarTexto(tk)}`;
}

// Normaliza porcentaje: los valores en Excel vienen siempre como decimales (0.0–1.0).
export function normalizarPorcentaje(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return 0;
  return Math.min(n * 100, 100);
}

// Parsea un decimal aceptando "," o "." como separador (formato chileno o internacional).
export function parsearDecimal(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const limpio = String(v).trim().replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}
