# Encadrement Simon B, par Arthotèque — prototype d'essayage en ligne

**L'œuvre n'est jamais retouchée.** Le cadre est dessiné en calques par-dessus
elle, dans le navigateur (`js/rendu.js`). L'interface le présente comme une
simulation indicative.

## Le parcours, en trois étapes

1. **Votre œuvre**
   - La photo s'affiche dans la zone même où on l'importe, avec « Recadrer » et
     « Remplacer ».
   - Le type d'œuvre est demandé (toile sur châssis, affiche, photographie,
     œuvre sur papier, autre). Les dimensions sont facultatives : sans elles,
     l'aperçu suppose 50 cm sur le plus grand côté et le dit.
   - Les envies se règlent dans un panneau replié, « Préciser mes envies ».
2. **Vos encadrements**
   - Grand aperçu à gauche (en haut sur téléphone), suggestions et réglages à
     droite.
   - Trois propositions distinctes, puis « Voir trois autres idées ».
   - Les cadres au-delà du budget sont à part, avec leur dépassement indiqué.
     Si aucun ne tient dans le budget, le site le dit et propose d'élargir.
   - Ce qui n'a pas de sens est caché : pas de passe-partout pour une toile,
     ni de verre pour une caisse américaine.
3. **Votre demande**
   - Le formulaire reprend l'œuvre, le cadre et les options choisis.
   - Il ne demande que les coordonnées, plus les dimensions réelles si elles
     manquent.
   - Une confirmation explique la suite. Le prototype n'envoie encore rien.

**Ce que la page dit de la photo suit le fonctionnement réel :**
- Avec l'IA, une version réduite part chez OpenAI. Les requêtes portent
  `store: false`, donc OpenAI ne les enregistre pas. OpenAI peut toutefois les
  garder jusqu'à 30 jours pour surveiller les abus, et ne s'en sert pas pour
  entraîner ses modèles.
- Sans l'IA, la photo ne quitte pas le navigateur.

## Lancer en local

```bash
python server.py
```

Ouvrir ensuite http://localhost:8765. Python 3.10 ou plus récent suffit : aucune
dépendance.

## Mettre en ligne une nouvelle version

Pousser sur `main` : GitHub Pages republie en une minute environ.

**Changer d'abord le `?v=` des feuilles de style et des scripts** dans
`index.html` et `credits.html`. Pages laisse les navigateurs garder les
fichiers 10 minutes. Sans ce changement, un visiteur venu juste avant voit
l'ancienne version, ou un mélange des deux.

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

## Démonstration sans photo

Les trois œuvres d'exemple sont cachées au public : on n'essaie l'outil qu'avec
sa propre œuvre. Pour une démonstration, ajouter `?demo` à l'adresse :
https://magellanpic.github.io/encadrement-prototype/?demo

## Les goûts du visiteur

Le panneau replié « Préciser mes envies » est entièrement facultatif. Ouvert,
il montre d'abord le style, la couleur et le budget (des gammes indicatives,
faute de prix réels). Le reste est sous « Plus d'options ». Si le visiteur ne
coche rien, l'IA décide d'après l'œuvre. Il peut préciser :

- le style du cadre ;
- la teinte ;
- la largeur du cadre (fine, moyenne, large, illustrées) ;
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
