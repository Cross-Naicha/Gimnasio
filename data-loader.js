/* Lee únicamente archivos estáticos. Las rutas son relativas para GitHub Pages. */
(function (root) {
    "use strict";

    async function read(path) {
        const response = await fetch(new URL(`datos/${path}`, document.baseURI), {
            cache: "no-store"
        });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        try {
            return await response.json();
        } catch (error) {
            throw new Error(`${path}: JSON inválido. Revisá comas y comillas.`);
        }
    }

    async function load() {
        if (location.protocol === "file:") {
            throw new Error("Abrí index.html con Live Server de VS Code. La lectura de JSON requiere HTTP; no funciona con doble clic.");
        }
        const [routine, equipment, progressions] = await Promise.all([
            read("rutina.json"),
            read("equipamiento.json"),
            read("progresiones.json")
        ]);
        if (routine.version !== 1 || !Array.isArray(routine.sessions) || routine.sessions.length !== 5) {
            throw new Error("rutina.json debe contener version 1 y cinco sesiones.");
        }
        const files = new Set();
        const groups = await Promise.all(routine.sessions.map(async (session, index) => {
            if (!Array.isArray(session.exercises) || session.exercises.length < 1 || session.exercises.length > 5) {
                throw new Error(`Sesión ${index + 1}: indicá de uno a cinco archivos de ejercicios.`);
            }
            return Promise.all(session.exercises.map(async path => {
                if (typeof path !== "string" || !/^ejercicios\/[a-z0-9-]+\.json$/.test(path) || files.has(path)) {
                    throw new Error(`Ruta de ejercicio inválida o repetida: ${path}`);
                }
                files.add(path);
                return { ...await read(path), session: index };
            }));
        }));
        return {
            version: 1,
            session: routine.session,
            stage: routine.stage,
            warmup: routine.warmup,
            crossfit: routine.crossfit,
            equipment,
            exercises: groups.flat(),
            progressions
        };
    }

    root.RondaData = { load };
})(globalThis);
