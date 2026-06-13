# Justfile — command runner pour Idle Factorio.
# Toutes les commandes Node (lint, tests) tournent DANS Docker (service `tests`,
# image node:22-alpine), jamais avec le Node de l'hôte → reproductible en CI.
#
#   just            → liste les recettes
#   just up         → démarre le jeu sur http://localhost:8080
#   just test       → lance la suite de tests dans Docker
#   just ci         → build + lint + tests (ce que la CI exécute)

set shell := ["bash", "-uc"]

# Liste les recettes disponibles
_default:
    @just --list --unsorted

# Construit l'image web du jeu
build:
    docker compose build idle-factorio

# Démarre le jeu (port 8080)
up:
    docker compose up -d --build
    @echo "▶  Jeu disponible sur http://localhost:8080"

# Arrête le jeu
down:
    docker compose down

# Redémarre le jeu
restart: down up

# Suit les logs du serveur web
logs:
    docker compose logs -f idle-factorio

# État des conteneurs
ps:
    docker compose ps

# Vérifie la syntaxe de tous les fichiers JS (dans Docker)
lint:
    docker compose run --rm tests sh -c 'set -e; for f in data.js engine.js ui.js test.js; do echo "→ node --check $f"; node --check "$f"; done; echo "✓ syntaxe OK"'

# Lance la suite de tests complète (dans Docker)
test:
    docker compose run --rm tests

# Exécute une commande node arbitraire dans le conteneur (ex: just node --version)
node *args:
    docker compose run --rm tests node {{args}}

# Ouvre un shell dans le conteneur Node (debug)
shell:
    docker compose run --rm tests sh

# Pipeline complet utilisé par la CI : build image + lint + tests
ci: build lint test
    @echo "✅ CI verte : image construite, syntaxe et tests OK."

# Nettoyage : conteneurs, réseaux, image locale
clean:
    docker compose down --rmi local --remove-orphans
