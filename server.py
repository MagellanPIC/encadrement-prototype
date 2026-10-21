"""Serveur du prototype d'encadrement.

Sert les fichiers du site et expose deux routes :
  GET  /api/etat     -> l'IA est-elle disponible ?
  POST /api/suggest  -> six moulures choisies par un modèle de vision OpenAI

Sans clé OPENAI_API_KEY (variable d'environnement ou fichier .env à côté de
ce script), le site fonctionne quand même : il suggère par analyse locale.

Bibliothèque standard seulement :  python server.py
"""

from __future__ import annotations

import datetime as dt
import http.server
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

RACINE = pathlib.Path(__file__).resolve().parent
JOURNAL = RACINE / "journal_ia.jsonl"
INTERDITS = {"server.py", "journal_ia.jsonl", "wrangler.toml"}
TAILLE_MAX = 8 * 1024 * 1024

# Tarif de gpt-5.6-luna en $ par million de jetons (entrée, sortie), relevé
# du moteur BIC le 2026-09-11. Sert à l'estimation du journal, pas à facturer.
TARIFS = {"gpt-5.6-luna": (0.20, 1.20)}


def lire_env() -> dict[str, str]:
    env: dict[str, str] = {}
    fichier = RACINE / ".env"
    if fichier.exists():
        for ligne in fichier.read_text(encoding="utf-8").splitlines():
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#") and "=" in ligne:
                cle, val = ligne.split("=", 1)
                env[cle.strip()] = val.strip().strip('"').strip("'")
    env.update({k: v for k, v in os.environ.items() if k in (
        "OPENAI_API_KEY", "OPENAI_MODEL", "PLAFOND_JOUR_USD", "HOTE", "PORT")})
    return env


ENV = lire_env()
CLE = ENV.get("OPENAI_API_KEY", "")
MODELE = ENV.get("OPENAI_MODEL", "gpt-5.6-luna")
PLAFOND_JOUR = float(ENV.get("PLAFOND_JOUR_USD", "2.00"))


def catalogue() -> dict:
    return json.loads((RACINE / "catalogue.json").read_text(encoding="utf-8"))


# ---- Dépense ------------------------------------------------------------------
def cout(entree: int, sortie: int) -> float:
    pe, ps = TARIFS.get(MODELE, (0.0, 0.0))
    return (entree * pe + sortie * ps) / 1_000_000


def depense_du_jour() -> float:
    if not JOURNAL.exists():
        return 0.0
    jour = dt.date.today().isoformat()
    total = 0.0
    for ligne in JOURNAL.read_text(encoding="utf-8").splitlines():
        try:
            e = json.loads(ligne)
        except json.JSONDecodeError:
            continue
        if e.get("date", "").startswith(jour):
            total += e.get("cout_usd", 0.0)
    return total


def journaliser(entree: dict) -> None:
    # Aucune image n'est écrite : seulement l'heure, le modèle et les jetons.
    with JOURNAL.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entree, ensure_ascii=False) + "\n")


# ---- Appel au modèle ----------------------------------------------------------
# La consigne est partagée avec la fonction en ligne (worker/src/index.js).
CONSIGNE = (RACINE / "ia" / "consigne.txt").read_text(encoding="utf-8").strip()

TYPES = {"toile": "painting on stretched canvas", "papier": "work on paper",
         "photo": "photograph", "affiche": "poster or reproduction"}


def schema(cat: dict) -> dict:
    ids = [m["id"] for m in cat["moulures"]]
    pps = [p["id"] for p in cat["passe_partout"]]
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["lecture", "palette", "suggestions"],
        "properties": {
            "lecture": {"type": "string"},
            "palette": {"type": "array", "items": {"type": "string"}},
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "raison", "passe_partout"],
                    "properties": {
                        "id": {"type": "string", "enum": ids},
                        "raison": {"type": "string"},
                        "passe_partout": {"type": "string", "enum": pps},
                    },
                },
            },
        },
    }


def texte_demande(cat: dict, type_oeuvre: str, dims: dict) -> str:
    champs = ("id", "nom", "famille", "style", "finition", "matiere", "largeur_cm",
              "temperature", "valeur", "convient", "description")
    lignes = [json.dumps({k: m[k] for k in champs}, ensure_ascii=False) for m in cat["moulures"]]
    mats = ", ".join(f'{p["id"]} ({p["nom"]})' for p in cat["passe_partout"])
    return (
        f"Artwork type: {type_oeuvre} ({TYPES.get(type_oeuvre, type_oeuvre)}).\n"
        f"Visible size: {dims.get('l')} x {dims.get('h')} cm (width x height).\n\n"
        f"Mat ids: {mats}\n\nCatalogue, one moulding per line:\n" + "\n".join(lignes)
    )


