// Paleta de colores y constantes visuales del dashboard.
// El tema "claro" para captura PNG vive inline en App.js (descargarGrafico
// y descargarTodosZip lo construyen al vuelo); no se centraliza acá por
// ser deuda conocida documentada en el README.

export const tema = {
  fondo: "#111111", superficie: "#1A1A1A", superficieHover: "#222222",
  borde: "#2A2A2A", bordeHover: "#383838",
  texto: "#C8C8D0", textoMedio: "#8E8E98", textoClaro: "#F0F0F0",
  acento: "#E5E5E5", verde: "#0076A8", verdeExito: "#22C55E", naranja: "#FBBF24",
  rojo: "#FB923C", morado: "#C8C8D0", turquesa: "#9A9AA3",
};

export const COLORES_SPRINT = [
  "rgba(255,255,255,0.02)", "rgba(255,255,255,0.05)",
  "rgba(255,255,255,0.02)", "rgba(255,255,255,0.05)",
  "rgba(255,255,255,0.02)", "rgba(255,255,255,0.05)",
];

// Orden de proyectos: en curso primero, finalizados al final.
export const ORDEN_ESTADOS = {
  "Sin Iniciar": 0,
  "En Proceso": 1,
  "En QA": 2,
  "EN VALIDACIÓN FINAL": 3,
  "Finalizado": 4,
};
