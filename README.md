# Seguimiento de Proyectos

Dashboard React (Curva S, planificación, resumen, avances) que lee un Excel
local y renderiza con Recharts. Deploy estático a GitHub Pages.

## Quickstart

```bash
npm install
# Configurar el path al Excel (ver "Origen del Excel" más abajo):
echo 'EXCEL_PATH=/ruta/al/reporte.xlsx' > .env
npm start
```

Comandos:

| Comando            | Qué hace                                                              |
| ------------------ | --------------------------------------------------------------------- |
| `npm start`        | Corre `import-excel.js` (prestart) y arranca el dev server            |
| `npm run import-excel` | Solo regenera `src/datos-proyecto.json` desde el xlsx              |
| `npm run build`    | Build estático de producción                                          |
| `npm run deploy`   | `prebuild` + `build` + push a la rama `gh-pages`                      |

## Origen del Excel

`scripts/import-excel.js` lee el xlsx desde `process.env.EXCEL_PATH` y, si no
existe, cae a la ruta por defecto de Windows hardcodeada (`DEFAULT_EXCEL_PATH`,
apunta a la OneDrive del autor original). En Mac u otra máquina, crear un
`.env` local (ya gitignored) con:

```
EXCEL_PATH=/ruta/absoluta/al/reporte.xlsx
```

Si el archivo no se encuentra, el script imprime un warning y deja el JSON
existente intacto — el dashboard sigue funcionando con la data previa.

## Estructura del código

```
src/
├── App.js                  Orquestador: state, useMemo, useCallback,
│                            parser Excel del menú "⋮", switch de vistas.
├── index.js / index.css    Bootstrap CRA, intactos.
├── datos-proyecto.json     Generado por scripts/import-excel.js
├── build-info.json         Generado por scripts/generate-build-info.js
│
├── lib/                    Lógica pura, sin React, sin DOM.
│   ├── fechas.js           CHILE_HOLIDAYS, parsearFecha, formatearFecha,
│   │                        claveFecha, sumarDias, esDiaHabil,
│   │                        diasHabilesEntre, primerDiaHabilDesde,
│   │                        agregarDiasHabiles.
│   ├── texto.js            normalizarTexto, normalizarClave,
│   │                        claveHistoria, normalizarPorcentaje,
│   │                        parsearDecimal.
│   ├── hidratar.js         hidratarDatos (JSON → objetos Date).
│   ├── estadoProyecto.js   calcularEstadoQA, calcularEstadosProyectos.
│   └── curvaS.js           construirDatosCurva (planificada, real,
│                            proyectada, resumen, sombreado, downsample).
│
├── ui/
│   └── tema.js             tema (paleta oscura), COLORES_SPRINT,
│                            ORDEN_ESTADOS.
│
└── views/
    ├── VistaCurvaS.jsx        Vista chart: ComposedChart + tooltip inline +
    │                           breakdown de sprints inline.
    ├── VistaPlanificacion.jsx Tabla "Planificación y Estado por Historia".
    ├── VistaResumen.jsx       Tabla "Resumen por Sprint".
    ├── VistaAvances.jsx       Tabla "Registro de Avances".
    └── PlanificadorView.jsx   Calculadora de planificación.
```

## Cómo agregar feriados

Editar `src/lib/fechas.js` constante `CHILE_HOLIDAYS`. **También copiar** a
`scripts/import-excel.js` constante homónima — duplicado intencional porque
el script corre en Node CJS y la app en CRA ESM; no comparten módulos.

## Cómo agregar columna al Excel

1. Si afecta el modelo (tareas / avances / qa / validacionFinal): agregar el
   parseo de la nueva columna en `scripts/import-excel.js` y en el handler
   `manejarArchivo` de `App.js` (el botón "Importar Excel" del menú "⋮").
2. Si la nueva columna se usa en cálculos: actualizar `lib/curvaS.js` o
   `lib/estadoProyecto.js` según corresponda.
3. Si se muestra en UI: agregar columna a la vista correspondiente en
   `src/views/`.

## Cómo agregar una vista nueva

1. Crear `src/views/VistaX.jsx`.
2. Agregar entrada `{ k: "x", l: "Nombre" }` al view-toggle de `App.js`
   (busca el array `opcion`).
3. Agregar `{vista === "x" && proyectoActual && <VistaX ... />}` en `App.js`.

## Deuda conocida (no tocar sin tests manuales exhaustivos)

- **`descargarTodosZip`** itera mutando `setVista` y
  `setProyectoSeleccionado` con `setTimeout(500ms)` para que Recharts
  repinte entre proyectos. Frágil pero funcional. No refactorizar sin
  probar con ≥5 proyectos.
- **Helpers de fecha duplicados** entre `scripts/import-excel.js` (Node CJS)
  y `src/lib/fechas.js` (CRA ESM). Sincronizar manualmente.
- **Parser Excel inline** en `App.js → manejarArchivo`. Si se vuelve a
  tocar con frecuencia, considerar extraer a `src/lib/excel.js`.
- **Lógica "tema claro para captura PNG"** duplicada entre
  `descargarGrafico` y `descargarTodosZip`. Si se cambia, actualizar ambos
  lugares.
- **Magic numbers** en `lib/curvaS.js`:
  - `99.99` / `99.9` — tolerancia de redondeo flotante.
  - `730` — máximo de días para simular la curva proyectada (~2 años).
  - `60` — días buffer para extender la curva planificada después de
    `finProyecto`.
  - `220` / `180` — umbrales de downsampling de puntos.

## Stack

React 18 · Recharts · xlsx · html2canvas · JSZip · dotenv.
**No agregar packages nuevos sin aprobación.**

## Tests

No hay suite. Validación es manual:

1. `npm start` y verificar que el dashboard carga el dataset inicial.
2. Navegar las 4 pestañas (Curva S / Planificación / Avances / Resumen)
   y verificar render correcto.
3. Descargar PNG individual.
4. Descargar ZIP de todos los gráficos.
5. Abrir el menú "⋮" → "Planificar nuevo proyecto" → agregar filas,
   cargar Excel, exportar Excel.
