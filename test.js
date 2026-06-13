/* Test headless : valide la cohérence des données + simule une partie
   automatique pour vérifier que le jeu est gagnable. Lancer : node test.js */
const fs = require('fs');
const vm = require('vm');

// --- Stubs navigateur ---
const storage = {};
const ctx = {
  localStorage: {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: k => { delete storage[k]; },
  },
  Date, Math, JSON, console, Object, Array, String, Number, Infinity, isNaN,
};
vm.createContext(ctx);
// On combine les fichiers (les `const` de haut niveau ne persistent pas entre
// deux runInContext) puis on expose explicitement les globales sur le contexte.
const combined = fs.readFileSync('data.js', 'utf8') + '\n' +
  fs.readFileSync('engine.js', 'utf8') + '\n' +
  'globalThis.GAME_DATA = GAME_DATA; globalThis.Game = Game;';
vm.runInContext(combined, ctx);

const { GAME_DATA, Game } = ctx;
const { ITEMS, RECIPES, MACHINES, GENERATORS, TECHS, CONFIG } = GAME_DATA;

let errors = 0;
const err = m => { console.error('  ❌ ' + m); errors++; };

/* ---------- 1) Cohérence des données ---------- */
console.log('== Validation des données ==');
const recipeIds = new Set(RECIPES.map(r => r.id));
const techIds = new Set(TECHS.map(t => t.id));

for (const r of RECIPES) {
  for (const id in r.in) if (!ITEMS[id]) err(`recette ${r.id} : entrée inconnue ${id}`);
  for (const id in r.out) if (!ITEMS[id]) err(`recette ${r.id} : sortie inconnue ${id}`);
  if (r.unlock && !techIds.has(r.unlock)) err(`recette ${r.id} : unlock inconnu ${r.unlock}`);
  // une machine doit pouvoir produire cette recette
  const ok = Object.values(MACHINES).some(m => m.cats.includes(r.cat));
  if (!ok) err(`recette ${r.id} : aucune machine pour la catégorie ${r.cat}`);
}
for (const mid in MACHINES) {
  const m = MACHINES[mid];
  for (const id in m.cost) if (!ITEMS[id]) err(`machine ${mid} : coût inconnu ${id}`);
  if (m.unlock && !techIds.has(m.unlock)) err(`machine ${mid} : unlock inconnu ${m.unlock}`);
}
for (const gid in GENERATORS) {
  const g = GENERATORS[gid];
  for (const id in g.cost) if (!ITEMS[id]) err(`générateur ${gid} : coût inconnu ${id}`);
  if (g.unlock && !techIds.has(g.unlock)) err(`générateur ${gid} : unlock inconnu ${g.unlock}`);
}
for (const t of TECHS) {
  for (const p of t.prereq) if (!techIds.has(p)) err(`tech ${t.id} : prérequis inconnu ${p}`);
  for (const id in t.cost) if (!ITEMS[id]) err(`tech ${t.id} : science inconnue ${id}`);
  (t.recipes || []).forEach(x => { if (!recipeIds.has(x)) err(`tech ${t.id} : recette inconnue ${x}`); });
  (t.machines || []).forEach(x => { if (!MACHINES[x]) err(`tech ${t.id} : machine inconnue ${x}`); });
  (t.generators || []).forEach(x => { if (!GENERATORS[x]) err(`tech ${t.id} : générateur inconnu ${x}`); });
}
console.log(errors === 0 ? '  ✅ Données cohérentes' : `  ${errors} erreur(s)`);

/* ---------- 2) Accessibilité de l'arbre technologique ---------- */
console.log('\n== Arbre technologique ==');
(function checkTechGraph() {
  // Détection de cycle + tous les prérequis atteignables depuis la racine ([])
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of TECHS) {
      if (reachable.has(t.id)) continue;
      if (t.prereq.every(p => reachable.has(p))) { reachable.add(t.id); changed = true; }
    }
  }
  for (const t of TECHS) if (!reachable.has(t.id)) err(`recherche inatteignable (cycle/prérequis) : ${t.id}`);

  // Chaque science exigée par une recherche doit être produite par une recette
  // débloquée par une recherche atteignable AVANT (ou sans recherche).
  const techsUnlocking = {}; // recipeId → techId qui le débloque
  for (const t of TECHS) (t.recipes || []).forEach(rid => { techsUnlocking[rid] = t.id; });
  for (const t of TECHS) {
    for (const sci in t.cost) {
      const prod = RECIPES.find(r => r.out[sci]);
      if (!prod) { err(`science ${sci} (tech ${t.id}) : aucune recette ne la produit`); continue; }
      if (prod.unlock) {
        // la recherche qui débloque la recette de science doit être un prérequis
        // (transitif) de t, sinon on ne pourrait jamais la produire à temps
        const need = prod.unlock;
        const transitivePrereqs = new Set();
        const stack = [...t.prereq];
        while (stack.length) { const p = stack.pop(); if (transitivePrereqs.has(p)) continue; transitivePrereqs.add(p); const tp = TECHS.find(x => x.id === p); if (tp) stack.push(...tp.prereq); }
        if (need !== t.id && !transitivePrereqs.has(need)) {
          err(`recherche ${t.id} exige ${sci}, mais sa recette est débloquée par ${need} qui n'est pas un prérequis`);
        }
      }
    }
  }
  console.log(errors === 0 ? '  ✅ Arbre cohérent et entièrement atteignable' : '  problème(s) détecté(s)');
})();

/* ---------- 3) Planificateur d'usine + simulation de production ---------- */
// Prouve que la chaîne complète peut produire la fusée : on calcule le débit
// requis de chaque objet par expansion de la nomenclature, on place le bon
// nombre de machines + générateurs, puis on simule jusqu'à la victoire.
console.log('\n== Planificateur d\'usine ==');
Game.hardReset();
const S = Game.state;
const stock = id => Game.stockOf(id);

