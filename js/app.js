/* Parcours en trois étapes : Votre œuvre → Vos encadrements → Votre demande. */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const TYPES = [
    { id: "toile", nom: "Toile sur châssis" },
    { id: "affiche", nom: "Affiche" },
    { id: "photo", nom: "Photographie" },
    { id: "papier", nom: "Œuvre sur papier" },
    { id: "autre", nom: "Autre" }
  ];
  const MURS = [
    { nom: "Blanc", couleur: "#efece6" },
    { nom: "Gris clair", couleur: "#d8d5cf" },
    { nom: "Sauge", couleur: "#a7b39f" },
    { nom: "Terre cuite", couleur: "#c99474" },
    { nom: "Bleu nuit", couleur: "#2d3a4e" },
    { nom: "Anthracite", couleur: "#3b3a38" }
  ];
  const GAMMES = { 1: "Économique", 2: "Intermédiaire", 3: "Haut de gamme" };
  const TAILLE_SUPPOSEE = 50;          // cm, côté le plus long, quand le visiteur ne mesure pas
  const LARGEURS_EXEMPLE = { discret: 2, equilibre: 5, affirme: 9 };   // px de bordure de l'icône

  const etat = {
    cat: null,
    serveur: { ia: false },
    source: null,       // photo d'origine (canvas)
    recadre: null,      // {x, y, l, h} dans la source
    oeuvre: null,       // canvas recadré
    type: null,
    dims: null,         // {l, h} mesurés par le visiteur ; null = taille supposée
    prefs: { styles: [], teintes: [], presence: null, passe: null, budget: null, interieur: null, texte: "" },
    resultat: null,
    principaux: [],     // suggestions dans le budget, les plus distinctes d'abord
    hors: [],           // suggestions au-delà du budget
    vues: 3,
    choix: null,
    pp: { id: "blanc_casse", cm: 6, touche: false },
    mur: MURS[0].couleur,
    vitre: false,
    etape: 1
  };

  const moulure = (id) => etat.cat.moulures.find((m) => m.id === id);
  const passe = (id) => etat.cat.passe_partout.find((p) => p.id === id);
  const suggestion = (id) => (etat.resultat ? etat.resultat.suggestions.find((s) => s.id === id) : null);
  const arrondi = (v) => Math.round(v * 2) / 2;
  const nomType = (id) => (TYPES.find((t) => t.id === id) || {}).nom || id;
  const flottant = (m) => m.famille === "caisse_americaine";
  // Tout texte venu de l'IA ou du visiteur passe par ici avant d'entrer dans le HTML.
  const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function cmEffectifs() {
    if (etat.dims) return etat.dims;
    const r = etat.oeuvre.width / etat.oeuvre.height;
    return r >= 1 ? { l: TAILLE_SUPPOSEE, h: arrondi(TAILLE_SUPPOSEE / r) } : { l: arrondi(TAILLE_SUPPOSEE * r), h: TAILLE_SUPPOSEE };
  }

  function budgetMax() {
    const b = (etat.cat.criteres.budget || []).find((c) => c.id === etat.prefs.budget);
    return b ? b.gamme_max : 3;
  }

  function alerte(texte) {
    const a = $("#alerte");
    a.textContent = texte;
    a.hidden = !texte;
  }

  // ---- Démarrage -----------------------------------------------------------
  async function demarrer() {
    try {
      const r = await fetch("catalogue.json", { cache: "no-store" });
      etat.cat = await r.json();
    } catch (e) {
      alerte("Le catalogue ne se charge pas. Lancez le prototype avec « python server.py » puis ouvrez http://localhost:8765.");
      return;
    }
    etat.serveur = await Suggestion.etatServeur();
    notePhoto();
    brancher();
  }

  // La promesse affichée suit le fonctionnement réel.
  function notePhoto() {
    $("#note-photo").textContent = etat.serveur.ia
      ? "Pour proposer des cadres, une version réduite de votre photo est analysée par notre service d'IA (OpenAI). Nous ne la conservons pas ; OpenAI peut la garder jusqu'à 30 jours pour la sécurité de son service, sans l'utiliser pour entraîner ses modèles."
      : "Votre photo reste dans votre navigateur : elle n'est envoyée nulle part.";
  }

  function brancher() {
    // étapes
    $$(".etapes-nav [data-aller]").forEach((b) => b.addEventListener("click", () => allerA(+b.dataset.aller)));

    // zone d'import : la photo s'affiche là où on la dépose
    const fichier = $("#fichier"), zone = $("#zone");
    $("#btn-importer").addEventListener("click", () => fichier.click());
    $("#btn-remplacer").addEventListener("click", () => fichier.click());
    fichier.addEventListener("change", () => { if (fichier.files[0]) lireFichier(fichier.files[0]); fichier.value = ""; });
    ["dragenter", "dragover"].forEach((t) => zone.addEventListener(t, (e) => { e.preventDefault(); zone.classList.add("survol"); }));
    ["dragleave", "drop"].forEach((t) => zone.addEventListener(t, () => zone.classList.remove("survol")));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) lireFichier(f);
    });
    $("#btn-recadrer").addEventListener("click", ouvrirRecadrage);

    // œuvres d'exemple : seulement en démonstration (?demo)
    $("#exemples").hidden = !new URLSearchParams(location.search).has("demo");
    $$("[data-exemple]").forEach((b) => b.addEventListener("click", () => {
      const ex = Exemples[b.dataset.exemple]();
      nouvelleSource(ex.canvas);
      choisirType(ex.type);
      etat.dims = Object.assign({}, ex.cm);
      $("#larg").value = ex.cm.l; $("#haut").value = ex.cm.h;
      majDimsAide();
    }));

    construireTypes();
    $("#larg").addEventListener("input", (e) => majDims("l", e.target.value));
    $("#haut").addEventListener("input", (e) => majDims("h", e.target.value));
    construirePreferences();
    $("#btn-voir").addEventListener("click", lancer);

    // étape 2
    $("#btn-plus-idees").addEventListener("click", () => { etat.vues = 6; cartes(); });
    $("#pp-cm").addEventListener("input", (e) => {
      etat.pp.cm = parseFloat(e.target.value); etat.pp.touche = true;
      $("#pp-cm-val").textContent = etat.pp.cm + " cm";
      redessiner();
    });
    $("#vitre").addEventListener("change", (e) => { etat.vitre = e.target.checked; redessinerScene(); });
    $("#btn-telecharger").addEventListener("click", telecharger);
    $("#btn-soumission").addEventListener("click", versDemande);
    $("#btn-soumission-mobile").addEventListener("click", versDemande);
    $("#lien-envies").addEventListener("click", () => {
      allerA(1);
      $("#envies").open = true;
      setTimeout(() => $("#envies").scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
    pastillesMur();

    // étape 3
    $("#retour-encadrements").addEventListener("click", () => allerA(2));
    $("#form-demande").addEventListener("submit", envoyerDemande);
    $("#nouvelle-oeuvre").addEventListener("click", nouvelleOeuvre);

    let minuterie;
    window.addEventListener("resize", () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => { if (etat.etape === 2 && etat.choix) redessinerScene(); }, 150);
    });
    brancherRecadrage();
    majEtapes();
  }

  // ---- Étapes ----------------------------------------------------------------
  function allerA(n) {
    if (n === 2 && !etat.resultat) return;
    if (n === 3 && !etat.choix) return;
    etat.etape = n;
    $$(".etape").forEach((s) => { s.hidden = +s.dataset.etape !== n; });
    majEtapes();
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (n === 2 && etat.choix) requestAnimationFrame(redessinerScene);
    if (n === 3) preparerDemande();
  }

  function majEtapes() {
    $$(".etapes-nav [data-aller]").forEach((b) => {
      const n = +b.dataset.aller;
      b.disabled = (n === 2 && !etat.resultat) || (n === 3 && !etat.choix);
      if (n === etat.etape) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      b.classList.toggle("fait", n < etat.etape);
    });
    const barre = etat.etape === 2 && !!etat.choix;
    $("#barre-mobile").hidden = !barre;
    document.body.classList.toggle("avec-barre", barre);
  }

  // ---- 1. Votre œuvre -------------------------------------------------------
  function lireFichier(f) {
    alerte("");
    if (!f.type.startsWith("image/")) { alerte("Ce fichier n'est pas une image."); return; }
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      // ramenée à 2400 px : assez pour un aperçu net, léger à manipuler
      const k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      nouvelleSource(c);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alerte("Le navigateur ne sait pas lire cette image (format HEIC ?). Essayez une photo en JPG ou PNG.");
    };
    img.src = url;
  }

  function nouvelleSource(canvas) {
    etat.source = canvas;
    etat.recadre = { x: 0, y: 0, l: canvas.width, h: canvas.height };
    etat.oeuvre = canvas;
    etat.dims = null;
    $("#larg").value = ""; $("#haut").value = "";
    oublierResultats();
    afficherZone();
    majDimsAide();
    $("#oeuvre-details").hidden = false;
  }

  // Une nouvelle œuvre, ou un nouveau type, rend les propositions caduques.
  function oublierResultats() {
    etat.resultat = null; etat.choix = null; etat.pp.touche = false;
    majEtapes();
  }

  function afficherZone() {
    const zone = $("#zone"), c = $("#apercu-oeuvre"), o = etat.oeuvre;
    zone.classList.add("pleine");
    $(".zone-vide", zone).hidden = true;
    $(".zone-image", zone).hidden = false;
    const dpr = window.devicePixelRatio || 1;
    const maxL = Math.min(560, zone.clientWidth - 32), maxH = 380;
    const k = Math.min(maxL / o.width, maxH / o.height);
    c.width = Math.round(o.width * k * dpr); c.height = Math.round(o.height * k * dpr);
    c.style.width = c.width / dpr + "px"; c.style.height = c.height / dpr + "px";
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(o, 0, 0, c.width, c.height);
  }

  function construireTypes() {
    const zone = $("#types");
    for (const t of TYPES) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.id = t.id; b.textContent = t.nom;
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => choisirType(t.id));
      zone.appendChild(b);
    }
  }

  function choisirType(id) {
    if (etat.type !== id && etat.resultat) oublierResultats();
    etat.type = id;
    $$("#types button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === id));
    $("#type-erreur").hidden = true;
  }

  function majDims(cote, brut) {
    const v = parseFloat(brut);
    const r = etat.oeuvre.width / etat.oeuvre.height;
    if (!(v > 0)) {
      etat.dims = null;
      $(cote === "l" ? "#haut" : "#larg").value = "";
    } else if (cote === "l") {
      etat.dims = { l: v, h: arrondi(v / r) }; $("#haut").value = etat.dims.h;
    } else {
      etat.dims = { l: arrondi(v * r), h: v }; $("#larg").value = etat.dims.l;
    }
    majDimsAide();
    if (etat.resultat) redessiner();
  }

  function majDimsAide() {
    $("#dims-aide").textContent = etat.dims
      ? "Les proportions de la photo sont conservées. Mesurez la partie visible de l'œuvre."
      : `Sans dimensions, l'aperçu suppose ${TAILLE_SUPPOSEE} cm sur le plus grand côté. Vous donnerez les mesures réelles dans la demande de soumission.`;
  }

  // ---- Envies (facultatives) -------------------------------------------------
  // Les choix viennent du catalogue (criteres) : le site, le serveur et la
  // fonction en ligne lisent le même vocabulaire.
  function construirePreferences() {
    const crit = etat.cat.criteres || {};
    $$("#envies .pref").forEach((bloc) => {
      const cle = bloc.dataset.critere, unique = bloc.hasAttribute("data-unique");
      const zone = $(".choix", bloc);
      for (const c of crit[cle] || []) {
        const b = document.createElement("button");
        b.type = "button"; b.dataset.id = c.id;
        b.setAttribute("aria-pressed", "false");
        let html = "";
        if (c.couleur) html += `<span class="teinte" style="background:${echapper(c.couleur)}"></span>`;
        if (bloc.hasAttribute("data-illustre"))
          html += `<span class="largeur-ex" style="border-width:${LARGEURS_EXEMPLE[c.id] || 3}px" aria-hidden="true"></span>`;
        html += echapper(c.nom);
        if (c.detail && cle === "presence") html += ` <span class="detail">${echapper(c.detail)}</span>`;
        b.innerHTML = html;
        b.addEventListener("click", () => {
          if (unique) etat.prefs[cle] = etat.prefs[cle] === c.id ? null : c.id;
          else {
            const liste = etat.prefs[cle], i = liste.indexOf(c.id);
            if (i >= 0) liste.splice(i, 1); else liste.push(c.id);
          }
          majPreferences();
        });
        zone.appendChild(b);
      }
    });
    const texte = $("#prefs-texte");
    texte.addEventListener("input", () => { etat.prefs.texte = texte.value; majPreferences(); });
    $("#prefs-effacer").addEventListener("click", () => {
      Object.assign(etat.prefs, { styles: [], teintes: [], presence: null, passe: null, budget: null, interieur: null, texte: "" });
      texte.value = "";
      majPreferences();
    });
    majPreferences();
  }

  function nbEnvies() {
    const p = etat.prefs;
    return p.styles.length + p.teintes.length + ["presence", "passe", "budget", "interieur"].filter((k) => p[k]).length + (p.texte.trim() ? 1 : 0);
  }

  function majPreferences() {
    const p = etat.prefs;
    $$("#envies .pref").forEach((bloc) => {
      const v = p[bloc.dataset.critere];
      $$(".choix button", bloc).forEach((b) =>
        b.setAttribute("aria-pressed", Array.isArray(v) ? v.includes(b.dataset.id) : v === b.dataset.id));
    });
    $("#prefs-compte").textContent = p.texte.length + " / 280";
    const n = nbEnvies();
    $("#prefs-effacer").hidden = !n;
    const badge = $("#envies-compte");
    badge.hidden = !n;
    badge.textContent = n === 1 ? "1 envie" : n + " envies";
  }

  // « Doré, Ancien · largeur fine · sans passe-partout » ; vide si rien n'est choisi.
  function resumePreferences() {
    const crit = etat.cat.criteres || {}, p = etat.prefs;
    const nom = (k, id) => ((crit[k] || []).find((c) => c.id === id) || {}).nom || id;
    const morceaux = [];
    const multi = [...p.styles.map((id) => nom("styles", id)), ...p.teintes.map((id) => nom("teintes", id))];
    if (multi.length) morceaux.push(multi.join(", "));
    if (p.presence) morceaux.push("largeur " + nom("presence", p.presence).toLowerCase());
    if (p.passe) morceaux.push(p.passe === "sans" ? "sans passe-partout" : "avec passe-partout");
    if (p.budget) morceaux.push("budget " + nom("budget", p.budget).toLowerCase());
    if (p.interieur) morceaux.push("pièce : " + nom("interieur", p.interieur).toLowerCase());
    if (p.texte.trim()) morceaux.push("« " + p.texte.trim() + " »");
    return morceaux.join(" · ");
  }

  // ---- Proposer --------------------------------------------------------------
  async function lancer() {
    if (!etat.oeuvre) return;
    if (!etat.type) {
      $("#type-erreur").hidden = false;
      $("#types").scrollIntoView({ behavior: "smooth", block: "center" });
      $("#types button").focus();
      return;
    }
    // l'étape 2 s'ouvre tout de suite : l'œuvre seule, et la progression par-dessus
    etat.resultat = { suggestions: [] };
    etat.choix = null;
    allerA(2);
    etat.resultat = null;
    majEtapes();
    $("#suggestions").innerHTML = ""; $("#suggestions-hors").innerHTML = "";
    $("#bloc-hors-budget").hidden = true; $("#btn-plus-idees").hidden = true;
    $("#avis").hidden = true; $("#lecture").textContent = "";
    oeuvreSeule();
    progression(1);
    $("#btn-voir").disabled = true;

    try {
      const prefs = JSON.parse(JSON.stringify(etat.prefs));
      prefs.texte = prefs.texte.trim();
      const res = await Suggestion.proposer(etat.cat, etat.oeuvre, etat.type, cmEffectifs(), etat.serveur, prefs);
      progression(2);
      etat.resultat = completer(res);
      organiser();
      progression(3);
      etat.choix = (etat.principaux[0] || etat.hors[0]).id;
      if (!etat.pp.touche) etat.pp.cm = Math.min(10, Math.max(4, arrondi(Math.max(cmEffectifs().l, cmEffectifs().h) * 0.1)));
      await Rendu.preparer(moulure(etat.choix));
      afficherResultats();
    } catch (e) {
      console.error(e);
      etat.resultat = null;
      $("#avis").hidden = false;
      $("#avis").innerHTML = "<p>Les suggestions n'ont pas pu être préparées.</p>" +
        '<div class="actions"><button type="button" class="secondaire" id="avis-reessayer">Réessayer</button></div>';
      $("#avis-reessayer").addEventListener("click", lancer);
    } finally {
      progression(0);
      $("#btn-voir").disabled = false;
      majEtapes();
    }
  }

  function progression(pas) {
    const boite = $("#chargement");
    boite.hidden = !pas;
    $$("li", boite).forEach((li) => {
      const n = +li.dataset.pas;
      li.classList.toggle("fait", n < pas);
      li.classList.toggle("encours", n === pas);
    });
  }

  function oeuvreSeule() {
    const c = $("#scene"), o = etat.oeuvre, dpr = window.devicePixelRatio || 1;
    const l = ($("#apercu-boite").clientWidth || 600) - 20, h = Math.min(560, window.innerHeight * 0.6);
    const k = Math.min(l / o.width, h / o.height);
    c.width = Math.round(o.width * k * dpr); c.height = Math.round(o.height * k * dpr);
    c.style.width = c.width / dpr + "px"; c.style.height = c.height / dpr + "px";
    c.getContext("2d").drawImage(o, 0, 0, c.width, c.height);
  }

  // Ne garde que les références compatibles du catalogue ; complète à six si besoin.
  function completer(res) {
    const vus = new Set();
    res.suggestions = (res.suggestions || []).filter((s) =>
      moulure(s.id) && Suggestion.compatible(moulure(s.id), etat.type) && !vus.has(s.id) && vus.add(s.id));
    if (res.suggestions.length < 6) {
      const local = Suggestion.choisirLocal(etat.cat, Suggestion.analyser(etat.oeuvre), etat.type, cmEffectifs(), etat.prefs);
      for (const s of local.suggestions) {
        if (res.suggestions.length === 6) break;
        if (!vus.has(s.id) && Suggestion.compatible(moulure(s.id), etat.type)) { res.suggestions.push(s); vus.add(s.id); }
      }
    }
    res.suggestions = res.suggestions.slice(0, 6);
    for (const s of res.suggestions) {
      if (!passe(s.passe_partout)) s.passe_partout = "aucun";
      // le choix du visiteur sur le passe-partout l'emporte, sauf là où il n'a pas de sens
      if (etat.prefs.passe === "sans" || etat.type === "toile" || flottant(moulure(s.id))) s.passe_partout = "aucun";
      else if (etat.prefs.passe === "avec" && s.passe_partout === "aucun") s.passe_partout = "blanc_casse";
    }
    return res;
  }

  // Dans le budget d'abord, trois familles distinctes en tête ; le reste à part.
  function organiser() {
    const max = budgetMax();
    const dans = etat.resultat.suggestions.filter((s) => moulure(s.id).gamme <= max);
    etat.hors = etat.resultat.suggestions.filter((s) => moulure(s.id).gamme > max);
    const vus = new Set(), tete = [], reste = [];
    for (const s of dans) {
      const f = moulure(s.id).famille;
      if (tete.length < 3 && !vus.has(f)) { vus.add(f); tete.push(s); } else reste.push(s);
    }
    etat.principaux = tete.concat(reste);
    etat.vues = 3;
  }

  // ---- 2. Vos encadrements --------------------------------------------------
  function afficherResultats() {
    const r = etat.resultat;
    const phrase = (r.lecture || "").split(/(?<=[.!?])\s+/)[0];
    $("#lecture").textContent = phrase;

    const avis = $("#avis"), morceaux = [];
    if (r.avertissement)
      morceaux.push("<p>L'analyse détaillée n'a pas abouti : ces suggestions sont établies d'après les couleurs de votre œuvre.</p>" +
        '<div class="actions"><button type="button" class="secondaire" data-action="reessayer">Réessayer</button></div>');
    if (etat.prefs.budget && !etat.principaux.length) {
      const liste = etat.cat.criteres.budget, i = liste.findIndex((b) => b.id === etat.prefs.budget);
      const suivant = liste[i + 1];
      morceaux.push(`<p>Aucun de nos cadres ne correspond à ce budget pour ce type d'œuvre.</p>` +
        (suivant ? `<div class="actions"><button type="button" class="secondaire" data-action="elargir" data-budget="${echapper(suivant.id)}">Élargir au budget « ${echapper(suivant.nom)} »</button></div>` : ""));
    }
    avis.innerHTML = morceaux.join("");
    avis.hidden = !morceaux.length;
    $$("[data-action=reessayer]", avis).forEach((b) => b.addEventListener("click", lancer));
    $$("[data-action=elargir]", avis).forEach((b) => b.addEventListener("click", () => {
      etat.prefs.budget = b.dataset.budget; majPreferences(); lancer();
    }));

    pastillesMur();
    choisir(etat.choix);
    cartes();
    majEtapes();
  }

  function cartes() {
    const zone = $("#suggestions");
    zone.innerHTML = "";
    etat.principaux.slice(0, etat.vues).forEach((s) => zone.appendChild(carte(s, false)));
    $("#btn-plus-idees").hidden = etat.principaux.length <= etat.vues;

    const hors = $("#suggestions-hors");
    hors.innerHTML = "";
    etat.hors.forEach((s) => hors.appendChild(carte(s, true)));
    $("#bloc-hors-budget").hidden = !etat.hors.length;
    marquerChoix();
  }

  function carte(s, auDela) {
    const m = moulure(s.id);
    const b = document.createElement("button");
    b.type = "button"; b.className = "carte"; b.dataset.id = m.id;
    const badge = auDela ? `<span class="badge-gamme">Gamme ${echapper(GAMMES[m.gamme].toLowerCase())}, au-delà de votre budget</span>` : "";
    b.innerHTML = `<div class="carte-vue"><canvas></canvas></div>
      <div><h3>${echapper(m.nom)}</h3><p>${echapper(s.raison)}</p>${badge}<span class="etat-choisi">✓ Sélectionné</span></div>`;
    b.addEventListener("click", () => choisir(m.id));
    const ppId = etat.pp.touche ? etat.pp.id : s.passe_partout;
    rendre($("canvas", b), m, optionsRendu(m, { l: 220, h: 180 }, ppId, etat.mur));
    return b;
  }

  function marquerChoix() {
    $$(".carte, .echantillon").forEach((c) => c.setAttribute("aria-pressed", c.dataset.id === etat.choix));
  }

  function choisir(id) {
    etat.choix = id;
    const m = moulure(id), s = suggestion(id);
    if (!etat.pp.touche) {
      if (s) etat.pp.id = s.passe_partout;
      else etat.pp.id = etat.type === "toile" || etat.prefs.passe === "sans" ? "aucun" : "blanc_casse";
    }
    if (etat.type === "toile" || flottant(m)) etat.pp.id = "aucun";
    marquerChoix();
    reglages();
    redessinerScene();
    majEtapes();
  }

  function reglages() {
    const m = moulure(etat.choix);
    const sansPP = etat.type === "toile" || flottant(m);
    // ce qui n'a pas de sens pour ce cadre n'est pas montré
    $("#reglage-pp").hidden = sansPP;
    $("#reglage-pp-cm").hidden = sansPP || etat.pp.id === "aucun";
    $("#reglage-vitre").hidden = flottant(m);
    $("#note-flottant").hidden = !flottant(m);
    $("#pp-cm").value = etat.pp.cm;
    $("#pp-cm-val").textContent = etat.pp.cm + " cm";
    $("#vitre").checked = etat.vitre;

    const zone = $("#pp-choix");
    zone.innerHTML = "";
    for (const p of etat.cat.passe_partout) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.id = p.id;
      b.setAttribute("aria-pressed", p.id === etat.pp.id);
      b.innerHTML = (p.couleur ? `<span class="teinte" style="background:${echapper(p.couleur)}"></span>` : "") +
        echapper(p.id === "aucun" ? "Aucun" : p.nom);
      b.addEventListener("click", () => { etat.pp.id = p.id; etat.pp.touche = true; reglages(); redessiner(); });
      zone.appendChild(b);
    }

    const cm = cmEffectifs();
    $("#note-dims").textContent = etat.dims
      ? `Dimensions indiquées : ${String(cm.l).replace(".", ",")} × ${String(cm.h).replace(".", ",")} cm.`
      : `Taille supposée : ${TAILLE_SUPPOSEE} cm sur le plus grand côté, à préciser dans la demande.`;

    const lignes = [
      ["Référence", m.id], ["Finition", m.finition], ["Matière", m.matiere],
      ["Largeur", String(m.largeur_cm).replace(".", ",") + " cm"], ["Style", m.style],
      ["Gamme", (GAMMES[m.gamme] || "—") + " (indicative)"]
    ];
    if (m.photo) lignes.push(["Photo du modèle", m.photo]);
    $("#fiche").innerHTML = `<dt>Cadre</dt><dd>${echapper(m.nom)}</dd>` +
      lignes.map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join("") +
      `<dt>Description</dt><dd>${echapper(m.description)}</dd>`;
  }

  function pastillesMur() {
    const zone = $("#mur-choix");
    zone.innerHTML = "";
    for (const w of MURS) {
      const b = document.createElement("button");
      b.type = "button";
      b.style.background = w.couleur;
      b.title = w.nom; b.setAttribute("aria-label", "Mur " + w.nom);
      b.setAttribute("aria-pressed", w.couleur === etat.mur);
      b.addEventListener("click", () => {
        etat.mur = w.couleur;
        $$("button", zone).forEach((x) => x.setAttribute("aria-pressed", x === b));
        redessiner();
      });
      zone.appendChild(b);
    }
  }

  function optionsRendu(m, boite, ppId, mur) {
    const p = passe(ppId);
    return {
      oeuvre: etat.oeuvre,
      oeuvreCm: cmEffectifs(),
      moulure: m,
      passe: p && p.id !== "aucun" ? { couleur: p.couleur, ame: p.ame, cm: etat.pp.cm } : null,
      mur,
      vitre: etat.vitre && !flottant(m),
      boite
    };
  }

  async function rendre(canvas, m, o) {
    try {
      await Rendu.preparer(m);
      Rendu.dessiner(canvas, o);
    } catch (e) {
      console.error(e);
      canvas.width = 300; canvas.height = 200;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#eee"; ctx.fillRect(0, 0, 300, 200);
      ctx.fillStyle = "#900"; ctx.font = "14px sans-serif";
      ctx.fillText("Cadre indisponible", 20, 100);
    }
  }

  function redessinerScene() {
    if (!etat.choix) return;
    const m = moulure(etat.choix);
    const l = ($("#apercu-boite").clientWidth || 700) - 20;
    const h = Math.min(680, Math.max(320, window.innerHeight * 0.68));
    rendre($("#scene"), m, optionsRendu(m, { l, h }, etat.pp.id, etat.mur));
  }

  function redessiner() {
    redessinerScene();
    if (etat.resultat) cartes();
    if ($(".catalogue").open) catalogue();
  }

  // Seulement les cadres compatibles avec le type d'œuvre.
  function catalogue() {
    const zone = $("#catalogue");
    zone.innerHTML = "";
    const fond = document.createElement("canvas");
    fond.width = 160; fond.height = 120;
    const g = fond.getContext("2d");
    g.fillStyle = "#cfcac0"; g.fillRect(0, 0, 160, 120);
    for (const m of etat.cat.moulures.filter((x) => Suggestion.compatible(x, etat.type))) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "echantillon"; b.dataset.id = m.id;
      b.setAttribute("aria-pressed", m.id === etat.choix);
      const auDela = m.gamme > budgetMax() ? " · au-delà du budget" : "";
      b.innerHTML = `<canvas></canvas><strong>${echapper(m.nom)}</strong><span>${String(m.largeur_cm).replace(".", ",")} cm · ${echapper(GAMMES[m.gamme].toLowerCase())}${auDela}</span>`;
      b.addEventListener("click", () => choisir(m.id));
      zone.appendChild(b);
      rendre($("canvas", b), m, { oeuvre: fond, oeuvreCm: { l: 14, h: 10 }, moulure: m, passe: null, mur: null, vitre: false, boite: { l: 140, h: 100 } });
    }
  }
  document.addEventListener("toggle", (e) => {
    if (e.target.classList && e.target.classList.contains("catalogue") && e.target.open) catalogue();
  }, true);

  async function telecharger() {
    const m = moulure(etat.choix);
    const c = document.createElement("canvas");
    await rendre(c, m, Object.assign(optionsRendu(m, { l: 2400, h: 2400 }, etat.pp.id, etat.mur), { dpr: 1 }));
    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `apercu-encadrement-${m.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  // ---- 3. Votre demande ------------------------------------------------------
  function versDemande() { allerA(3); }

  function lignesResume() {
    const m = moulure(etat.choix), p = passe(etat.pp.id), cm = cmEffectifs();
    const sansPP = etat.type === "toile" || flottant(m);
    return [
      ["Œuvre", nomType(etat.type)],
      ["Dimensions", etat.dims ? `${String(cm.l).replace(".", ",")} × ${String(cm.h).replace(".", ",")} cm` : "à préciser"],
      ["Cadre", `${m.nom} (réf. ${m.id})`],
      ["Passe-partout", sansPP || !p || p.id === "aucun" ? "aucun" : `${p.nom}, ${String(etat.pp.cm).replace(".", ",")} cm`],
      ["Verre", flottant(m) ? "aucun (caisse américaine)" : "à confirmer avec l'atelier"],
      ["Vos envies", resumePreferences() || "aucune précision"]
    ];
  }

  function preparerDemande() {
    const m = moulure(etat.choix);
    rendre($("#miniature"), m, optionsRendu(m, { l: 320, h: 300 }, etat.pp.id, etat.mur));
    $("#resume").innerHTML = lignesResume().map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join("");
    $("#d-larg").value = etat.dims ? etat.dims.l : "";
    $("#d-haut").value = etat.dims ? etat.dims.h : "";
    $("#form-demande").hidden = false;
    $("#confirmation").hidden = true;
  }

  function envoyerDemande(e) {
    e.preventDefault();
    const f = e.target;
    $$("input", f).forEach((i) => i.setAttribute("aria-invalid", !i.checkValidity()));
    if (!f.reportValidity()) return;
    const l = parseFloat(f.largeur.value), h = parseFloat(f.hauteur.value);
    etat.dims = { l, h };
    $("#larg").value = l; $("#haut").value = h;
    majDimsAide();
    $("#resume").innerHTML = lignesResume().map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join("");
    $("#confirmation-texte").textContent =
      `${f.nom.value.trim()}, votre demande pour « ${moulure(etat.choix).nom} » sur une œuvre de ${String(l).replace(".", ",")} × ${String(h).replace(".", ",")} cm est complète. L'atelier vous répondra à ${f.courriel.value.trim()}.`;
    f.hidden = true;
    const conf = $("#confirmation");
    conf.hidden = false;
    conf.focus();
    conf.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function nouvelleOeuvre() {
    $("#form-demande").reset();
    etat.source = etat.oeuvre = null;
    etat.dims = null; etat.type = null;
    oublierResultats();
    $$("#types button").forEach((b) => b.setAttribute("aria-pressed", "false"));
    const zone = $("#zone");
    zone.classList.remove("pleine");
    $(".zone-vide", zone).hidden = false;
    $(".zone-image", zone).hidden = true;
    $("#oeuvre-details").hidden = true;
    allerA(1);
  }

  // ---- Recadrage -------------------------------------------------------------
  const rc = { k: 1, cadre: null, glisse: null };

  function ouvrirRecadrage() {
    $("#recadrage").hidden = false;
    const s = etat.source, c = $("#rc-canvas");
    const maxL = Math.min(900, window.innerWidth - 72), maxH = window.innerHeight * 0.62;
    rc.k = Math.min(maxL / s.width, maxH / s.height, 1);
    c.width = Math.round(s.width * rc.k); c.height = Math.round(s.height * rc.k);
    c.getContext("2d").drawImage(s, 0, 0, c.width, c.height);
    rc.cadre = Object.assign({}, etat.recadre);
    placerCadre();
  }

  function placerCadre() {
    const d = $("#rc-cadre"), f = rc.cadre, k = rc.k;
    d.style.left = f.x * k + "px"; d.style.top = f.y * k + "px";
    d.style.width = f.l * k + "px"; d.style.height = f.h * k + "px";
  }

  function brancherRecadrage() {
    const cadre = $("#rc-cadre"), mini = 40;
    cadre.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      cadre.setPointerCapture(e.pointerId);
      rc.glisse = { coin: e.target.dataset.coin || "tout", x: e.clientX, y: e.clientY, depart: Object.assign({}, rc.cadre) };
    });
    cadre.addEventListener("pointermove", (e) => {
      if (!rc.glisse) return;
      const g = rc.glisse, s = etat.source;
      const dx = (e.clientX - g.x) / rc.k, dy = (e.clientY - g.y) / rc.k;
      const f = Object.assign({}, g.depart);
      if (g.coin === "tout") {
        f.x = Math.max(0, Math.min(s.width - f.l, f.x + dx));
        f.y = Math.max(0, Math.min(s.height - f.h, f.y + dy));
      } else {
        let x0 = f.x, y0 = f.y, x1 = f.x + f.l, y1 = f.y + f.h;
        if (g.coin.includes("g")) x0 = Math.max(0, Math.min(x1 - mini, x0 + dx));
        if (g.coin.includes("d")) x1 = Math.min(s.width, Math.max(x0 + mini, x1 + dx));
        if (g.coin[0] === "h") y0 = Math.max(0, Math.min(y1 - mini, y0 + dy));
        if (g.coin[0] === "b") y1 = Math.min(s.height, Math.max(y0 + mini, y1 + dy));
        Object.assign(f, { x: x0, y: y0, l: x1 - x0, h: y1 - y0 });
      }
      rc.cadre = f;
      placerCadre();
    });
    const fin = () => { rc.glisse = null; };
    cadre.addEventListener("pointerup", fin);
    cadre.addEventListener("pointercancel", fin);

    $("#rc-annuler").addEventListener("click", () => { $("#recadrage").hidden = true; });
    $("#rc-tout").addEventListener("click", () => {
      rc.cadre = { x: 0, y: 0, l: etat.source.width, h: etat.source.height };
      placerCadre();
    });
    $("#rc-appliquer").addEventListener("click", () => {
      const f = rc.cadre, s = etat.source;
      const c = document.createElement("canvas");
      c.width = Math.round(f.l); c.height = Math.round(f.h);
      c.getContext("2d").drawImage(s, f.x, f.y, f.l, f.h, 0, 0, c.width, c.height);
      etat.recadre = f;
      etat.oeuvre = c;
      $("#recadrage").hidden = true;
      if (etat.dims) majDims("l", etat.dims.l);
      afficherZone();
      if (etat.resultat) redessiner();
    });
  }

  demarrer();
})();