def appeler(corps: dict) -> dict:
    req = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(corps).encode("utf-8"),
        headers={"Authorization": f"Bearer {CLE}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def texte_sortie(rep: dict) -> str:
    morceaux = []
    for item in rep.get("output", []):
        if item.get("type") == "message":
            for c in item.get("content", []):
                if c.get("type") == "output_text":
                    morceaux.append(c.get("text", ""))
    return "".join(morceaux)


def suggerer(demande: dict) -> dict:
    cat = catalogue()
    type_oeuvre = demande.get("type", "toile")
    dims = demande.get("dimensions_cm") or {}
    image = demande.get("image", "")
    if not image.startswith("data:image/"):
        return {"erreur": "image absente"}

    depense = depense_du_jour()
    if depense >= PLAFOND_JOUR:
        return {"erreur": f"plafond du jour atteint ({depense:.2f} $ sur {PLAFOND_JOUR:.2f} $)"}

    corps = {
        "model": MODELE,
        "input": [
            {"role": "developer", "content": [{"type": "input_text", "text": CONSIGNE}]},
            {"role": "user", "content": [
                {"type": "input_text", "text": texte_demande(cat, type_oeuvre, dims)},
                {"type": "input_image", "image_url": image, "detail": "low"},
            ]},
        ],
        "text": {"format": {"type": "json_schema", "name": "suggestions_cadres",
                            "strict": True, "schema": schema(cat)}},
        "reasoning": {"effort": "low"},
        "max_output_tokens": 2500,
    }
    try:
        try:
            rep = appeler(corps)
        except urllib.error.HTTPError as e:
            if e.code != 400:
                raise
            # un modèle sans réglage de raisonnement refuse le champ : on réessaie sans
            corps.pop("reasoning", None)
            rep = appeler(corps)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        return {"erreur": f"OpenAI a refusé la requête ({e.code}) : {detail}"}
    except (urllib.error.URLError, TimeoutError) as e:
        return {"erreur": f"OpenAI injoignable : {e}"}

    usage = rep.get("usage") or {}
    entree, sortie = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    prix = cout(entree, sortie)
    journaliser({"date": dt.datetime.now().isoformat(timespec="seconds"), "modele": MODELE,
                 "jetons_entree": entree, "jetons_sortie": sortie, "cout_usd": round(prix, 6),
                 "statut": rep.get("status")})

    try:
        res = json.loads(texte_sortie(rep))
    except json.JSONDecodeError:
        return {"erreur": f"réponse illisible (statut {rep.get('status')})"}

    # On ne garde que ce que le catalogue permet, sans doublon.
    par_id = {m["id"]: m for m in cat["moulures"]}
    vus, garde = set(), []
    for s in res.get("suggestions", []):
        m = par_id.get(s.get("id"))
        if not m or m["id"] in vus or type_oeuvre not in m["convient"]:
            continue
        if type_oeuvre == "toile" or m["famille"] == "caisse_americaine":
            s["passe_partout"] = "aucun"
        vus.add(m["id"])
        garde.append(s)
    return {"mode": "ia", "modele": MODELE, "lecture": res.get("lecture", ""),
            "palette": res.get("palette", [])[:5], "suggestions": garde[:6],
            "jetons": {"entree": entree, "sortie": sortie}, "cout_usd": round(prix, 6)}


# ---- HTTP ---------------------------------------------------------------------
class Gestion(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".md": "text/plain; charset=utf-8",
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".webp": "image/webp", ".svg": "image/svg+xml",
    }

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(RACINE), **k)

    def repondre(self, code: int, donnees: dict) -> None:
        corps = json.dumps(donnees, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        chemin = self.path.split("?", 1)[0]
        if chemin == "/api/etat":
            return self.repondre(200, {"ia": bool(CLE), "modele": MODELE if CLE else None})
        morceaux = [p for p in chemin.split("/") if p]
        if any(p.startswith(".") for p in morceaux) or (morceaux and morceaux[-1] in INTERDITS):
            return self.send_error(404)
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/suggest":
            return self.send_error(404)
        if not CLE:
            return self.repondre(503, {"erreur": "aucune clé OpenAI configurée"})
        longueur = int(self.headers.get("Content-Length", 0))
        if longueur <= 0 or longueur > TAILLE_MAX:
            return self.repondre(413, {"erreur": "image trop lourde"})
        try:
            demande = json.loads(self.rfile.read(longueur).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.repondre(400, {"erreur": "requête illisible"})
        res = suggerer(demande)
        return self.repondre(502 if "erreur" in res else 200, res)

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            sys.stderr.write("%s  %s\n" % (self.log_date_time_string(), fmt % args))


def main() -> None:
    hote = ENV.get("HOTE", "127.0.0.1")
    port = int(ENV.get("PORT", "8765"))
    serveur = http.server.ThreadingHTTPServer((hote, port), Gestion)
    print(f"Prototype d'encadrement : http://localhost:{port}")
    print(f"IA : {'OpenAI ' + MODELE if CLE else 'désactivée (pas de clé) — analyse locale'}"
          f" · plafond {PLAFOND_JOUR:.2f} $/jour")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
