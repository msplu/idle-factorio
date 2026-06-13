/* =========================================================================
   ui.js — Rendu de l'interface et interactions. Utilise `Game` et GAME_DATA.
   Stratégie : on régénère le HTML des panneaux à intervalle régulier et on
   utilise la délégation d'événements (un seul listener par conteneur) pour
   que les boutons restent réactifs malgré les re-rendus.
   ========================================================================= */

(() => {
  const { ITEMS, MACHINES, GENERATORS, SECTIONS, RECIPES, TECHS, CONFIG } = GAME_DATA;

  /* --- Formatage des nombres ------------------------------------------- */
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    const a = Math.abs(n);
    if (a < 1000) return String(Math.floor(n));
    const units = ['', 'k', 'M', 'G', 'T', 'P'];
    let i = 0; let v = n;
    while (Math.abs(v) >= 1000 && i < units.length - 1) { v /= 1000; i++; }
    return v.toFixed(2).replace(/\.?0+$/, '') + units[i];
  }
  function fmtRate(n) {
    if (Math.abs(n) < 0.05) return '';
    const s = n > 0 ? '+' : '-';
    const a = Math.abs(n);
    return `${s}${a < 100 ? a.toFixed(1) : fmt(a)}/s`;
  }
  function fmtCost(cost) {
    return Object.entries(cost)
      .map(([id, q]) => `<span class="cost-item ${Game.stockOf(id) >= q ? 'ok' : 'no'}">${ITEMS[id] ? ITEMS[id].icon : ''} ${fmt(q)}</span>`)
      .join(' ');
  }
  function fmtFlow(io) {
    return Object.entries(io).map(([id, q]) => `${ITEMS[id].icon}${q}`).join(' ');
  }

  /* --- Éléments du DOM -------------------------------------------------- */
  const el = {
    resources: document.getElementById('resources'),
    mining: document.getElementById('mining'),
    production: document.getElementById('production'),
    research: document.getElementById('research'),
    energy: document.getElementById('energy'),
    rocket: document.getElementById('rocket'),
    powerbar: document.getElementById('powerbar'),
    rocketbar: document.getElementById('rocketbar'),
    playtime: document.getElementById('playtime'),
    savestate: document.getElementById('savestate'),
    victory: document.getElementById('victory'),
    victoryStats: document.getElementById('victory-stats'),
  };

  // N'écrit le DOM que si le HTML a réellement changé. Évite de détruire/recréer
  // en boucle des éléments stables (bordure qui clignote, clics perdus si la
  // réécriture tombe entre l'appui et le relâchement de la souris).
  function setHTML(node, html) {
    if (node._html === html) return;
    node._html = html;
    node.innerHTML = html;
  }

  /* --- Panneau RESSOURCES ---------------------------------------------- */
  function renderResources() {
    const rates = Game.getRates();
    const ids = Object.keys(ITEMS).filter(id => Game.state.discovered[id]);
    let html = '';
    for (const id of ids) {
      const it = ITEMS[id];
      const amt = Game.stockOf(id);
      const rate = rates[id] || 0;
      const cls = rate > 0.05 ? 'pos' : rate < -0.05 ? 'neg' : '';
      html += `<div class="res-row">
        <span class="res-icon">${it.icon}</span>
        <span class="res-name">${it.name}</span>
        <span class="res-amt">${fmt(amt)}</span>
        <span class="res-rate ${cls}">${fmtRate(rate)}</span>
      </div>`;
    }
    setHTML(el.resources, html);
  }

  /* --- Panneau MINAGE MANUEL ------------------------------------------- */
  function renderMining() {
    const mineRecipes = RECIPES.filter(r => r.cat === 'mining' && Game.recipeUnlocked(r));
    let html = '<div class="hint">Clique pour récolter à la main</div><div class="mine-grid">';
    for (const r of mineRecipes) {
      const outId = Object.keys(r.out)[0];
      html += `<button class="mine-btn" data-action="mine" data-id="${r.id}">
        <span class="mine-icon">${ITEMS[outId].icon}</span>
        <span class="mine-label">${ITEMS[outId].name}</span>
        <span class="mine-plus">+${Game.state.clickPower}</span>
      </button>`;
    }
    html += '</div>';
    setHTML(el.mining, html);
  }

  /* --- Panneau PRODUCTION (recettes automatisables) -------------------- */
  function machinesForCat(cat) {
    return Object.keys(MACHINES).filter(mid => MACHINES[mid].cats.includes(cat) && Game.machineUnlocked(mid));
  }

  function renderProduction() {
    let html = '';
    for (const section of SECTIONS) {
      const recipes = RECIPES.filter(r => section.cats.includes(r.cat) && Game.recipeUnlocked(r) && r.cat !== 'mining');
      // On affiche aussi le minage automatique dans Extraction
      const mineAuto = section.id === 'extraction'
        ? RECIPES.filter(r => r.cat === 'mining' && Game.recipeUnlocked(r))
        : [];
      const all = [...mineAuto, ...recipes];
      if (all.length === 0) continue;

      html += `<div class="section"><h3>${section.name}</h3>`;
      for (const r of all) {
        html += renderRecipeRow(r);
      }
      html += '</div>';
    }
    setHTML(el.production, html);
  }

  function renderRecipeRow(r) {
    const rates = Game.getRates();
    const machines = machinesForCat(r.cat);
    const producers = Game.state.producers[r.id] || {};
    const totalMachines = Object.values(producers).reduce((a, b) => a + b, 0);

    // Résumé des entrées → sorties
    const inStr = Object.keys(r.in).length ? fmtFlow(r.in) + ' → ' : '';
    const outStr = fmtFlow(r.out);
    const mainOut = Object.keys(r.out)[0];
    const rate = rates[mainOut] || 0;

    let owned = '';
    for (const mid in producers) {
      owned += `<span class="owned-machine">${MACHINES[mid].icon}${producers[mid]}</span>`;
    }

    let buttons = '';
    for (const mid of machines) {
      const m = MACHINES[mid];
      const afford = Game.canAfford(m.cost);
      buttons += `<button class="build-btn ${afford ? '' : 'disabled'}" data-action="build" data-recipe="${r.id}" data-machine="${mid}" title="${m.name} — ${costTitle(m.cost)}">
        + ${m.icon} <span class="build-cost">${fmtCost(m.cost)}</span>
      </button>`;
    }
    let removeBtns = '';
    for (const mid in producers) {
      removeBtns += `<button class="rm-btn" data-action="remove" data-recipe="${r.id}" data-machine="${mid}" title="Retirer un(e) ${MACHINES[mid].name}">−${MACHINES[mid].icon}</button>`;
    }

    // Pas de bouton « à la main » pour le minage (le panneau de gauche s'en charge)
    const handBtn = (r.hand && r.cat !== 'mining')
      ? `<button class="hand-btn ${Game.canAfford(r.in) ? '' : 'disabled'}" data-action="hand" data-id="${r.id}" title="Fabriquer 1 à la main">✋</button>`
      : '';

    const rateCls = rate > 0.05 ? 'pos' : '';
    return `<div class="recipe">
      <div class="recipe-head">
        <span class="recipe-name">${ITEMS[mainOut].icon} ${r.name}</span>
        <span class="recipe-rate ${rateCls}">${rate > 0.05 ? fmtRate(rate) : ''}</span>
      </div>
      <div class="recipe-flow">${inStr}${outStr} <span class="recipe-time">(${r.time}s)</span></div>
      <div class="recipe-actions">
        ${handBtn}
        ${buttons}
        ${owned ? `<span class="owned">${owned}</span>` : ''}
        ${removeBtns}
      </div>
    </div>`;
  }

  function costTitle(cost) {
    return Object.entries(cost).map(([id, q]) => `${q} ${ITEMS[id] ? ITEMS[id].name : id}`).join(', ');
  }

  /* --- Panneau ÉNERGIE -------------------------------------------------- */
  function renderEnergy() {
    const e = Game.getEnergy(1);
    const gens = Object.keys(GENERATORS).filter(g => Game.generatorUnlocked(g));
    if (gens.length === 0 && e.demand === 0) { setHTML(el.energy, '<div class="hint">Recherche « Énergie vapeur » pour produire de l\'électricité.</div>'); return; }

    const pct = e.demand > 0 ? Math.min(100, (e.supply / e.demand) * 100) : 100;
    el.powerbar.style.width = pct + '%';
    el.powerbar.className = 'bar-fill ' + (pct >= 99.5 ? 'good' : pct >= 50 ? 'warn' : 'bad');

    let html = `<div class="energy-summary">
      <span>⚡ Production : <b>${fmt(e.supply)} kW</b></span>
      <span>🔌 Consommation : <b>${fmt(e.demand)} kW</b></span>
      ${e.demand > e.supply ? '<span class="bad">Surcharge ! Les machines ralentissent.</span>' : ''}
    </div>`;

    for (const g of gens) {
      const gen = GENERATORS[g];
      const count = Game.state.generators[g] || 0;
      const afford = Game.canAfford(gen.cost);
      const fuelInfo = gen.fuel > 0 ? ` — ⚫${gen.fuel}/s` : ' — gratuit';
      html += `<div class="recipe">
        <div class="recipe-head">
          <span class="recipe-name">${gen.icon} ${gen.name} <span class="owned-machine">×${count}</span></span>
          <span class="recipe-rate pos">${fmt(count * gen.output)} kW</span>
        </div>
        <div class="recipe-flow">+${gen.output} kW${fuelInfo}</div>
        <div class="recipe-actions">
          <button class="build-btn ${afford ? '' : 'disabled'}" data-action="build-gen" data-gen="${g}" title="${costTitle(gen.cost)}">+ <span class="build-cost">${fmtCost(gen.cost)}</span></button>
          ${count > 0 ? `<button class="rm-btn" data-action="remove-gen" data-gen="${g}">−</button>` : ''}
        </div>
      </div>`;
    }
    setHTML(el.energy, html);
  }

  /* --- Panneau RECHERCHE ----------------------------------------------- */
  function renderResearch() {
    const available = TECHS.filter(t => Game.techAvailable(t));
    const done = TECHS.filter(t => !t.repeatable && Game.isTechDone(t.id));

    let html = '';
    if (available.length === 0) html += '<div class="hint">Aucune recherche disponible pour le moment.</div>';
    for (const t of available) {
      const cost = Game.techCost(t);
      const afford = Game.canAfford(cost);
      const lvl = Game.state.techs[t.id] || 0;
      const lvlTag = t.repeatable ? ` <span class="tech-lvl">Niv. ${lvl}</span>` : '';
      html += `<div class="tech ${afford ? 'afford' : ''}">
        <div class="tech-head"><b>${t.name}</b>${lvlTag}</div>
        <div class="tech-desc">${t.desc}</div>
        <div class="tech-actions">
          <button class="research-btn ${afford ? '' : 'disabled'}" data-action="research" data-id="${t.id}">
            Rechercher <span class="build-cost">${fmtCost(cost)}</span>
          </button>
        </div>
      </div>`;
    }
    if (done.length) {
      html += `<details class="done-techs"><summary>✅ Recherches terminées (${done.length})</summary><div class="done-list">`;
      html += done.map(t => `<span class="done-tag" title="${t.desc}">${t.name}</span>`).join('');
      html += '</div></details>';
    }
    setHTML(el.research, html);
  }

  /* --- Panneau FUSÉE ---------------------------------------------------- */
  function renderRocket() {
    if (!Game.isTechDone('rocket-silo') && (Game.state.generators['rocket-silo'] === undefined)) {
      const need = CONFIG.ROCKET_PARTS_NEEDED;
      setHTML(el.rocket, `<div class="hint">Objectif final : construire un <b>Silo à fusée</b> puis assembler <b>${need} pièces de fusée</b> 🚀.<br>Recherche « Silo à fusée » pour débloquer.</div>`);
      el.rocketbar.style.width = '0%';
      return;
    }
    const parts = Game.stockOf('rocket-part');
    const need = CONFIG.ROCKET_PARTS_NEEDED;
    const pct = Math.min(100, (parts / need) * 100);
    el.rocketbar.style.width = pct + '%';
    const ready = parts >= need;
    setHTML(el.rocket, `
      <div class="rocket-count">${ITEMS['rocket-part'].icon} ${fmt(Math.floor(parts))} / ${need} pièces</div>
      <button class="launch-btn ${ready && !Game.state.launched ? '' : 'disabled'}" data-action="launch">
        ${Game.state.launched ? '✅ Fusée lancée !' : ready ? '🚀 LANCER LA FUSÉE' : '🚀 Assemble les pièces…'}
      </button>`);
  }

  /* --- Barre du haut ---------------------------------------------------- */
  function renderTopbar() {
    const t = Math.floor(Game.state.playTime);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    el.playtime.textContent = `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  }

  /* --- Délégation d'événements --------------------------------- */
  // On agit dès `pointerdown` (à l'appui) plutôt qu'au `click` complet : ainsi
  // l'action est prise en compte même si un re-rendu remplace le bouton avant le
  // relâchement de la souris. On limite au bouton principal (gauche / tactile).
  function handleClick(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const btn = e.target.closest('button');
    if (!btn) return;
    const a = btn.dataset.action;
    if (!a) return;
    e.preventDefault();
    switch (a) {
      case 'mine': Game.manualMine(btn.dataset.id); break;
      case 'hand': Game.handCraft(btn.dataset.id); break;
      case 'build': Game.buildMachine(btn.dataset.recipe, btn.dataset.machine); break;
      case 'remove': Game.removeMachine(btn.dataset.recipe, btn.dataset.machine); break;
      case 'build-gen': Game.buildGenerator(btn.dataset.gen); break;
      case 'remove-gen': Game.removeGenerator(btn.dataset.gen); break;
      case 'research': Game.research(btn.dataset.id); break;
      case 'launch':
        if (Game.launchRocket()) showVictory();
        break;
    }
    renderAll(); // retour visuel immédiat
  }

  document.body.addEventListener('pointerdown', handleClick);

  /* --- Victoire --------------------------------------------------------- */
  function showVictory() {
    const t = Math.floor(Game.state.playTime);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
    el.victoryStats.innerHTML = `Temps de jeu : <b>${h}h ${m}m</b><br>
      Machines construites : <b>${countMachines()}</b><br>
      Recherches terminées : <b>${Object.keys(Game.state.techs).length}</b>`;
    el.victory.classList.add('show');
  }
  function countMachines() {
    let n = 0;
    for (const r in Game.state.producers) for (const mid in Game.state.producers[r]) n += Game.state.producers[r][mid];
    for (const g in Game.state.generators) n += Game.state.generators[g];
    return n;
  }
  document.getElementById('victory-close').addEventListener('click', () => el.victory.classList.remove('show'));

  /* --- Rendu complet ---------------------------------------------------- */
  // On mémorise une « signature » de déblocage pour éviter de tout reconstruire
  // inutilement (les compteurs, eux, sont mis à jour à chaque frame).
  function renderAll() {
    renderResources();
    renderMining();
    renderProduction();
    renderEnergy();
    renderResearch();
    renderRocket();
    renderTopbar();
    if (Game.state.won && !el.victory.classList.contains('show') && !victoryShownOnce) {
      victoryShownOnce = true;
      showVictory();
    }
  }
  let victoryShownOnce = false;

  /* --- Boucles ---------------------------------------------------------- */
  let lastTick = Date.now();
  function gameLoop() {
    const now = Date.now();
    const dt = Math.min(0.5, (now - lastTick) / 1000); // borne anti-saut
    lastTick = now;
    Game.tick(dt);
  }

  function start() {
    const offline = Game.init();
    renderAll();
    if (offline > 5) flashSave(`Bon retour ! ${formatDuration(offline)} de production hors-ligne.`, 6000);

    setInterval(gameLoop, CONFIG.TICK_MS);
    setInterval(renderAll, CONFIG.UI_MS);
    setInterval(() => { Game.save(); flashSave('💾 Sauvegardé'); }, CONFIG.SAVE_MS);
    window.addEventListener('beforeunload', () => Game.save());

    // Bouton reset
    document.getElementById('reset-btn').addEventListener('click', () => {
      if (confirm('Réinitialiser toute la partie ? Cette action est irréversible.')) {
        Game.hardReset();
        victoryShownOnce = false;
        renderAll();
      }
    });
  }

  function formatDuration(sec) {
    const capped = Math.min(sec, CONFIG.OFFLINE_CAP_HOURS * 3600);
    const h = Math.floor(capped / 3600), m = Math.floor((capped % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    return `${Math.floor(capped)}s`;
  }

  let saveTimer = null;
  function flashSave(msg, dur = 1500) {
    el.savestate.textContent = msg;
    el.savestate.classList.add('show');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => el.savestate.classList.remove('show'), dur);
  }

  // Démarrage une fois le DOM prêt
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
