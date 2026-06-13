/* =========================================================================
   engine.js — État du jeu + simulation. Indépendant de l'affichage.
   Expose la globale `Game`.
   ========================================================================= */

const Game = (() => {
  const { CONFIG, ITEMS, RECIPES, MACHINES, GENERATORS, TECHS } = GAME_DATA;

  // Index pratiques
  const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]));
  const TECH_BY_ID = Object.fromEntries(TECHS.map(t => [t.id, t]));
  // Recettes triées par ordre de traitement (chaînes de production cohérentes)
  const RECIPES_ORDERED = [...RECIPES].sort((a, b) => a.order - b.order);
  // Catégories bénéficiant du bonus des modules de productivité (les usines de
  // transformation ; pas l'extraction brute ni la science).
  const PROD_CATS = new Set(['smelting', 'crafting', 'chemistry', 'oil-refining', 'centrifuging', 'rocket-building']);

  /* --- État ------------------------------------------------------------- */
  let state = null;

  function freshState() {
    return {
      stock: {},                 // itemId → quantité (float)
      discovered: {},            // itemId → true
      producers: {},             // recipeId → { machineId → count }
      generators: {},            // generatorId → count
      techs: {},                 // techId → niveau (>=1 = acquis)
      clickPower: 1,
      speedMult: 1,
      prodModules: 0,            // modules de productivité installés (bonus global)
      playTime: 0,               // secondes de jeu cumulées
      lastSeen: nowSec(),        // pour la progression hors-ligne
      won: false,
      launched: false,
    };
  }

  // Date.now() est interdit dans certains contextes ; ici on est dans le
  // navigateur donc disponible. On encapsule pour clarté.
  function nowSec() { return Math.floor(Date.now() / 1000); }

  /* --- Helpers de déblocage -------------------------------------------- */
  const isTechDone = id => (state.techs[id] || 0) > 0;

  const recipeUnlocked = r => !r.unlock || isTechDone(r.unlock);
  const machineUnlocked = m => !MACHINES[m].unlock || isTechDone(MACHINES[m].unlock);
  const generatorUnlocked = g => !GENERATORS[g].unlock || isTechDone(GENERATORS[g].unlock);

  function techAvailable(t) {
    if (!t.repeatable && isTechDone(t.id)) return false;
    return t.prereq.every(p => isTechDone(p));
  }

  // Coût d'une recherche (gère le multiplicateur global et les répétables)
  function techCost(t) {
    const lvl = state.techs[t.id] || 0;
    const global = CONFIG.SCIENCE_COST_MULT || 1;
    const rep = t.repeatable ? Math.pow(t.costMult, lvl) : 1;
    const c = {};
    for (const k in t.cost) c[k] = Math.ceil(t.cost[k] * global * rep);
    return c;
  }

  /* --- Stock ------------------------------------------------------------ */
  const stockOf = id => state.stock[id] || 0;

  function addStock(id, amount) {
    state.stock[id] = (state.stock[id] || 0) + amount;
    if (amount > 0 && !state.discovered[id]) state.discovered[id] = true;
  }

  function canAfford(cost) {
    for (const id in cost) if (stockOf(id) < cost[id]) return false;
    return true;
  }
  function pay(cost) {
    for (const id in cost) state.stock[id] -= cost[id];
  }

  /* --- Actions joueur --------------------------------------------------- */
  function manualMine(recipeId) {
    const r = RECIPE_BY_ID[recipeId];
    if (!r || !r.hand || !recipeUnlocked(r)) return;
    // Vérifie/consomme les entrées (les recettes de minage n'en ont pas)
    for (const id in r.in) if (stockOf(id) < r.in[id] * state.clickPower) return;
    for (const id in r.in) state.stock[id] -= r.in[id] * state.clickPower;
    for (const id in r.out) addStock(id, r.out[id] * state.clickPower);
  }

  // Fabrication manuelle : 1 craft par clic
  function handCraft(recipeId) {
    const r = RECIPE_BY_ID[recipeId];
    if (!r || !r.hand || !recipeUnlocked(r)) return;
    for (const id in r.in) if (stockOf(id) < r.in[id]) return;
    for (const id in r.in) state.stock[id] -= r.in[id];
    for (const id in r.out) addStock(id, r.out[id]);
  }

  function buildMachine(recipeId, machineId) {
    const m = MACHINES[machineId];
    const r = RECIPE_BY_ID[recipeId];
    if (!m || !r || !m.cats.includes(r.cat) || !machineUnlocked(machineId)) return false;
    if (!canAfford(m.cost)) return false;
    pay(m.cost);
    if (!state.producers[recipeId]) state.producers[recipeId] = {};
    state.producers[recipeId][machineId] = (state.producers[recipeId][machineId] || 0) + 1;
    return true;
  }

  function removeMachine(recipeId, machineId) {
    const p = state.producers[recipeId];
    if (!p || !p[machineId]) return;
    p[machineId]--;
    if (p[machineId] <= 0) delete p[machineId];
  }

  function buildGenerator(genId) {
    const g = GENERATORS[genId];
    if (!g || !generatorUnlocked(genId) || !canAfford(g.cost)) return false;
    pay(g.cost);
    state.generators[genId] = (state.generators[genId] || 0) + 1;
    return true;
  }
  function removeGenerator(genId) {
    if (state.generators[genId]) {
      state.generators[genId]--;
      if (state.generators[genId] <= 0) delete state.generators[genId];
    }
  }

  function research(techId) {
    const t = TECH_BY_ID[techId];
    if (!t || !techAvailable(t)) return false;
    const cost = techCost(t);
    if (!canAfford(cost)) return false;
    pay(cost);
    state.techs[techId] = (state.techs[techId] || 0) + 1;
    // Application des effets permanents
    if (t.effect) {
      if (t.effect.clickPower) state.clickPower += t.effect.clickPower;
      if (t.effect.speed) state.speedMult += t.effect.speed;
    }
    return true;
  }

  // Installe des modules de productivité (consomme les objets, bonus permanent)
  function installModule(n = 1) {
    let done = 0;
    for (let i = 0; i < n; i++) {
      if (stockOf('productivity-module') >= 1) { state.stock['productivity-module'] -= 1; state.prodModules++; done++; }
      else break;
    }
    return done;
  }

  function launchRocket() {
    if (stockOf('rocket-part') >= CONFIG.ROCKET_PARTS_NEEDED && !state.launched) {
      state.stock['rocket-part'] -= CONFIG.ROCKET_PARTS_NEEDED;
      state.launched = true;
      state.won = true;
      return true;
    }
    return false;
  }

  /* --- Énergie : calcul du bilan (carburants + électricité) ------------- */
  // Modèle : le solaire (gratuit) couvre la demande en premier, puis le nucléaire
  // (uranium), puis la vapeur (charbon). Chaque générateur à carburant ne brûle
  // que pour l'électricité réellement fournie — plus de gaspillage à vide.
  function computeEnergy(dt) {
    // 1) Charbon consommé par les machines à charbon ACTIVES (fours, foreuses)
    let burnerCoal = 0;
    eachProducer((r, machineId, count) => {
      const m = MACHINES[machineId];
      if (m.fuel > 0 && recipeHasInputs(r)) burnerCoal += m.fuel * count;
    });

    // 2) Demande électrique des machines actives
    let demand = 0;
    eachProducer((r, machineId, count) => {
      const m = MACHINES[machineId];
      if (m.power > 0 && recipeHasInputs(r)) demand += m.power * count;
    });

    // 3) Dispatch : solaire → nucléaire → vapeur
    const solarOutput = (state.generators['solar-panel'] || 0) * GENERATORS['solar-panel'].output;
    let remaining = Math.max(0, demand - solarOutput);

    // Nucléaire (carburant : cellules d'uranium)
    const nuke = GENERATORS['nuclear-reactor'];
    const nukeCap = (state.generators['nuclear-reactor'] || 0) * nuke.output;
    const nukeWant = Math.min(nukeCap, remaining);
    const uraniumPerKw = nuke.fuel / nuke.output;
    const uraniumNeed = nukeWant * uraniumPerKw;
    const uraniumRatio = uraniumNeed > 0 ? Math.min(1, stockOf('uranium-fuel-cell') / Math.max(uraniumNeed * dt, 1e-9)) : 1;
    const nuclearOutput = nukeWant * uraniumRatio;
    const uraniumBurn = nuclearOutput * uraniumPerKw;   // cellules/s
    remaining -= nuclearOutput;

    // Vapeur (carburant : charbon, partagé avec les fours)
    const steam = GENERATORS['steam-engine'];
    const steamCap = (state.generators['steam-engine'] || 0) * steam.output;
    const steamWant = Math.min(steamCap, remaining);
    const steamCoalNeed = steamWant * (steam.fuel / steam.output);
    const coalDemand = burnerCoal + steamCoalNeed;
    const coalRatio = coalDemand > 0 ? Math.min(1, stockOf('coal') / Math.max(coalDemand * dt, 1e-9)) : 1;
    const steamOutput = steamWant * coalRatio;
    const coalBurn = coalDemand * coalRatio;            // charbon/s
    const coalShort = coalRatio < 0.999 && coalDemand > 0;

    // 4) Bilan
    const supply = solarOutput + nuclearOutput + steamOutput;
    const capacity = solarOutput + nukeCap + steamCap;  // potentiel max (carburant illimité)
    const powerRatio = demand > 0 ? Math.min(1, supply / demand) : 1;

    return { coalRatio, powerRatio, supply, capacity, demand, coalDemand, coalBurn, uraniumBurn,
             solarOutput, steamOutput, nuclearOutput, steamCap, nukeCap, coalShort };
  }

  // Une recette est « active » si toutes ses entrées sont disponibles (>0)
  function recipeHasInputs(r) {
    for (const id in r.in) if (stockOf(id) <= 0) return false;
    return true;
  }

  function eachProducer(fn) {
    for (const recipeId in state.producers) {
      const r = RECIPE_BY_ID[recipeId];
      if (!r) continue;
      const byMachine = state.producers[recipeId];
      for (const machineId in byMachine) {
        const count = byMachine[machineId];
        if (count > 0) fn(r, machineId, count);
      }
    }
  }

  /* --- Tick de simulation ---------------------------------------------- */
  let flowAccum = {};        // flux NET par objet (production - consommation)
  let recipeAccum = {};      // crafts réellement effectués par recette
  let flowTime = 0;
  let lastRates = {};        // itemId → variation nette du stock /s
  let lastRecipeRates = {};  // recipeId → crafts/s réellement produits

  function tick(dt) {
    state.playTime += dt;
    const energy = computeEnergy(dt);

    // Consommation des carburants : charbon (fours + vapeur) et uranium (nucléaire)
    if (energy.coalBurn > 0) {
      const burned = energy.coalBurn * dt;
      state.stock['coal'] = (state.stock['coal'] || 0) - burned;
      flowAccum['coal'] = (flowAccum['coal'] || 0) - burned;
    }
    if (energy.uraniumBurn > 0) {
      const burned = energy.uraniumBurn * dt;
      state.stock['uranium-fuel-cell'] = (state.stock['uranium-fuel-cell'] || 0) - burned;
      flowAccum['uranium-fuel-cell'] = (flowAccum['uranium-fuel-cell'] || 0) - burned;
      // chaque cellule consommée ressort « usée » (retraitable en U-238)
      addStock('used-uranium-fuel-cell', burned);
      flowAccum['used-uranium-fuel-cell'] = (flowAccum['used-uranium-fuel-cell'] || 0) + burned;
    }

    // Production des machines, dans l'ordre des chaînes
    for (const r of RECIPES_ORDERED) {
      const byMachine = state.producers[r.id];
      if (!byMachine) continue;
      for (const machineId in byMachine) {
        const count = byMachine[machineId];
        if (count <= 0) continue;
        const m = MACHINES[machineId];
        // Facteur de vitesse selon la source d'énergie
        let factor = 1;
        if (m.fuel > 0) factor = energy.coalRatio;
        else if (m.power > 0) factor = energy.powerRatio;
        if (factor <= 0) continue;

        // Crafts réalisables sur ce pas de temps
        let crafts = (count * m.speed * state.speedMult / r.time) * dt * factor;
        if (crafts <= 0) continue;
        // Limité par les entrées disponibles
        for (const id in r.in) {
          const avail = stockOf(id);
          crafts = Math.min(crafts, avail / r.in[id]);
        }
        if (crafts <= 0) continue;

        recipeAccum[r.id] = (recipeAccum[r.id] || 0) + crafts; // production brute réelle
        // Bonus des modules de productivité : sortie supplémentaire gratuite sur
        // les recettes de transformation (entrées inchangées).
        const prodMult = PROD_CATS.has(r.cat) ? (1 + state.prodModules * (CONFIG.MODULE_PRODUCTIVITY || 0)) : 1;
        for (const id in r.in) {
          state.stock[id] -= r.in[id] * crafts;
          flowAccum[id] = (flowAccum[id] || 0) - r.in[id] * crafts;
        }
        for (const id in r.out) {
          const made = r.out[id] * crafts * prodMult;
          addStock(id, made);
          flowAccum[id] = (flowAccum[id] || 0) + made;
        }
      }
    }

    // Calcul des débits affichés (~ par seconde)
    flowTime += dt;
    if (flowTime >= 1) {
      const rates = {};
      for (const id in flowAccum) rates[id] = flowAccum[id] / flowTime;
      lastRates = rates;
      const rRates = {};
      for (const id in recipeAccum) rRates[id] = recipeAccum[id] / flowTime;
      lastRecipeRates = rRates;
      flowAccum = {};
      recipeAccum = {};
      flowTime = 0;
    }
  }

  /* --- Progression hors-ligne ------------------------------------------ */
  function applyOffline() {
    const now = nowSec();
    let elapsed = now - (state.lastSeen || now);
    state.lastSeen = now;
    if (elapsed <= 0) return 0;
    const cap = CONFIG.OFFLINE_CAP_HOURS * 3600;
    const real = elapsed;
    elapsed = Math.min(elapsed, cap);
    // Simulation par pas de 1 s (suffisamment précis, borné en itérations)
    const step = 1;
    let t = elapsed;
    while (t > 0) {
      tick(Math.min(step, t));
      t -= step;
    }
    return real;
  }

  /* --- Sauvegarde ------------------------------------------------------- */
  function save() {
    state.lastSeen = nowSec();
    try {
      localStorage.setItem(CONFIG.SAVE_KEY, JSON.stringify(state));
    } catch (e) { /* quota / mode privé : on ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(freshState(), parsed);
        // Garantit la présence des sous-objets
        state.stock = parsed.stock || {};
        state.producers = parsed.producers || {};
        state.generators = parsed.generators || {};
        state.techs = parsed.techs || {};
        state.discovered = parsed.discovered || {};
        return true;
      }
    } catch (e) { /* sauvegarde corrompue : on repart à zéro */ }
    state = freshState();
    return false;
  }

  function hardReset() {
    try { localStorage.removeItem(CONFIG.SAVE_KEY); } catch (e) {}
    state = freshState();
    initDiscovery();
  }

  // Les matières premières minables sont connues dès le départ
  function initDiscovery() {
    ['iron-ore', 'copper-ore', 'coal', 'stone'].forEach(id => { state.discovered[id] = true; });
  }

  function init() {
    const loaded = load();
    if (!loaded) initDiscovery();
    else if (Object.keys(state.discovered).length === 0) initDiscovery();
    const offline = applyOffline();
    return offline;
  }

  /* --- API publique ----------------------------------------------------- */
  return {
    CONFIG, ITEMS, RECIPES, MACHINES, GENERATORS, TECHS,
    RECIPE_BY_ID, TECH_BY_ID,
    init, tick, save, hardReset,
    // accès état
    get state() { return state; },
    stockOf, canAfford,
    isTechDone, recipeUnlocked, machineUnlocked, generatorUnlocked,
    techAvailable, techCost, recipeHasInputs,
    getRates: () => lastRates,
    getRecipeRates: () => lastRecipeRates,
    getEnergy: (dt) => computeEnergy(dt),
    // actions
    manualMine, handCraft, buildMachine, removeMachine,
    buildGenerator, removeGenerator, research, launchRocket, installModule,
  };
})();