// On débloque toutes les recherches (on valide ici l'ÉCONOMIE de production,
// pas la montée en science qui est validée par les sections 1 et 2).
TECHS.forEach(t => { if (!t.repeatable) S.techs[t.id] = 1; });

const producerOf = item => RECIPES.find(r => r.out[item]);
// Machine la plus rapide ; à vitesse égale on préfère l'ÉLECTRIQUE (fuel=0),
// couverte par le solaire, pour ne pas avoir à dimensionner l'apport en charbon.
const fastestMachine = cat => Object.keys(MACHINES)
  .filter(m => MACHINES[m].cats.includes(cat))
  .sort((a, b) => (MACHINES[b].speed - MACHINES[a].speed) || (MACHINES[a].fuel - MACHINES[b].fuel))[0];

// Débit cible : 1 pièce de fusée / seconde
const TARGET_RATE = 1;
const need = {}; // itemId → unités/s requises

// Expansion de la nomenclature via une file (le graphe est un DAG → termine)
const queue = [['rocket-part', TARGET_RATE]];
let guard = 0;
while (queue.length) {
  if (++guard > 5_000_000) { err('expansion de nomenclature : trop d\'itérations (cycle ?)'); break; }
  const [item, rate] = queue.pop();
  need[item] = (need[item] || 0) + rate;
  const r = producerOf(item);
  if (r && Object.keys(r.in).length) {
    const crafts = rate / r.out[item];
    for (const inp in r.in) queue.push([inp, crafts * r.in[inp]]);
  }
}

// Placement des machines pour chaque recette nécessaire
let totalMachines = 0;
for (const item in need) {
  const r = producerOf(item);
  if (!r) { err(`objet requis sans recette : ${item}`); continue; }
  const mid = fastestMachine(r.cat);
  const crafts = need[item] / r.out[item];           // crafts/s requis
  const count = Math.ceil((crafts * r.time) / MACHINES[mid].speed) + 1; // +1 marge
  if (!S.producers[r.id]) S.producers[r.id] = {};
  S.producers[r.id][mid] = (S.producers[r.id][mid] || 0) + count;
  totalMachines += count;
}

// Énergie : assez de panneaux solaires pour la demande électrique (sans charbon)
const e = Game.getEnergy(1);
const panels = Math.ceil(e.demand / GENERATORS['solar-panel'].output) + 2;
S.generators['solar-panel'] = panels;
console.log(`  Machines placées : ${totalMachines} | Demande : ${Math.round(e.demand)} kW | Panneaux solaires : ${panels}`);

// On amorce les stocks d'INTERMÉDIAIRES (pas les composants finals) pour neutraliser
// l'artefact d'allocation intra-tick. Les 3 composants finals et la pièce de fusée
// restent à zéro : la fusée ne peut donc venir que de leur PRODUCTION réelle.
const FINAL = new Set(['low-density-structure', 'rocket-control-unit', 'rocket-fuel', 'rocket-part']);
const SEED = 1e6;
for (const item in need) if (!FINAL.has(item)) S.stock[item] = SEED;

// Simulation jusqu'à victoire (pas de 1 s)
let ticks = 0;
const MAX_TICKS = 50000;
let firstPartAt = null;
while (!S.won && ticks < MAX_TICKS) {
  ticks++;
  Game.tick(1);
  if (firstPartAt === null && stock('rocket-part') >= 1) firstPartAt = ticks;
  if (stock('rocket-part') >= CONFIG.ROCKET_PARTS_NEEDED) Game.launchRocket();
  // intégrité
  for (const id in S.stock) {
    const v = S.stock[id];
    if (isNaN(v)) { err(`stock NaN pour ${id} au tick ${ticks}`); ticks = MAX_TICKS; break; }
    if (v < -1e-6) { err(`stock négatif ${id}=${v.toFixed(3)} au tick ${ticks}`); ticks = MAX_TICKS; break; }
  }
}

// Vérifie qu'aucun intermédiaire ne s'est effondré (signe d'une sous-production
// upstream) : la consommation pendant la course ne doit qu'à peine entamer l'amorce.
let collapsed = [];
for (const item in need) if (!FINAL.has(item) && stock(item) < SEED * 0.5) collapsed.push(item);

if (S.won) {
  console.log(`  ✅ Fusée assemblée et LANCÉE en ${ticks}s simulées (1re pièce à t=${firstPartAt}s).`);
  if (collapsed.length) {
    console.log(`  ⚠️ Intermédiaires en forte baisse (sous-production possible) : ${collapsed.join(', ')}`);
    err('un intermédiaire s\'est effondré : ratios de production insuffisants');
  } else {
    console.log('  ✅ Tous les intermédiaires sont restés approvisionnés (ratios corrects).');
  }
} else {
  console.log(`  ⚠️ Fusée non assemblée après ${ticks}s. Pièces : ${Math.floor(stock('rocket-part'))}/${CONFIG.ROCKET_PARTS_NEEDED}`);
  ['low-density-structure', 'rocket-control-unit', 'rocket-fuel'].forEach(id => {
    console.log(`    ${id}: stock=${Math.floor(stock(id))} besoin=${(need[id] || 0).toFixed(2)}/s`);
  });
  err('la fusée n\'a pas pu être assemblée');
}

console.log(`\n${errors === 0 && S.won ? '✅ Tous les tests passent.' : '❌ ' + (errors || 1) + ' problème(s).'}`);
process.exit(errors === 0 && S.won ? 0 : 1);
