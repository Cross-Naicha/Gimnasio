# Ronda

Calculadora personal de entrenamiento: cinco sesiones circulares y nueve etapas
compartidas. No requiere una cuenta ni un servidor con base de datos.

## Abrir

En VS Code, abrí `index.html` con **Open with Live Server** (extensión Live Server).
El navegador debe mostrar una dirección HTTP, no `file://`. Los JSON se leen
desde ese servidor estático. No requiere compilación. Para GitHub Pages, publicá
`index.html`, los archivos JS y CSS, y la carpeta `datos` respetando sus rutas.
Las rutas relativas también funcionan en páginas de proyecto como `/ronda/`.

## Primer uso

1. Editá los archivos de `datos` siguiendo [la guía de datos](datos/README.md).
   También podés usar **Mi gimnasio** para reemplazar localmente los ejemplos.
   Los discos se expresan como `peso; pares disponibles`, una línea por tamaño.
   Las mancuernas, kettlebells y máquinas usan una lista separada por punto y coma.
   Se aceptan comas decimales en esas listas.
2. En **Ejercicios y RM**, elegí el equipo antes de ingresar los RM.
   Bench comienza con el dato conocido de 102,5 kg, sin fecha inventada.
   Los demás principales no tienen RM cargado.
3. Añadí un RM y elegí **Aplicar a la rutina**. Registrar y aplicar son acciones
   separadas; los RM anteriores se conservan.
4. En **Entrenamiento**, elegí sesión y etapa. No hay avance automático.
5. Exportá periódicamente un respaldo desde **Respaldo**.

### Guardado y respaldo

Los cambios se guardan en `localStorage`, bajo `ronda.config.v1`. El guardado es
local al navegador y al origen; no se sincroniza entre dispositivos. Al abrir
mediante `file://`, su comportamiento depende del navegador y de la ubicación del
archivo. Esta versión necesita HTTP para cargar JSON. Exportá antes de cambiar
de dirección, puerto o navegador: cada origen mantiene su almacenamiento.

### Prioridad entre JSON y navegador

Al abrir se cargan y validan todos los JSON. Si hay una configuración local válida,
se utiliza esa copia completa (incluidas sus progresiones); no se mezclan registros.
Si no hay copia local, se usan directamente los JSON. Cambiar una selección o
guardar un formulario crea una copia local. Ninguna interacción escribe archivos
del repositorio.

Después de editar los JSON en VS Code, entrá a **Respaldo → Revisar JSON del
proyecto → Usar estos JSON**. La primera acción valida; la segunda reemplaza
la configuración local completa. Exportá antes si querés conservarla.
Un archivo inválido no reemplaza la configuración. Los respaldos antiguos sin
progresiones adoptan las del proyecto al cargarse.

Si falla el guardado, se muestra un aviso. Si los datos existentes son inválidos,
la app muestra ejemplos sin sobrescribirlos. El respaldo JSON contiene toda la
configuración. La importación valida estructura, límites y referencias antes de
pedir la confirmación final de reemplazo. No importa archivos Excel.

## Organización del código

- `index.html`: estructura, navegación y carga de archivos.
- `styles.css`: colores, componentes y adaptación a celular; sigue el tema del sistema.
- `calculations.js`: tablas de progresión, redondeo y duración. Funciones puras.
- `data-loader.js`: carga asíncrona de JSON y resolución de rutas y sesiones.
- `datos/`: fuente editable de ejercicios, inventarios, rutina y progresiones.
- `app.js`: datos iniciales, validación, almacenamiento, formularios y pantallas.
- `tests.cjs`: comprobaciones de los cálculos y de la interfaz en Edge sin ventana.

La indentación de los archivos principales es de cuatro espacios. Los comentarios
explican decisiones y reglas; los nombres de funciones describen cada operación.
No hay bibliotecas externas, servicios remotos ni analítica. Solo se solicitan
los JSON del mismo sitio. `calculations.js` recibe las progresiones como datos.

