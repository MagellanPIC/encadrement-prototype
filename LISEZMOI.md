# Essayage de cadres en ligne — prototype

Le visiteur dépose la photo de son œuvre. Le site lui propose six moulures, puis
lui montre l'œuvre encadrée. Il peut changer le passe-partout, la couleur du mur
et le verre, télécharger l'image et demander une soumission.

**L'œuvre n'est jamais retouchée.** Le cadre est dessiné en calques par-dessus
elle, dans le navigateur (`js/rendu.js`).

## Lancer en local

```bash
python server.py
```

Ouvrir ensuite http://localhost:8765. Python 3.10 ou plus récent suffit : aucune
dépendance.

## Les suggestions

- **Avec une clé OpenAI.** Copier `.env.example` en `.env` et y mettre
  `OPENAI_API_KEY`. Le serveur envoie l'image réduite (768 px, détail « low »)
  et le catalogue au modèle (`gpt-5.6-luna` par défaut). Le modèle répond avec
  six références tirées du catalogue, sous un schéma JSON strict.
  - Chaque appel est inscrit dans `journal_ia.jsonl` : heure, jetons, coût
    estimé. Aucune image n'y est conservée.
  - `PLAFOND_JOUR_USD` coupe l'IA quand la dépense du jour l'atteint (2 $ par
    défaut).
- **Sans clé** (et sur GitHub Pages), le site analyse les couleurs de l'œuvre
  dans le navigateur et choisit par règles (`js/suggestion.js`). C'est gratuit
  et instantané, et l'interface le signale.

## Le catalogue

Tout est dans `catalogue.json`. Les 19 moulures sont **fictives**. Il y a deux
sortes de rendu :

- `"type": "procedural"` : une matière (`js/matieres.js`) et un profil en
  travers (`plat`, `pente`, `concave`, `convexe`, `bombe`, `perle`, `jour`).
  Le profil donne le relief et les ombres.
- `"type": "image"` : la photo d'un vrai cadre, découpée en neuf (coins et
  côtés) puis réassemblée autour de l'œuvre.
  - Pour un PNG à ouverture transparente, la découpe est automatique.
  - Pour une photo sur fond, on donne `recadre` (le bord extérieur) et
    `tranche` (la largeur de chaque côté), en pixels de la photo.

Pour passer aux vraies moulures de l'atelier, il faut, par moulure :

- une photo de face d'un coin monté, ou d'une baguette à plat, sous une lumière
  égale ;
- la fiche : référence, largeur, finition, prix.

## Ce qui reste à faire pour un site réel

1. Les moulures et les prix réels de l'atelier.
2. L'IA en ligne : une fonction serveur (Cloudflare Workers, Vercel ou Netlify)
   qui reprend `suggerer()` de `server.py` et garde la clé secrète.
3. Le formulaire de soumission, avec l'envoi de l'image à l'atelier.
4. Le redressement de perspective, pour les photos prises de biais (le
   recadrage actuel est rectangulaire).

Crédits des images : `credits.html`.
