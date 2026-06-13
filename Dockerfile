# Image légère : un simple serveur nginx qui sert les fichiers statiques du jeu.
# Aucune étape de build (HTML/CSS/JS vanilla) — il suffit de copier les fichiers.
FROM nginx:alpine

LABEL org.opencontainers.image.title="Idle Factorio" \
      org.opencontainers.image.description="Idle game façon Factorio : du minage manuel au lancement de fusée."

# Configuration nginx (cache désactivé pour faciliter le rechargement en dev)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Fichiers du jeu (on évite test.js et les fichiers de dev via .dockerignore)
COPY index.html style.css data.js engine.js ui.js /usr/share/nginx/html/

EXPOSE 80

# On vise 127.0.0.1 (IPv4) : nginx n'écoute pas en IPv6, et localhost peut
# résoudre en ::1. curl est présent dans l'image nginx:alpine.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -fsS http://127.0.0.1/ >/dev/null || exit 1
