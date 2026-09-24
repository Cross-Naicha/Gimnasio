/*
 * Cálculos puros: no leen la pantalla ni modifican datos guardados.
 * Se exponen también a Node para poder probarlos sin un navegador.
 */
(function (root) {
    "use strict";

    let progressions = null;

    function validateProgressions(value) {
        for (const kind of ["principal", "accessory"]) {
            if (!Array.isArray(value?.[kind]) || value[kind].length !== 9) {
                throw new Error("progresiones: cada categoría requiere nueve etapas.");
            }
            for (const stage of value[kind]) {
                if (!Array.isArray(stage) || stage.length !== 3 || !stage.every(set =>
                    Number.isInteger(set.reps) && set.reps > 0 && set.reps <= 100 &&
                    Number.isFinite(set.percent) && set.percent > 0 && set.percent <= 100
                )) {
                    throw new Error("progresiones: cada etapa requiere tres series con reps enteras y percent entre 0 y 100.");
                }
            }
        }
    }

    function configure(value) {
        validateProgressions(value);
        progressions = value;
    }

    function prescription(kind, stage, sets = 3) {
        if (!progressions) throw new Error("Las progresiones aún no se cargaron.");
        return progressions[kind][stage].slice(0, sets).map(set => ({ ...set }));
    }

    function possibleWeight(target, equipment) {
        if (!equipment || !Number.isFinite(target) || target <= 0) return null;

        if (equipment.type !== "bar") {
            const weight = [...equipment.weights].sort((a, b) => a - b)
                .find(value => value + 1e-8 >= target);
            return weight === undefined ? null : { weight, plates: [] };
        }

        // Centésimas de kg: evita errores acumulados de coma flotante.
        // Cada estado representa una carga simétrica, limitada por pares disponibles.
        let combinations = new Map([[0, []]]);
        for (const plate of equipment.plates) {
            const next = new Map();
            for (const [load, used] of combinations) {
                for (let count = 0; count <= plate.pairs; count += 1) {
                    const total = load + Math.round(plate.kg * 200) * count;
                    const candidate = used.concat(Array(count).fill(plate.kg));
                    if (!next.has(total) || candidate.length < next.get(total).length) {
                        next.set(total, candidate);
                    }
                }
            }
            combinations = next;
        }

        const loads = [...combinations.keys()].sort((a, b) => a - b);
        const selected = loads.find(load => equipment.bar + load / 100 + 1e-8 >= target);
        return selected === undefined ? null : {
            weight: equipment.bar + selected / 100,
            plates: combinations.get(selected).sort((a, b) => b - a)
        };
    }

    function duration(exercise, stage) {
        const series = prescription(exercise.kind, stage, exercise.sets);
        const execution = series.reduce((total, set) => total + set.reps, 0) * exercise.secondsPerRep;
        const rest = Math.max(0, series.length - 1) * exercise.rest;
        return execution + rest + exercise.preparation;
    }

    const api = { configure, validateProgressions, prescription, possibleWeight, duration };
    root.RondaMath = api;
    if (typeof module !== "undefined") module.exports = api;
})(globalThis);
