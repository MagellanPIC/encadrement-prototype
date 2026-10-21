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
- **En ligne** (GitHub Pages), la page appelle la fonction Cloudflare
  `https://encadrement-ia.magellanpic.workers.dev` (dossier `worker/`, adresse
  dans `js/config.js`). Elle suit le même contrat que `server.py` et lit la
  même consigne (`ia/consigne.txt`).
  - La clé OpenAI est un secret du Worker. On la pose avec
    `npx wrangler@4.148.0 secret put OPENAI_API_KEY` depuis `worker/`. Elle
    n'est jamais dans le dépôt.
  - Plafond de 0,50 $ par jour et 30 demandes par adresse et par jour,
    comptés dans Workers KV. Pour les modifier : `worker/wrangler.toml`, puis
    `npx wrangler@4.148.0 deploy`.
  - Seules les origines listées dans `ORIGINES` reçoivent les en-têtes CORS.
- **Sans clé ni fonction**, ou une fois le plafond atteint, le site analyse les
  couleurs de l'œuvre dans le navigateur et choisit par règles
  (`js/suggestion.js`). C'est gratuit et instantané, et l'interface le signale.

## Les goûts du visiteur

Sous la photo, le bloc « Vos goûts » est entièrement facultatif. Si le visiteur
ne coche rien, l'IA décide d'après l'œuvre. Il peut préciser :

- le style du cadre ;
- la teinte ;
- la présence (largeur) ;
- le passe-partout ;
- le budget ;
- la pièce où l'œuvre sera accrochée ;
- quelques mots libres, 280 caractères au plus.

Le vocabulaire de ces critères est dans `catalogue.json` (`criteres`), et
chaque moulure porte ses `styles`, ses `teintes` et sa `gamme` (de 1 à 3).

- **Avec l'IA**, les goûts passent avant sa propre lecture de l'œuvre. Au moins
  4 des 6 cadres doivent tenir tous les critères cochés, si le catalogue le
  permet. Le texte libre est transmis comme une information, jamais comme une
  consigne.
- **Sans l'IA**, l'analyse locale range d'abord les moulures qui tiennent tous
  les goûts, puis celles qui en tiennent une partie. Elle ne dépasse le budget
  que d'un cran, et seulement s'il le faut. Le texte libre y est lu par
  mots-clés (« doré », « chalet », « bois », « discret »…), et l'interface
  affiche les mots retenus.
- **Le passe-partout** demandé (avec ou sans) est appliqué par le code, pas
  laissé au modèle.

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
2. Le formulaire de soumission, avec l'envoi de l'image à l'atelier.
3. Le redressement de perspective, pour les photos prises de biais (le
   recadrage actuel est rectangulaire).

Crédits des images : `credits.html`.
