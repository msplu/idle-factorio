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
    modules: document.getElementById('modules'),
    modulesPanel: document.getElementById('modules-panel'),
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
    const mineRecipes = RECIPES.filter(r => r.cat === 'mining' && r.hand && Game.recipeUnlocked(r));
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
    const machines = machinesForCat(r.cat);
    const producers = Game.state.producers[r.id] || {};
    const totalMachines = Object.values(producers).reduce((a, b) => a + b, 0);

    // Résumé des entrées → sorties
    const inStr = Object.keys(r.in).length ? fmtFlow(r.in) + ' → ' : '';
    const outStr = fmtFlow(r.out);
    const mainOut = Object.keys(r.out)[0];

    // Débit = production RÉELLE de la recette (et non le flux net du stock, qui
    // peut être ~0 si tout est consommé immédiatement). Si la recette a des
    // machines mais ne produit rien, on indique ce qui la bloque.
    const recipeRate = (Game.getRecipeRates()[r.id] || 0) * r.out[mainOut];
    let rateHtml = '';
    if (recipeRate > 0.05) {
      rateHtml = `<span class="recipe-rate pos">${fmtRate(recipeRate)}</span>`;
    } else if (totalMachines > 0) {
      const missing = Object.keys(r.in).filter(id => Game.stockOf(id) <= 1e-4);
      rateHtml = missing.length
        ? `<span class="recipe-rate warn" title="En attente : ${missing.map(id => ITEMS[id].name).join(', ')}">⏳ ${missing.map(id => ITEMS[id].icon).join('')}</span>`
        : `<span class="recipe-rate warn" title="Énergie insuffisante">⏳ ⚡</span>`;
    }

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

    return `<div class="recipe">
      <div class="recipe-head">
        <span class="recipe-name">${ITEMS[mainOut].icon} ${r.name}</span>
        ${rateHtml}
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

    // La barre compare la CAPACITÉ (potentiel max) à la demande : verte si l'on
    // peut tout alimenter, rouge si la capacité installée est insuffisante.
    const pct = e.demand > 0 ? Math.min(100, (e.capacity / e.demand) * 100) : 100;
    el.powerbar.style.width = pct + '%';
    el.powerbar.className = 'bar-fill ' + (pct >= 99.5 ? 'good' : pct >= 50 ? 'warn' : 'bad');

    const overload = e.demand > e.capacity + 1e-6;
    let html = `<div class="energy-summary">
      <span>⚡ Capacité : <b>${fmt(e.capacity)} kW</b></span>
      <span>🔌 Consommation : <b>${fmt(e.demand)} kW</b></span>
      ${overload ? '<span class="bad">⚠️ Surcharge : ajoute des générateurs.</span>' : ''}
      ${e.coalShort ? '<span class="bad">⚠️ Manque de charbon : mine-en à la main pour relancer !</span>' : ''}
    </div>`;

    for (const g of gens) {
      const gen = GENERATORS[g];
      const count = Game.state.generators[g] || 0;
      const afford = Game.canAfford(gen.cost);
      const fuelIcon = gen.fuelItem && ITEMS[gen.fuelItem] ? ITEMS[gen.fuelItem].icon : '⚫';
      const fuelInfo = gen.fuel > 0 ? ` — ${fuelIcon}${gen.fuel}/s` : ' — gratuit';
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

    // Détail de consommation, agrégé par type de machine (machines actives)
    const elec = {}, coal = {};
    for (const recipeId in Game.state.producers) {
      const r = Game.RECIPE_BY_ID[recipeId];
      if (!r) continue;
      const active = Game.recipeHasInputs(r);
      const byM = Game.state.producers[recipeId];
      for (const mid in byM) {
        const c = byM[mid]; if (c <= 0) continue;
        const m = MACHINES[mid];
        if (m.power > 0) { (elec[mid] = elec[mid] || { c: 0, v: 0 }).c += c; if (active) elec[mid].v += m.power * c; }
        if (m.fuel > 0) { (coal[mid] = coal[mid] || { c: 0, v: 0 }).c += c; if (active) coal[mid].v += m.fuel * c; }
      }
    }
    // La vapeur ne brûle du charbon que pour l'électricité réellement fournie
    const steamCoal = e.steamOutput * (GENERATORS['steam-engine'].fuel / GENERATORS['steam-engine'].output);

    const elecLines = Object.entries(elec).filter(([, d]) => d.v > 0.05).sort((a, b) => b[1].v - a[1].v);
    if (elecLines.length) {
      html += `<div class="energy-detail"><div class="detail-title">⚡ Détail consommation électrique</div>`;
      for (const [mid, d] of elecLines) {
        html += `<div class="energy-line"><span>${MACHINES[mid].icon} ${MACHINES[mid].name} <span class="dim">×${d.c}</span></span><b>${fmt(d.v)} kW</b></div>`;
      }
      html += `<div class="energy-line total"><span>Total</span><b>${fmt(e.demand)} kW</b></div></div>`;
    }

    const coalLines = Object.entries(coal).filter(([, d]) => d.v > 0.001).sort((a, b) => b[1].v - a[1].v);
    if (coalLines.length || steamCoal > 0.001) {
      html += `<div class="energy-detail"><div class="detail-title">⚫ Détail consommation charbon</div>`;
      for (const [mid, d] of coalLines) {
        html += `<div class="energy-line"><span>${MACHINES[mid].icon} ${MACHINES[mid].name} <span class="dim">×${d.c}</span></span><b>${d.v.toFixed(1)}/s</b></div>`;
      }
      if (steamCoal > 0.001) html += `<div class="energy-line"><span>♨️ Machine à vapeur <span class="dim">(électricité)</span></span><b>${steamCoal.toFixed(1)}/s</b></div>`;
      html += `<div class="energy-line total"><span>Total</span><b>${e.coalDemand.toFixed(1)}/s</b></div></div>`;
    }

    if (e.uraniumBurn > 0.0001) {
      html += `<div class="energy-detail"><div class="detail-title">☢️ Combustible nucléaire</div>
        <div class="energy-line"><span>☢️ Réacteur nucléaire</span><b>${ITEMS['uranium-fuel-cell'].icon} ${e.uraniumBurn.toFixed(3)}/s</b></div></div>`;
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

  /* --- Panneau MODULES -------------------------------------------------- */
  function renderModules() {
    if (!Game.isTechDone('modules')) { el.modulesPanel.style.display = 'none'; return; }
    el.modulesPanel.style.display = '';
    const installed = Game.state.prodModules || 0;
    const bonus = (installed * (CONFIG.MODULE_PRODUCTIVITY || 0) * 100);
    const have = Math.floor(Game.stockOf('productivity-module'));
    const can1 = have >= 1, can10 = have >= 10;
    setHTML(el.modules, `
      <div class="hint">Chaque module installé augmente la production de <b>toutes les usines</b> (fonderie, fabrication, chimie, nucléaire, fusée).</div>
      <div class="module-stat">Installés : <b>${fmt(installed)}</b> &nbsp;→&nbsp; bonus <b class="pos">+${bonus.toFixed(0)} %</b></div>
      <div class="module-stat">En stock : ${ITEMS['productivity-module'].icon} <b>${fmt(have)}</b></div>
      <div class="recipe-actions">
        <button class="build-btn ${can1 ? '' : 'disabled'}" data-action="install-module" data-n="1">Installer 1</button>
        <button class="build-btn ${can10 ? '' : 'disabled'}" data-action="install-module" data-n="10">Installer 10</button>
      </div>`);
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
      case 'install-module': Game.installModule(parseInt(btn.dataset.n, 10) || 1); break;
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
    renderModules();
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