## Reglas de entrenamiento

- Sesiones: bench press, squats, jalón amplio, deadlift y shoulder press.
- Cada sesión tiene exactamente un principal y hasta cuatro accesorios opcionales.
- Todas comparten la etapa seleccionada, entre 1 y 9. No se usa el calendario.
- Los principales tienen tres series; accesorios de una a tres, configurables.
- Descansos iniciales: 180 segundos para principales y 120 para accesorios.
- La tabla principal proviene de `Ciclos.xlsx`, hoja Principal.
- La tabla accesoria corresponde a la propuesta ajustada: 60–75% del RM,
  entre 8 y 15 repeticiones según serie y etapa. Está en `datos/progresiones.json`.
- Un accesorio nuevo empieza con tres series. Su número puede reducirse antes
  de entrenar. La aplicación no exige registrar esfuerzo ni completar sesiones.

La propuesta accesoria no es un protocolo clínicamente validado ni garantiza
un esfuerzo determinado. Se planteó buscar unas 2–3 repeticiones en reserva;
los porcentajes son orientativos y el redondeo puede aumentar la exigencia.
La sostenibilidad depende también del ejercicio y de la clase de CrossFit.

Referencias usadas para la propuesta:

- Nuzzo et al.: https://pubmed.ncbi.nlm.nih.gov/37792272/
- Refalo et al.: https://pubmed.ncbi.nlm.nih.gov/38393985/

## Cálculo de pesos

Peso teórico = RM aplicado × porcentaje de la serie.
Peso posible = menor carga disponible mayor o igual al teórico.

Para barras, se enumeran combinaciones simétricas limitadas por los pares
disponibles. Entre combinaciones del mismo peso se prefiere la de menos discos.
La barra está incluida en el peso total. Los discos se calculan en centésimas de
kg para evitar errores de coma flotante. La comparación usa una tolerancia
numérica mínima para no subir un escalón por un error de representación.

Para mancuernas y kettlebells el peso es por unidad. Para poleas es el indicado
por esa máquina, sin convertir relaciones mecánicas. No hay extrapolación si
el inventario no alcanza: aparece un aviso.

Los RM pertenecen al ejercicio y su equipo. Se impide cambiar la asociación
de equipo de un ejercicio con historial para no reinterpretar sus marcas.
Se puede editar el inventario asociado. Variantes adicionales de principales
requieren por ahora una futura ampliación del modelo; no hay borrado de RM.

## Duraciones

Tiempo de un ejercicio = repeticiones × segundos por repetición
+ (series − 1) × descanso + preparación/transición.

No se agrega descanso después de la última serie. La preparación de cada
ejercicio cubre su transición para no duplicarla. Los valores iniciales son
ejemplos: 3 segundos por repetición, 120 segundos de preparación para principales
y 60 para accesorios. Calentamiento y CrossFit están sin definir (0) y no se
suman hasta configurarlos. El total corresponde solo a ejercicios cargados.

## Pruebas

Con Node, Playwright y Microsoft Edge disponibles, ejecutar `node tests.cjs`.
La app en sí no requiere Node ni Playwright. La prueba usa `NODE_PATH` si
Playwright se encuentra fuera del proyecto.
Se comprueban progresiones, combinaciones, límites, duración, aplicación de RM,
persistencia y navegación. La prueba inicia y cierra su propio servidor HTTP,
comprueba rutas bajo una subcarpeta, recarga JSON editados y rechaza fuentes
inválidas sin sobrescribir datos locales. No reemplaza la inspección en el
dispositivo final.

## Alcance de esta primera versión

Incluye cálculo y consulta, configuración, historial de RM y respaldos.
No incluye cronómetros, asistencia, sincronización, autoavance, registro de series
realizadas ni análisis de las clases de CrossFit. Los accesorios pueden cargarse
con nombres libres más adelante. No modifica el Excel original.
