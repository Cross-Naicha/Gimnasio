# Editar los datos de Ronda

Todos los archivos usan JSON estándar con cuatro espacios de indentación.
JSON no admite comentarios ni comas después del último elemento. Los números
usan punto decimal: `102.5`, sin comillas. Esta guía documenta sus campos.

## Un archivo por ejercicio

Los cinco principales están en `ejercicios/`. Sus nombres son libres;
los identificadores y las referencias deben coincidir exactamente.

| Campo | Significado |
| --- | --- |
| `id` | Identificador único y estable. No cambiar al actualizar un RM. |
| `name` | Nombre visible; puede ser una descripción informal. |
| `kind` | `principal` o `accessory`. Selecciona la tabla de progresión. |
| `equipment` | ID del inventario de `equipamiento.json`. |
| `sets` | Tres para un principal; de una a tres para accesorios. |
| `rest` | Descanso entre series, en segundos. |
| `secondsPerRep` | Duración estimada de una repetición. |
| `preparation` | Preparación/transición antes del ejercicio, en segundos. |
| `records` | Lista de RM: cada registro tiene `id`, `kg` y `date`. |
| `active` | ID del RM aplicado, o `null` si aún no hay referencia. |

Para un RM nuevo, agregá un registro con ID único, por ejemplo:

```json
{
    "id": "rm-002",
    "kg": 105,
    "date": "2026-09-23"
}
```

La fecha es un ejemplo: ingresá la real, o `""` si no la conocés.
Luego cambiá `active` a `"rm-002"` si querés aplicarlo. No borres el registro
anterior. `kg` significa peso total con barra, por mancuerna/kettlebell o carga
indicada por la máquina, según el inventario asociado.

## Equipamiento compartido

`equipamiento.json` contiene una lista. Cada elemento tiene `id`, `name` y
`type`: `bar`, `db`, `kb` o `machine`.

- Barra: `bar` es el peso de la barra y `plates` es una lista de objetos con
  `kg` y `pairs`. `{"kg": 20, "pairs": 2}` significa cuatro discos de 20 kg.
- Los demás tipos: `weights` lista las cargas disponibles, por ejemplo
  `[5, 7.5, 10]`. No se supone un salto constante.
- Máquinas diferentes deben tener IDs diferentes. Los RM son específicos
  del ejercicio y de la máquina/variante usados.

El tipo de máquina se define aquí para no duplicarlo en cada ejercicio. Cada
ejercicio lo referencia mediante `equipment`. Los inventarios iniciales son
ejemplos; reemplazalos por la disponibilidad real.

## Orden circular y accesorios

`rutina.json` tiene cinco objetos en `sessions`, en su orden circular.
Cada sesión contiene `exercises`, una lista de rutas relativas a `datos`.
Por ejemplo, para agregar un accesorio en la primera sesión:

```json
{
    "exercises": [
        "ejercicios/bench-press.json",
        "ejercicios/extension-con-cuerda.json"
    ]
}
```

Creá `ejercicios/extension-con-cuerda.json` copiando un ejercicio y cambiando
`id`, `name`, `kind` a `accessory`, `equipment`, `rest` a 120, `records` a `[]`
y `active` a `null`. No copies el RM de bench. La sesión se asigna por la lista;
no hay que poner `session` en el archivo individual. Debe haber exactamente
un principal y hasta cuatro accesorios por sesión. No se puede repetir un archivo
ni un ID. Las rutas usan minúsculas, números y guiones.

Los campos iniciales `session` (0–4) y `stage` (0–8) de la rutina se muestran
como 1–5 y 1–9 en pantalla. `warmup` y `crossfit` se expresan en minutos;
0 significa sin definir. `version` debe permanecer en 1.

## Progresiones

`progresiones.json` tiene dos claves: `principal` y `accessory`. Cada una
contiene nueve etapas, y cada etapa tres objetos con `reps` y `percent`.
`percent: 70` significa 70%, no 0.70. Ambas categorías comparten la etapa.
Si un accesorio tiene menos de tres series, usa las primeras series de la etapa.

## Aplicar cambios y recuperar errores

Guardá los archivos y usá **Respaldo → Revisar JSON del proyecto → Usar estos
JSON**. Si hay cambios locales, una recarga normal no los elimina. La acción
explícita reemplaza la copia local completa; antes podés exportar un respaldo.

Los mensajes de carga indican archivos inexistentes, JSON mal escrito o reglas
inválidas. Ante un error inicial, corregí el archivo y recargá. No se genera
silenciosamente una rutina de ejemplo ni se sobrescribe el almacenamiento local.

El respaldo exportado es un único JSON completo. No es un archivo individual
de ejercicio: para llevar sus cambios al repositorio copiá los campos pertinentes
a sus archivos correspondientes. La página no escribe en GitHub ni en VS Code.
