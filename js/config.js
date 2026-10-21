/* Adresse de la fonction IA en ligne (Cloudflare Worker, dossier worker/).
   Sur GitHub Pages, la page n'a pas de serveur : elle appelle le Worker.
   Ailleurs (python server.py), elle appelle son propre serveur. */
window.BASE_IA = location.hostname.endsWith("github.io")
  ? "https://encadrement-ia.magellanpic.workers.dev/"
  : "";
