# 🚀 Idle Factorio

Un *idle game* jouable dans le navigateur, dans l'esprit de **Universal Paperclips** (le « jeu du trombone ») mais sur un thème **Factorio**. On part du minage à la main, on automatise toute une chaîne de production (mines → fours → assembleurs → chimie → pétrole), on débloque des recherches, et l'**objectif final est de construire et lancer une fusée** 🚀.

100 % HTML/CSS/JavaScript *vanilla* — aucune dépendance, aucune étape de build.

## Comment jouer

1. **Mine à la main** les 4 ressources de base (fer, cuivre, charbon, pierre) en cliquant.
2. **Construis ton premier four en pierre** (5 pierres) pour transformer le minerai en plaques (il consomme du charbon 🔥).
3. **Fabrique à la main** (bouton ✋) des engrenages et des circuits pour t'offrir ton **premier assembleur**, puis automatise tout.
4. **Produis de la science** 🔴 pour lancer des **recherches** : électricité (machines à vapeur), foreuses électriques, acier, pétrole, plastique, circuits avancés…
5. **Gère l'énergie** ⚡ : les machines électriques ralentissent en cas de surcharge. Construis assez de machines à vapeur (charbon) ou de panneaux solaires.
6. **Monte les paliers de science** (rouge → verte → bleue → jaune) jusqu'à débloquer le **Silo à fusée**.
7. **Assemble 100 pièces de fusée** (structure légère + unité de contrôle + carburant) puis **LANCE LA FUSÉE** pour gagner !

La partie se **sauvegarde automatiquement** dans le navigateur (localStorage) et la production continue **hors-ligne** (plafonnée à 8 h).

> Astuce Factorio : surveille les débits (`/s`) dans le panneau Ressources. Si un objet de haut niveau reste à 0, c'est qu'un ingrédient en amont est en pénurie — ajoute des machines pour le produire.

## Lancer le jeu

### Option 1 — Ouvrir le fichier directement
Ouvre simplement `index.html` dans un navigateur (double-clic). Tout fonctionne en `file://`.

### Option 2 — Stack Docker (recommandé)
```bash
docker compose up -d --build   # puis ouvrir http://localhost:8080
docker compose down            # pour arrêter
```

### Option 3 — Command runner `just` (le plus pratique)
[`just`](https://just.systems) pilote toutes les tâches de dev. Les commandes Node
(lint, tests) s'exécutent **dans Docker** (service `tests`, image `node:22-alpine`) :
jamais le Node de l'hôte → strictement reproductible, y compris en CI.

```bash
just              # liste les recettes
just up           # démarre le jeu (http://localhost:8080)
just down         # arrête le jeu
just lint         # vérifie la syntaxe JS (dans Docker)
just test         # suite de tests complète (dans Docker)
just ci           # build image + lint + tests (pipeline CI)
just node --version   # commande node arbitraire dans le conteneur
just shell        # shell dans le conteneur Node
just clean        # supprime conteneurs/réseaux/image locale
```

Installation de `just` si besoin : `curl -fsSL https://just.systems/install.sh | bash -s -- --to ~/.local/bin`

## Développement

| Fichier        | Rôle |
|----------------|------|
| `data.js`      | Tout le contenu : objets, recettes, machines, générateurs, recherches. |
| `engine.js`    | État du jeu et simulation (production, énergie, sauvegarde, hors-ligne). Aucune dépendance au DOM. |
| `ui.js`        | Rendu de l'interface et interactions. |
| `index.html` / `style.css` | Structure et thème sombre « Factorio ». |
| `test.js`      | Tests headless (Node) : cohérence des données, accessibilité de l'arbre techno, et **planificateur d'usine** prouvant que la fusée est constructible. |

### Tests
Lancer la suite **dans Docker** (recommandé, identique à la CI) :
```bash
just test                      # ou : docker compose run --rm tests
```
Le test valide :
1. la **cohérence des données** (toutes les recettes/coûts/recherches référencent des objets existants) ;
2. l'**arbre technologique** (aucun cycle, tout est atteignable, les sciences requises sont produites par des recettes débloquées en amont) ;
3. la **faisabilité de la fusée** : un planificateur calcule la nomenclature complète, place le bon nombre de machines, et simule la production jusqu'au lancement.

### Intégration continue
Un workflow d'exemple est fourni dans [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
Il n'installe **aucun Node** sur le runner : tout passe par `docker compose run --rm tests`,
donc le comportement est identique à `just ci` en local. Les codes de sortie se
propagent (un test en échec fait échouer le job).

### Équilibrage
Les nombres (coûts, temps, débits, `ROCKET_PARTS_NEEDED`) sont centralisés dans `data.js` (objet `CONFIG` et tableaux). Faciles à ajuster pour rendre la partie plus longue ou plus courte.
