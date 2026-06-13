/* =========================================================================
   data.js — Définition de tout le contenu du jeu (objets, recettes,
   machines, recherches). Aucune logique ici : uniquement des données.
   Chargé en <script> classique → expose la globale GAME_DATA.
   ========================================================================= */

const GAME_DATA = (() => {

  /* --- Réglages globaux ------------------------------------------------- */
  const CONFIG = {
    TICK_MS: 100,            // pas de simulation (10 ticks/s)
    UI_MS: 200,              // rafraîchissement de l'interface
    SAVE_MS: 15000,          // sauvegarde automatique
    OFFLINE_CAP_HOURS: 8,    // progression hors-ligne plafonnée
    ROCKET_PARTS_NEEDED: 100,// pièces de fusée pour gagner
    STEAM_OUTPUT: 900,       // kW par machine à vapeur
    SOLAR_OUTPUT: 60,        // kW par panneau solaire
    SAVE_KEY: 'idle-factorio-save-v1',
  };

  /* --- Objets (items) --------------------------------------------------- */
  // id : { name, icon }
  const ITEMS = {
    // Matières premières
    'iron-ore':        { name: 'Minerai de fer',       icon: '🟤' },
    'copper-ore':      { name: 'Minerai de cuivre',    icon: '🟠' },
    'coal':            { name: 'Charbon',              icon: '⚫' },
    'stone':           { name: 'Pierre',               icon: '🪨' },
    'water':           { name: 'Eau',                  icon: '💧' },
    'crude-oil':       { name: 'Pétrole brut',         icon: '🛢️' },
    // Fonderie
    'iron-plate':      { name: 'Plaque de fer',        icon: '⬜' },
    'copper-plate':    { name: 'Plaque de cuivre',     icon: '🟧' },
    'steel-plate':     { name: "Plaque d'acier",       icon: '🔲' },
    'stone-brick':     { name: 'Brique',               icon: '🧱' },
    // Fabrication
    'iron-gear':       { name: 'Engrenage',            icon: '⚙️' },
    'copper-cable':    { name: 'Fil de cuivre',        icon: '🧵' },
    'electronic-circuit': { name: 'Circuit électronique', icon: '🟩' },
    'advanced-circuit':   { name: 'Circuit avancé',    icon: '🟥' },
    'processing-unit': { name: 'Processeur',           icon: '🟦' },
    'pipe':            { name: 'Tuyau',                icon: '🪈' },
    'inserter':        { name: 'Bras articulé',        icon: '🦾' },
    'transport-belt':  { name: 'Convoyeur',            icon: '🟫' },
    'engine-unit':     { name: 'Moteur',               icon: '🔧' },
    'electric-engine-unit': { name: 'Moteur électrique', icon: '🔌' },
    'battery':         { name: 'Batterie',             icon: '🔋' },
    // Pétrochimie
    'petroleum-gas':   { name: 'Gaz de pétrole',       icon: '🟪' },
    'plastic-bar':     { name: 'Plastique',            icon: '⬛' },
    'sulfur':          { name: 'Soufre',               icon: '🟡' },
    'sulfuric-acid':   { name: 'Acide sulfurique',     icon: '🧪' },
    'solid-fuel':      { name: 'Combustible solide',   icon: '🟤' },
    // Composants de fusée
    'low-density-structure': { name: 'Structure légère', icon: '🛸' },
    'rocket-control-unit':   { name: 'Unité de contrôle', icon: '🛰️' },
    'rocket-fuel':     { name: 'Carburant de fusée',   icon: '⛽' },
    'rocket-part':     { name: 'Pièce de fusée',       icon: '🚀' },
    // Sciences
    'automation-science': { name: 'Science : automatisation', icon: '🔴' },
    'logistic-science':   { name: 'Science : logistique',     icon: '🟢' },
    'chemical-science':   { name: 'Science : chimie',         icon: '🔵' },
    'utility-science':    { name: 'Science : utilitaire',     icon: '🟨' },
  };

  /* --- Catégories → section d'affichage --------------------------------- */
  const SECTIONS = [
    { id: 'extraction', name: '⛏️ Extraction',   cats: ['mining', 'oil-extraction', 'water'] },
    { id: 'smelting',   name: '🔥 Fonderie',      cats: ['smelting'] },
    { id: 'chem',       name: '🧪 Pétrochimie',   cats: ['oil-refining', 'chemistry'] },
    { id: 'crafting',   name: '🛠️ Fabrication',   cats: ['crafting'] },
    { id: 'science',    name: '🔬 Science',       cats: ['science'] },
    { id: 'rocket',     name: '🚀 Fusée',         cats: ['rocket-building'] },
  ];

  /* --- Recettes --------------------------------------------------------- */
  // cat → quelle machine peut la produire ; order → ordre de traitement par tick
  // hand → fabricable à la main (clic) ; unlock → id de recherche requise (ou null)
  const RECIPES = [
    // Extraction (order 0)
    { id: 'mine-iron-ore',   name: 'Miner du fer',     cat: 'mining', order: 0, time: 1, hand: true, in: {}, out: { 'iron-ore': 1 } },
    { id: 'mine-copper-ore', name: 'Miner du cuivre',  cat: 'mining', order: 0, time: 1, hand: true, in: {}, out: { 'copper-ore': 1 } },
    { id: 'mine-coal',       name: 'Miner du charbon', cat: 'mining', order: 0, time: 1, hand: true, in: {}, out: { 'coal': 1 } },
    { id: 'mine-stone',      name: 'Miner de la pierre',cat: 'mining', order: 0, time: 1, hand: true, in: {}, out: { 'stone': 1 } },
    { id: 'pump-water',      name: "Pomper de l'eau",  cat: 'water', order: 0, time: 1, hand: false, unlock: 'oil-processing', in: {}, out: { 'water': 10 } },
    { id: 'extract-crude-oil', name: 'Extraire du pétrole', cat: 'oil-extraction', order: 0, time: 1, hand: false, unlock: 'oil-processing', in: {}, out: { 'crude-oil': 2 } },

    // Raffinage (order 1)
    { id: 'refine-petroleum', name: 'Raffiner le pétrole', cat: 'oil-refining', order: 1, time: 5, hand: false, unlock: 'oil-processing', in: { 'crude-oil': 5 }, out: { 'petroleum-gas': 6 } },

    // Fonderie (order 2)
    { id: 'smelt-iron-plate',  name: 'Fondre le fer',    cat: 'smelting', order: 2, time: 3.2, hand: false, in: { 'iron-ore': 1 }, out: { 'iron-plate': 1 } },
    { id: 'smelt-copper-plate',name: 'Fondre le cuivre', cat: 'smelting', order: 2, time: 3.2, hand: false, in: { 'copper-ore': 1 }, out: { 'copper-plate': 1 } },
    { id: 'smelt-stone-brick', name: 'Cuire des briques',cat: 'smelting', order: 2, time: 3.2, hand: false, in: { 'stone': 2 }, out: { 'stone-brick': 1 } },
    { id: 'smelt-steel-plate', name: "Fondre l'acier",   cat: 'smelting', order: 2, time: 16, hand: false, unlock: 'advanced-material-processing', in: { 'iron-plate': 5 }, out: { 'steel-plate': 1 } },

    // Chimie (order 3)
    { id: 'chem-plastic',       name: 'Produire du plastique', cat: 'chemistry', order: 3, time: 1, hand: false, unlock: 'plastics',         in: { 'petroleum-gas': 3, 'coal': 1 }, out: { 'plastic-bar': 2 } },
    { id: 'chem-sulfur',        name: 'Produire du soufre',    cat: 'chemistry', order: 3, time: 1, hand: false, unlock: 'sulfur-processing', in: { 'petroleum-gas': 3, 'water': 3 }, out: { 'sulfur': 2 } },
    { id: 'chem-sulfuric-acid', name: "Produire de l'acide",   cat: 'chemistry', order: 3, time: 1, hand: false, unlock: 'sulfur-processing', in: { 'sulfur': 1, 'iron-plate': 1, 'water': 2 }, out: { 'sulfuric-acid': 5 } },
    { id: 'chem-solid-fuel',    name: 'Combustible solide',    cat: 'chemistry', order: 3, time: 2, hand: false, unlock: 'flammables',       in: { 'petroleum-gas': 2 }, out: { 'solid-fuel': 1 } },
    { id: 'chem-battery',       name: 'Fabriquer une batterie',cat: 'chemistry', order: 3, time: 4, hand: false, unlock: 'batteries',        in: { 'sulfuric-acid': 2, 'iron-plate': 1, 'copper-plate': 1 }, out: { 'battery': 1 } },

    // Fabrication de base (order 4)
    { id: 'craft-iron-gear',         name: 'Engrenage',       cat: 'crafting', order: 4, time: 0.5, hand: true, in: { 'iron-plate': 2 }, out: { 'iron-gear': 1 } },
    { id: 'craft-copper-cable',      name: 'Fil de cuivre',   cat: 'crafting', order: 4, time: 0.5, hand: true, in: { 'copper-plate': 1 }, out: { 'copper-cable': 2 } },
    { id: 'craft-pipe',              name: 'Tuyau',           cat: 'crafting', order: 4, time: 0.5, hand: true, in: { 'iron-plate': 1 }, out: { 'pipe': 1 } },
    { id: 'craft-electronic-circuit',name: 'Circuit électronique', cat: 'crafting', order: 4, time: 0.5, hand: true, in: { 'iron-plate': 1, 'copper-cable': 3 }, out: { 'electronic-circuit': 1 } },

    // Fabrication intermédiaire (order 5)
    { id: 'craft-inserter',       name: 'Bras articulé',  cat: 'crafting', order: 5, time: 0.5, hand: true, unlock: 'logistics',            in: { 'iron-plate': 1, 'iron-gear': 1, 'electronic-circuit': 1 }, out: { 'inserter': 1 } },
    { id: 'craft-transport-belt', name: 'Convoyeur',      cat: 'crafting', order: 5, time: 0.5, hand: true, unlock: 'logistics',            in: { 'iron-plate': 1, 'iron-gear': 1 }, out: { 'transport-belt': 2 } },
    { id: 'craft-advanced-circuit',name: 'Circuit avancé',cat: 'crafting', order: 5, time: 6,   hand: true, unlock: 'advanced-electronics', in: { 'plastic-bar': 2, 'copper-cable': 4, 'electronic-circuit': 2 }, out: { 'advanced-circuit': 1 } },
    { id: 'craft-engine-unit',    name: 'Moteur',         cat: 'crafting', order: 5, time: 10,  hand: true, unlock: 'engine',               in: { 'steel-plate': 1, 'iron-gear': 1, 'pipe': 2 }, out: { 'engine-unit': 1 } },

    // Fabrication avancée (order 6)
    { id: 'craft-processing-unit',      name: 'Processeur',         cat: 'crafting', order: 6, time: 10, hand: true, unlock: 'advanced-electronics-2', in: { 'electronic-circuit': 20, 'advanced-circuit': 2, 'sulfuric-acid': 5 }, out: { 'processing-unit': 1 } },
    { id: 'craft-electric-engine-unit', name: 'Moteur électrique',  cat: 'crafting', order: 6, time: 10, hand: true, unlock: 'electric-engine',        in: { 'engine-unit': 1, 'electronic-circuit': 2 }, out: { 'electric-engine-unit': 1 } },
    { id: 'craft-low-density-structure',name: 'Structure légère',   cat: 'crafting', order: 6, time: 20, hand: true, unlock: 'low-density-structure',   in: { 'steel-plate': 2, 'copper-plate': 20, 'plastic-bar': 5 }, out: { 'low-density-structure': 1 } },
    { id: 'craft-rocket-control-unit',  name: 'Unité de contrôle',  cat: 'crafting', order: 6, time: 30, hand: true, unlock: 'rocket-control-unit',     in: { 'processing-unit': 1, 'electronic-circuit': 1 }, out: { 'rocket-control-unit': 1 } },
    { id: 'craft-rocket-fuel',          name: 'Carburant de fusée', cat: 'crafting', order: 6, time: 30, hand: true, unlock: 'rocket-fuel',             in: { 'solid-fuel': 10 }, out: { 'rocket-fuel': 1 } },

    // Sciences (order 7) — fabriquées en assembleur
    { id: 'craft-automation-science', name: 'Science : automatisation', cat: 'science', order: 7, time: 5,  hand: true, in: { 'copper-plate': 1, 'iron-gear': 1 }, out: { 'automation-science': 1 } },
    { id: 'craft-logistic-science',   name: 'Science : logistique',     cat: 'science', order: 7, time: 6,  hand: true, unlock: 'logistics',        in: { 'inserter': 1, 'transport-belt': 1 }, out: { 'logistic-science': 1 } },
    { id: 'craft-chemical-science',   name: 'Science : chimie',         cat: 'science', order: 7, time: 24, hand: true, unlock: 'chemical-science', in: { 'sulfur': 1, 'advanced-circuit': 1, 'engine-unit': 1 }, out: { 'chemical-science': 1 } },
    { id: 'craft-utility-science',    name: 'Science : utilitaire',     cat: 'science', order: 7, time: 21, hand: true, unlock: 'utility-science',  in: { 'processing-unit': 1, 'low-density-structure': 1, 'battery': 1 }, out: { 'utility-science': 1 } },

    // Fusée (order 8)
    { id: 'craft-rocket-part', name: 'Pièce de fusée', cat: 'rocket-building', order: 8, time: 3, hand: false, unlock: 'rocket-silo', in: { 'low-density-structure': 1, 'rocket-control-unit': 1, 'rocket-fuel': 1 }, out: { 'rocket-part': 1 } },
  ];

  /* --- Machines --------------------------------------------------------- */
  // cats : catégories de recettes traitées (un assembleur gère crafting + science)
  // speed : multiplicateur de vitesse
  // power : conso électrique kW (0 = aucune)
  // fuel : conso charbon/s (0 = aucune) → machine « à charbon »
  const MACHINES = {
    'burner-mining-drill': { name: 'Foreuse à charbon', icon: '⛏️', cats: ['mining'], speed: 1, power: 0, fuel: 0.5, cost: { 'iron-gear': 3, 'iron-plate': 3, 'stone': 5 } },
    'electric-mining-drill': { name: 'Foreuse électrique', icon: '⛏️', cats: ['mining'], speed: 2, power: 90, fuel: 0, unlock: 'electric-mining', cost: { 'iron-gear': 10, 'iron-plate': 10, 'electronic-circuit': 5 } },

    'stone-furnace': { name: 'Four en pierre', icon: '🔥', cats: ['smelting'], speed: 1, power: 0, fuel: 0.4, cost: { 'stone': 5 } },
    'steel-furnace': { name: 'Four en acier', icon: '🔥', cats: ['smelting'], speed: 2, power: 0, fuel: 0.4, unlock: 'advanced-material-processing', cost: { 'steel-plate': 6, 'stone-brick': 10 } },
    'electric-furnace': { name: 'Four électrique', icon: '🔥', cats: ['smelting'], speed: 2, power: 180, fuel: 0, unlock: 'advanced-material-processing-2', cost: { 'steel-plate': 10, 'advanced-circuit': 5, 'stone-brick': 10 } },

    'assembling-machine-1': { name: 'Assembleur Mk1', icon: '🏭', cats: ['crafting', 'science'], speed: 0.5, power: 0, fuel: 0, cost: { 'iron-gear': 9, 'iron-plate': 5, 'electronic-circuit': 3 } },
    'assembling-machine-2': { name: 'Assembleur Mk2', icon: '🏭', cats: ['crafting', 'science'], speed: 0.75, power: 150, fuel: 0, unlock: 'automation-2', cost: { 'steel-plate': 2, 'iron-gear': 5, 'electronic-circuit': 3 } },
    'assembling-machine-3': { name: 'Assembleur Mk3', icon: '🏭', cats: ['crafting', 'science'], speed: 1.25, power: 375, fuel: 0, unlock: 'automation-3', cost: { 'steel-plate': 5, 'advanced-circuit': 5, 'electronic-circuit': 10 } },

    'chemical-plant': { name: 'Usine chimique', icon: '⚗️', cats: ['chemistry'], speed: 1, power: 210, fuel: 0, unlock: 'oil-processing', cost: { 'steel-plate': 5, 'iron-gear': 5, 'electronic-circuit': 5, 'pipe': 5 } },
    'oil-refinery': { name: 'Raffinerie', icon: '🏗️', cats: ['oil-refining'], speed: 1, power: 420, fuel: 0, unlock: 'oil-processing', cost: { 'steel-plate': 15, 'iron-gear': 10, 'electronic-circuit': 10, 'pipe': 10, 'stone-brick': 10 } },
    'pumpjack': { name: 'Pompe à pétrole', icon: '🛢️', cats: ['oil-extraction'], speed: 1, power: 90, fuel: 0, unlock: 'oil-processing', cost: { 'steel-plate': 5, 'iron-gear': 10, 'electronic-circuit': 5, 'pipe': 10 } },
    'offshore-pump': { name: 'Pompe à eau', icon: '💧', cats: ['water'], speed: 1, power: 0, fuel: 0, unlock: 'oil-processing', cost: { 'iron-gear': 1, 'pipe': 1, 'electronic-circuit': 2 } },

    'rocket-silo': { name: 'Silo à fusée', icon: '🚀', cats: ['rocket-building'], speed: 1, power: 2000, fuel: 0, unlock: 'rocket-silo', cost: { 'steel-plate': 200, 'processing-unit': 50, 'electronic-circuit': 200, 'pipe': 50 } },
  };

  /* --- Générateurs d'énergie ------------------------------------------- */
  const GENERATORS = {
    'steam-engine': { name: 'Machine à vapeur', icon: '♨️', output: CONFIG.STEAM_OUTPUT, fuel: 0.5, unlock: 'steam-power', cost: { 'iron-gear': 8, 'iron-plate': 10, 'pipe': 5 } },
    'solar-panel': { name: 'Panneau solaire', icon: '🔆', output: CONFIG.SOLAR_OUTPUT, fuel: 0, unlock: 'solar-energy', cost: { 'steel-plate': 5, 'copper-plate': 5, 'electronic-circuit': 15 } },
  };

  /* --- Recherches ------------------------------------------------------- */
  // cost : { science : qté } ; prereq : [techIds] ; recipes/machines/generators : déblocages
  // effect : bonus permanents ; repeatable : coût qui croît avec le niveau
  const TECHS = [
    { id: 'steam-power', name: 'Énergie vapeur', cost: { 'automation-science': 15 }, prereq: [], generators: ['steam-engine'], desc: "Débloque la machine à vapeur : produit de l'électricité en brûlant du charbon." },
    { id: 'electric-mining', name: 'Forage électrique', cost: { 'automation-science': 30 }, prereq: ['steam-power'], machines: ['electric-mining-drill'], desc: 'Foreuses électriques, plus rapides (nécessitent du courant).' },
    { id: 'advanced-material-processing', name: "Traitement de l'acier", cost: { 'automation-science': 25 }, prereq: [], recipes: ['smelt-steel-plate'], machines: ['steel-furnace'], desc: "Permet de fondre l'acier et débloque le four en acier." },
    { id: 'logistics', name: 'Logistique', cost: { 'automation-science': 30 }, prereq: [], recipes: ['craft-inserter', 'craft-transport-belt', 'craft-logistic-science'], desc: 'Bras, convoyeurs et science logistique (verte).' },
    { id: 'oil-processing', name: 'Traitement du pétrole', cost: { 'automation-science': 50, 'logistic-science': 30 }, prereq: ['steam-power', 'logistics'], recipes: ['extract-crude-oil', 'pump-water', 'refine-petroleum'], machines: ['oil-refinery', 'pumpjack', 'offshore-pump', 'chemical-plant'], desc: 'Pompes, raffinerie et usine chimique.' },
    { id: 'plastics', name: 'Plastique', cost: { 'logistic-science': 30 }, prereq: ['oil-processing'], recipes: ['chem-plastic'], desc: 'Produire du plastique à partir du gaz de pétrole.' },
    { id: 'sulfur-processing', name: 'Traitement du soufre', cost: { 'logistic-science': 40 }, prereq: ['oil-processing'], recipes: ['chem-sulfur', 'chem-sulfuric-acid'], desc: "Soufre et acide sulfurique." },
    { id: 'advanced-electronics', name: 'Électronique avancée', cost: { 'logistic-science': 50 }, prereq: ['plastics'], recipes: ['craft-advanced-circuit'], desc: 'Circuits avancés (rouges).' },
    { id: 'engine', name: 'Moteurs', cost: { 'logistic-science': 40 }, prereq: ['advanced-material-processing', 'oil-processing'], recipes: ['craft-engine-unit'], desc: 'Fabrication de moteurs.' },
    { id: 'chemical-science', name: 'Science chimique', cost: { 'logistic-science': 75 }, prereq: ['advanced-electronics', 'engine', 'sulfur-processing'], recipes: ['craft-chemical-science'], desc: 'Débloque la science chimique (bleue).' },
    { id: 'automation-2', name: 'Automatisation 2', cost: { 'chemical-science': 40 }, prereq: ['chemical-science'], machines: ['assembling-machine-2'], desc: 'Assembleur Mk2, plus rapide.' },
    { id: 'flammables', name: 'Combustibles', cost: { 'chemical-science': 50 }, prereq: ['chemical-science'], recipes: ['chem-solid-fuel'], desc: 'Combustible solide à partir du pétrole.' },
    { id: 'advanced-electronics-2', name: 'Électronique avancée 2', cost: { 'chemical-science': 75 }, prereq: ['chemical-science', 'advanced-electronics'], recipes: ['craft-processing-unit'], desc: 'Processeurs (circuits bleus).' },
    { id: 'batteries', name: 'Batteries', cost: { 'chemical-science': 50 }, prereq: ['chemical-science', 'sulfur-processing'], recipes: ['chem-battery'], desc: 'Fabrication de batteries.' },
    { id: 'electric-engine', name: 'Moteur électrique', cost: { 'chemical-science': 40 }, prereq: ['chemical-science', 'engine'], recipes: ['craft-electric-engine-unit'], desc: 'Moteurs électriques.' },
    { id: 'advanced-material-processing-2', name: 'Four électrique', cost: { 'chemical-science': 75 }, prereq: ['chemical-science', 'advanced-material-processing'], machines: ['electric-furnace'], desc: 'Four électrique rapide, sans charbon.' },
    { id: 'solar-energy', name: 'Énergie solaire', cost: { 'chemical-science': 60 }, prereq: ['chemical-science'], generators: ['solar-panel'], desc: 'Panneaux solaires : électricité gratuite, sans charbon.' },
    { id: 'low-density-structure', name: 'Structure légère', cost: { 'chemical-science': 75 }, prereq: ['chemical-science', 'advanced-material-processing', 'plastics'], recipes: ['craft-low-density-structure'], desc: 'Composant clé de la fusée.' },
    { id: 'utility-science', name: 'Science utilitaire', cost: { 'chemical-science': 100 }, prereq: ['advanced-electronics-2', 'batteries', 'low-density-structure'], recipes: ['craft-utility-science'], desc: 'Débloque la science utilitaire (jaune).' },
    { id: 'rocket-fuel', name: 'Carburant de fusée', cost: { 'chemical-science': 75, 'utility-science': 50 }, prereq: ['flammables', 'utility-science'], recipes: ['craft-rocket-fuel'], desc: 'Carburant pour la fusée.' },
    { id: 'rocket-control-unit', name: 'Unité de contrôle', cost: { 'utility-science': 75 }, prereq: ['advanced-electronics-2', 'utility-science'], recipes: ['craft-rocket-control-unit'], desc: 'Cerveau de la fusée.' },
    { id: 'automation-3', name: 'Automatisation 3', cost: { 'chemical-science': 150, 'utility-science': 75 }, prereq: ['automation-2', 'utility-science'], machines: ['assembling-machine-3'], desc: 'Assembleur Mk3, très rapide.' },
    { id: 'rocket-silo', name: '🚀 Silo à fusée', cost: { 'utility-science': 100, 'chemical-science': 100 }, prereq: ['rocket-fuel', 'rocket-control-unit', 'low-density-structure', 'utility-science'], machines: ['rocket-silo'], recipes: ['craft-rocket-part'], desc: 'Construit le silo et permet d\'assembler la fusée. Objectif final !' },

    // Recherches répétables
    { id: 'mining-tools', name: 'Outils de minage', repeatable: true, costMult: 1.8, cost: { 'automation-science': 10 }, prereq: [], effect: { clickPower: 1 }, desc: '+1 ressource par clic manuel (cumulable).' },
    { id: 'machine-productivity', name: 'Vitesse des machines', repeatable: true, costMult: 1.7, cost: { 'logistic-science': 25 }, prereq: ['logistics'], effect: { speed: 0.05 }, desc: '+5 % de vitesse pour toutes les machines (cumulable).' },
  ];

  return { CONFIG, ITEMS, SECTIONS, RECIPES, MACHINES, GENERATORS, TECHS };
})();
