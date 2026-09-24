/* Ronda: interfaz y persistencia. Sin dependencias ni servicios externos. */
(function () {
    "use strict";

    const STORAGE_KEY = "ronda.config.v1";
    const math = window.RondaMath;
    const content = document.getElementById("content");
    let names = [];
    let sourceState = null;
    let page = "training";
    let selectedExercise = 0;
    let selectedEquipment = 0;
    let pendingImport = null;

    const escape = value => String(value).replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
    const format = value => value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
    const time = seconds => `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
    const id = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random()}`;

    // Un respaldo se valida por completo antes de sustituir el estado actual.
    function validate(data) {
        const assert = (ok, message) => { if (!ok) throw new Error(message); };
        const num = (n, min, max) => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
        const integer = (n, min, max) => Number.isInteger(n) && num(n, min, max);
        const text = value => typeof value === "string" && value.length > 0 && value.length <= 120;
        assert(data && data.version === 1, "Versión de respaldo no compatible.");
        assert(integer(data.session, 0, 4) && integer(data.stage, 0, 8), "Sesión o etapa inválida.");
        assert(num(data.warmup, 0, 120) && num(data.crossfit, 0, 240), "Duraciones inválidas.");
        assert(Array.isArray(data.equipment) && data.equipment.length > 0 && data.equipment.length <= 30, "Inventario inválido.");
        const equipmentIds = new Set();
        for (const eq of data.equipment) {
            assert(text(eq.id) && !equipmentIds.has(eq.id) && text(eq.name), "Identificación de equipo inválida.");
            equipmentIds.add(eq.id);
            assert(["bar", "db", "kb", "machine"].includes(eq.type), "Tipo de equipo inválido.");
            if (eq.type === "bar") {
                assert(num(eq.bar, 1, 100) && Array.isArray(eq.plates) && eq.plates.length <= 12, "Barra inválida.");
                assert(eq.plates.every(p => num(p.kg, .01, 100) && Math.abs(p.kg * 100 - Math.round(p.kg * 100)) < 1e-6 && integer(p.pairs, 0, 10)), "Discos inválidos (máximo dos decimales).");
            } else {
                assert(Array.isArray(eq.weights) && eq.weights.length <= 100 && eq.weights.every(w => num(w, .01, 1000)), "Pesos inválidos.");
            }
        }
        assert(Array.isArray(data.exercises) && data.exercises.length >= 5 && data.exercises.length <= 25, "Ejercicios inválidos.");
        const exerciseIds = new Set();
        for (const ex of data.exercises) {
            assert(text(ex.id) && !exerciseIds.has(ex.id) && text(ex.name), "Identificación de ejercicio inválida.");
            exerciseIds.add(ex.id);
            assert(["principal", "accessory"].includes(ex.kind) && integer(ex.session, 0, 4), "Clasificación inválida.");
            assert(equipmentIds.has(ex.equipment), "Equipo de ejercicio inexistente.");
            assert(integer(ex.sets, 1, 3) && (ex.kind !== "principal" || ex.sets === 3), "Series inválidas.");
            assert(num(ex.rest, 0, 900) && num(ex.secondsPerRep, .1, 30) && num(ex.preparation, 0, 1800), "Tiempos inválidos.");
            assert(Array.isArray(ex.records) && ex.records.length <= 500, "Historial inválido.");
            const ids = new Set();
            for (const record of ex.records) {
                assert(text(record.id) && !ids.has(record.id) && num(record.kg, .01, 1000), "RM inválido.");
                assert(typeof record.date === "string" && (record.date === "" || /^\d{4}-\d{2}-\d{2}$/.test(record.date)), "Fecha inválida.");
                ids.add(record.id);
            }
            assert(ex.active === null || ids.has(ex.active), "RM aplicado inexistente.");
        }
        for (let session = 0; session < 5; session += 1) {
            assert(data.exercises.filter(ex => ex.session === session && ex.kind === "principal").length === 1, "Debe haber un principal por sesión.");
            assert(data.exercises.filter(ex => ex.session === session && ex.kind === "accessory").length <= 4, "Máximo cuatro accesorios por sesión.");
        }
        math.validateProgressions(data.progressions);
        return data;
    }

    function warning(message) {
        const el = document.getElementById("storage-warning");
        el.textContent = message;
        el.hidden = false;
    }

    let state = null;
    let storageBlocked = false;

    function persist() {
        if (storageBlocked) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            warning("Los cambios siguen en esta pestaña, pero no se pudieron guardar. Exportá un respaldo antes de cerrar.");
        }
    }

    function status(message) { document.getElementById("status").textContent = message; }
    function options(items, selected) {
        return items.map(([value, label]) => `<option value="${escape(value)}" ${String(value) === String(selected) ? "selected" : ""}>${escape(label)}</option>`).join("");
    }
    function field(label, name, value, min, max, step = "any") {
        return `<label>${label}<input name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" required></label>`;
    }
    function equipmentUnit(eq) {
        return { bar: "Peso total, incluida la barra", db: "Peso por mancuerna", kb: "Peso por kettlebell", machine: "Carga indicada por esta máquina" }[eq.type];
    }

    function exerciseCard(ex) {
        const eq = state.equipment.find(item => item.id === ex.equipment);
        const rm = ex.records.find(record => record.id === ex.active);
        const rows = math.prescription(ex.kind, state.stage, ex.sets).map((set, index) => {
            const theoretical = rm ? rm.kg * set.percent / 100 : null;
            const possible = rm ? math.possibleWeight(theoretical, eq) : null;
            return `<div class="set">
                <span class="muted">0${index + 1}</span>
                <div><strong>${set.reps}</strong> reps<div class="small">${format(set.percent)}% del RM</div></div>
                <div class="right"><strong>${possible ? format(possible.weight) + " kg" : "—"}</strong>
                    <div class="small">${rm ? "Teórico · " + format(theoretical) + " kg" : "Falta aplicar un RM"}</div></div>
                ${rm ? `<div class="load">${possible ? (eq.type === "bar" ? "Por lado · " + (possible.plates.length ? possible.plates.map(format).join(" + ") + " kg" : "Barra sola") : escape(equipmentUnit(eq))) + " · " + format(possible.weight / rm.kg * 100) + "% real del RM" : "No hay una carga suficiente en el inventario."}</div>` : ""}
            </div>`;
        }).join("");
        return `<article class="panel"><div class="row"><div><div class="eyebrow">${ex.kind === "principal" ? "Principal" : "Accesorio"}</div><h2>${escape(ex.name)}</h2><div class="small">RM aplicado · ${rm ? format(rm.kg) + " kg" : "Pendiente"}</div></div><span class="pill">Descanso · ${time(ex.rest)}</span></div><p class="small">${escape(eq.name)} · ${escape(equipmentUnit(eq))}</p>${rows}<div class="small">Tiempo estimado · ${time(math.duration(ex, state.stage))}</div></article>`;
    }

    function training() {
        const exercises = state.exercises.filter(ex => ex.session === state.session);
        const seconds = exercises.reduce((sum, ex) => sum + math.duration(ex, state.stage), 0) + state.warmup * 60;
        return `<div class="eyebrow">Musculación · Secuencia circular</div><h1>Tu próxima sesión</h1>
            <div class="grid"><label>Sesión<select id="session">${options(names.map((name, i) => [i, `${i + 1} · ${name}`]), state.session)}</select></label>
            <label>Etapa · Común a todos los ejercicios<select id="stage">${options(Array.from({ length: 9 }, (_, i) => [i, `${i + 1} de 9 · Ciclo ${Math.floor(i / 3) + 1}, paso ${i % 3 + 1}`]), state.stage)}</select></label></div>
            ${exercises.map(exerciseCard).join("")}
            ${exercises.length === 1 ? '<p class="muted">Accesorios pendientes · Podés agregarlos más adelante.</p>' : ""}
            <section class="panel"><div class="eyebrow">Musculación · Ejercicios cargados</div><div class="total">${time(seconds)}</div><p class="small">Incluye ejecución, descansos entre series y preparación de cada ejercicio. Tiempos iniciales de ejemplo, editables en configuración.</p>
            <p class="small">Calentamiento: ${state.warmup ? state.warmup + " min" : "sin definir; no incluido"}. CrossFit: ${state.crossfit ? state.crossfit + " min · Total combinado: " + time(seconds + state.crossfit * 60) : "sin definir; no incluido"}.</p></section>`;
    }

    function settings() {
        const ex = state.exercises[selectedExercise];
        const rm = ex.records.find(record => record.id === ex.active);
        return `<div class="eyebrow">Tu punto de partida</div><h1>Ejercicios y RM</h1>
            <label>Ejercicio<select id="exercise">${options(state.exercises.map((item, i) => [i, item.name]), selectedExercise)}</select></label>
            <section class="panel"><div class="row"><h2>${escape(ex.name)}</h2><span class="pill">${ex.kind === "principal" ? "Principal" : "Accesorio"}</span></div>
            <p>RM aplicado: <strong>${rm ? format(rm.kg) + " kg" : "Pendiente"}</strong></p>
            <form id="exercise-form"><div class="grid"><label>Nombre<input name="name" value="${escape(ex.name)}" maxlength="120" required></label><label>Equipo<select name="equipment">${options(state.equipment.map(eq => [eq.id, eq.name]), ex.equipment)}</select></label>
            ${ex.kind === "accessory" ? field("Series", "sets", ex.sets, 1, 3, 1) : '<input type="hidden" name="sets" value="3">'}
            ${field("Descanso entre series · segundos", "rest", ex.rest, 0, 900)}
            ${field("Ejecución · segundos por repetición", "secondsPerRep", ex.secondsPerRep, .1, 30)}
            ${field("Preparación / transición · segundos", "preparation", ex.preparation, 0, 1800)}</div><button class="primary">Guardar ejercicio</button></form>
            <h3>Añadir un RM al historial</h3><form id="rm-form"><div class="grid">${field("RM · kg (según equipo asociado)", "kg", "", .01, 1000)}<label>Fecha · Opcional<input type="date" name="date"></label></div><button>Añadir RM</button></form>
            <details open><summary>Historial de RM</summary>${ex.records.length ? ex.records.map(record => `<div class="row entry"><span>${format(record.kg)} kg · ${escape(record.date || "Sin fecha")}</span><button data-apply="${escape(record.id)}" ${ex.active === record.id ? "disabled" : ""}>${ex.active === record.id ? "En uso" : "Aplicar a la rutina"}</button></div>`).join("") : '<p class="small">Sin registros.</p>'}</details>
            <p class="small">Aplicar un RM cambia los cálculos; añadirlo al historial no lo aplica automáticamente. Conservá la misma variante de ejercicio y equipo al comparar registros.</p></section>
            <details class="panel"><summary>Agregar un accesorio</summary><form id="accessory-form"><div class="grid"><label>Nombre o descripción<input name="name" placeholder="Ej. Extensión con cuerda" maxlength="120" required></label><label>Sesión<select name="session">${options(names.map((name, i) => [i, name]), state.session)}</select></label></div><button>Agregar accesorio</button></form><p class="small">Hasta cuatro por sesión. Empieza con tres series y dos minutos de descanso, editables.</p></details>
            <details class="panel"><summary>Calentamiento y CrossFit</summary><form id="time-form"><div class="grid">${field("Calentamiento · minutos (0 = sin definir)", "warmup", state.warmup, 0, 120)}${field("CrossFit · minutos (0 = sin definir)", "crossfit", state.crossfit, 0, 240)}</div><button>Guardar tiempos</button></form></details>`;
    }

    function equipment() {
        const eq = state.equipment[selectedEquipment];
        return `<div class="eyebrow">Disponibilidad real</div><h1>Mi gimnasio</h1><p class="small">Inventarios iniciales de ejemplo. Reemplazalos por tu equipo. Redondeo siempre hacia arriba.</p>
            <label>Inventario<select id="equipment">${options(state.equipment.map((item, i) => [i, item.name]), selectedEquipment)}</select></label>
            <form id="equipment-form" class="panel"><label>Nombre<input name="name" value="${escape(eq.name)}" maxlength="120" required></label>
            ${eq.type === "bar" ? `<div class="grid">${field("Barra · kg", "bar", eq.bar, 1, 100)}</div><label>Discos: kg; pares disponibles (una línea por tamaño)<textarea name="plates" required>${eq.plates.map(p => `${format(p.kg)}; ${p.pairs}`).join("\n")}</textarea></label><p class="small">Ejemplo: 20; 2 significa dos pares de discos de 20 kg. Máximo 12 tamaños y 10 pares por tamaño.</p>` : `<label>Pesos · kg separados por punto y coma<textarea name="weights" required>${eq.weights.map(format).join("; ")}</textarea></label><p class="small">${escape(equipmentUnit(eq))}. Ejemplo: 5; 7,5; 10</p>`}
            <button class="primary">Guardar inventario</button></form>
            <details class="panel"><summary>Agregar otro equipo o máquina</summary><form id="new-equipment"><div class="grid"><label>Nombre<input name="name" maxlength="120" required></label><label>Tipo<select name="type"><option value="bar">Barra y discos</option><option value="db">Mancuernas</option><option value="kb">Kettlebells</option><option value="machine">Máquina con polea</option></select></label></div><button>Agregar equipo</button></form></details>`;
    }

    function backup() {
        return `<div class="eyebrow">Tus datos, a mano</div><h1>Copia de seguridad</h1><section class="panel"><h2>Archivos JSON del proyecto</h2><p>Los cambios del navegador tienen prioridad sobre los archivos. Para usar tus ediciones en VS Code, recargá los JSON. Primero exportá un respaldo si querés conservar cambios locales.</p><button id="reload-source">Revisar JSON del proyecto</button><div id="source-preview"></div></section><section class="panel"><h2>Exportar configuración</h2><p>Incluye RM e historial, equipo, ejercicios, tiempos y selección de sesión y etapa.</p><button id="export" class="primary">Descargar respaldo JSON</button></section><section class="panel"><h2>Importar un respaldo</h2><label>Archivo JSON<input id="import" type="file" accept=".json,application/json"></label><div id="import-preview"></div></section><p class="small">La configuración se guarda en este navegador, en este dispositivo. No se sincroniza ni reemplaza una copia de seguridad. Borrar datos del navegador puede eliminarla.</p>`;
    }

    function render() {
        math.configure(state.progressions);
        names = Array.from({ length: 5 }, (_, session) =>
            state.exercises.find(ex => ex.session === session && ex.kind === "principal").name
        );
        document.querySelectorAll("[data-page]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.page === page)));
        content.innerHTML = { training, settings, equipment, backup }[page]();
        bind();
    }

    // Todas las mutaciones pasan por una copia validada: un formulario inválido
    // no deja el estado parcialmente actualizado.
    function update(change, message) {
        try {
            const next = JSON.parse(JSON.stringify(state));
            change(next);
            validate(next);
            state = next;
            persist();
            render();
            status(message || "Configuración actualizada.");
        } catch (error) { status(error.message); }
    }

    function on(selector, event, handler) {
        const element = content.querySelector(selector);
        if (element) element.addEventListener(event, handler);
    }
    function form(selector, handler) {
        on(selector, "submit", event => {
            event.preventDefault();
            handler(new FormData(event.target));
        });
    }

    function bind() {
        on("#reload-source", "click", async () => {
            content.querySelector("#source-preview").replaceChildren();
            try {
                const loaded = validate(await window.RondaData.load());
                const preview = content.querySelector("#source-preview");
                if (!preview) return;
                preview.innerHTML = '<p>JSON válidos. Reemplazará todos los cambios locales, incluidos RM y selecciones.</p><button id="apply-source">Usar estos JSON</button>';
                preview.querySelector("button").onclick = () => {
                    sourceState = loaded;
                    state = JSON.parse(JSON.stringify(loaded));
                    selectedExercise = 0;
                    selectedEquipment = 0;
                    storageBlocked = false;
                    document.getElementById("storage-warning").hidden = true;
                    persist();
                    render();
                    status("Configuración recargada desde los JSON.");
                };
            } catch (error) { status("No se reemplazó la configuración: " + error.message); }
        });
        on("#session", "change", event => update(next => { next.session = +event.target.value; }, "Sesión seleccionada."));
        on("#stage", "change", event => update(next => { next.stage = +event.target.value; }, "Etapa aplicada a todos los ejercicios."));
        on("#exercise", "change", event => { selectedExercise = +event.target.value; render(); });
        on("#equipment", "change", event => { selectedEquipment = +event.target.value; render(); });
        form("#exercise-form", data => update(next => {
            const ex = next.exercises[selectedExercise];
            ex.name = data.get("name").trim();
            const equipmentChanged = ex.equipment !== data.get("equipment");
            if (equipmentChanged && ex.records.length) throw new Error("Este ejercicio ya tiene RM: mantené su equipo para no mezclar referencias. Para otra variante, creá otro ejercicio.");
            ex.equipment = data.get("equipment");
            ["sets", "rest", "secondsPerRep", "preparation"].forEach(key => { ex[key] = +data.get(key); });
        }));
        form("#rm-form", data => update(next => {
            next.exercises[selectedExercise].records.push({ id: id(), kg: +data.get("kg"), date: data.get("date") });
        }, "RM añadido. Elegí Aplicar a la rutina para usarlo."));
        content.querySelectorAll("[data-apply]").forEach(button => button.addEventListener("click", () => update(next => {
            next.exercises[selectedExercise].active = button.dataset.apply;
        }, "RM aplicado a los cálculos.")));
        form("#time-form", data => update(next => { next.warmup = +data.get("warmup"); next.crossfit = +data.get("crossfit"); }));
        form("#accessory-form", data => {
            const oldLength = state.exercises.length;
            update(next => {
                next.exercises.push({ id: id(), name: data.get("name").trim(), kind: "accessory", session: +data.get("session"), equipment: next.equipment[0].id, sets: 3, rest: 120, secondsPerRep: 3, preparation: 60, records: [], active: null });
            });
            if (state.exercises.length > oldLength) { selectedExercise = oldLength; render(); }
        });
        const decimal = value => Number(value.trim().replace(",", "."));
        form("#equipment-form", data => update(next => {
            const eq = next.equipment[selectedEquipment];
            eq.name = data.get("name").trim();
            if (eq.type === "bar") {
                eq.bar = +data.get("bar");
                eq.plates = data.get("plates").trim().split(/\r?\n/).map(line => {
                    const values = line.split(";");
                    if (values.length !== 2 || values.some(value => !value.trim())) throw new Error("Cada línea debe indicar kg; pares.");
                    return { kg: decimal(values[0]), pairs: decimal(values[1]) };
                });
            } else {
                eq.weights = data.get("weights").split(";").map(decimal);
            }
        }));
        form("#new-equipment", data => {
            const oldLength = state.equipment.length;
            update(next => {
                const type = data.get("type");
                next.equipment.push({ id: id(), name: data.get("name").trim(), type, ...(type === "bar" ? { bar: 20, plates: [] } : { weights: [] }) });
            });
            if (state.equipment.length > oldLength) { selectedEquipment = oldLength; render(); }
        });
        on("#export", "click", () => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 4)], { type: "application/json" }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `ronda-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
        on("#import", "change", async event => {
            const file = event.target.files[0];
            pendingImport = null;
            const preview = content.querySelector("#import-preview");
            preview.replaceChildren();
            if (!file) return;
            try {
                if (file.size > 2_000_000) throw new Error("El respaldo supera 2 MB.");
                const imported = JSON.parse(await file.text());
                // Los respaldos antiguos no incluyen la tabla: usar la fuente cargada.
                imported.progressions ??= sourceState.progressions;
                pendingImport = validate(imported);
                preview.innerHTML = `<p>${pendingImport.exercises.length} ejercicios y ${pendingImport.equipment.length} equipos. Reemplazará la configuración actual.</p><button id="confirm-import" class="primary">Reemplazar con este respaldo</button>`;
                preview.querySelector("button").onclick = () => {
                    state = pendingImport;
                    pendingImport = null;
                    selectedExercise = 0;
                    selectedEquipment = 0;
                    storageBlocked = false;
                    document.getElementById("storage-warning").hidden = true;
                    persist();
                    render();
                    status("Respaldo importado.");
                };
            } catch (error) { status("No se importó el archivo: " + error.message); }
        });
    }

    document.querySelectorAll("[data-page]").forEach(button => button.addEventListener("click", () => {
        if (!state) return;
        page = button.dataset.page;
        pendingImport = null;
        status("");
        render();
    }));
    async function initialize() {
        content.textContent = "Cargando configuración…";
        try {
            sourceState = validate(await window.RondaData.load());
            state = JSON.parse(JSON.stringify(sourceState));
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const local = JSON.parse(stored);
                    local.progressions ??= sourceState.progressions;
                    state = validate(local);
                    status("Usando cambios guardados en este navegador. En Respaldo podés recargar los JSON del proyecto.");
                }
            } catch (error) {
                storageBlocked = true;
                warning("No se pudo leer la configuración local. Se usan los JSON sin sobrescribir lo guardado. " + error.message);
            }
            render();
        } catch (error) {
            content.textContent = "No se pudo cargar la configuración. " + error.message;
            content.setAttribute("role", "alert");
        }
    }

    initialize();
})();
