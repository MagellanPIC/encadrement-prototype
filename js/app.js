/* Interface : dépôt → œuvre → six propositions → essayage. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const MURS = [
    { nom: "Blanc", couleur: "#efece6" },
    { nom: "Gris clair", couleur: "#d8d5cf" },
    { nom: "Sauge", couleur: "#a7b39f" },
    { nom: "Terre cuite", couleur: "#c99474" },
    { nom: "Bleu nuit", couleur: "#2d3a4e" },
    { nom: "Anthracite", couleur: "#3b3a38" }
  ];
  const TYPES = {
    toile: "Peinture sur toile", papier: "Œuvre sur papier", photo: "Photographie", affiche: "Affiche ou reproduction"
  };

  const etat = {
    cat: null,
    serveur: { ia: false },
    source: null,       // photo d'origine (canvas)
    recadre: null,      // {x, y, l, h} dans la source
    oeuvre: null,       // canvas recadré
    type: "toile",
    cm: { l: 50, h: 50 },
    resultat: null,
    choix: null,
    pp: { id: "blanc_casse", cm: 6, touche: false },
    mur: MURS[0].couleur,
    vitre: true,
    // goûts du visiteur : tout est facultatif
    prefs: { styles: [], teintes: [], presence: null, passe: null, budget: null, interieur: null, texte: "" }
  };

  const moulure = (id) => etat.cat.moulures.find((m) => m.id === id);
  const passe = (id) => etat.cat.passe_partout.find((p) => p.id === id);
  const suggestion = (id) => (etat.resultat ? etat.resultat.suggestions.find((s) => s.id === id) : null);
  const arrondi = (v) => Math.round(v * 2) / 2;
  // Tout texte venu de l'IA ou du visiteur passe par ici avant d'entrer dans le HTML.
  const echapper = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GAMMES = { 1: "Économique", 2: "Intermédiaire", 3: "Haut de gamme" };

  function alerte(texte) {
    const a = $("#alerte");
    a.textContent = texte;
    a.hidden = !texte;
  }

  // ---- Chargement ------------------------------------------------------------
  async function demarrer() {
    try {
      const r = await fetch("catalogue.json", { cache: "no-store" });
      etat.cat = await r.json();
    } catch (e) {
      alerte("Le catalogue ne se charge pas. Lancez le prototype avec « python server.py » puis ouvrez http://localhost:8765.");
      return;
    }
    etat.serveur = await Suggestion.etatServeur();
    brancher();
  }

  function brancher() {
    const fichier = $("#fichier"), depot = $("#depot");
    fichier.addEventListener("change", () => fichier.files[0] && lireFichier(fichier.files[0]));
    ["dragenter", "dragover"].forEach((t) => depot.addEventListener(t, (e) => { e.preventDefault(); depot.classList.add("survol"); }));
    ["dragleave", "drop"].forEach((t) => depot.addEventListener(t, () => depot.classList.remove("survol")));
    depot.addEventListener("drop", (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) lireFichier(f);
    });
    document.querySelectorAll("[data-exemple]").forEach((b) =>
      b.addEventListener("click", () => {
        const ex = Exemples[b.dataset.exemple]();
        nouvelleSource(ex.canvas, ex.type, ex.cm);
      }));

    $("#type").addEventListener("change", (e) => { etat.type = e.target.value; etat.vitre = etat.type !== "toile"; });
    $("#larg").addEventListener("input", (e) => majDims("l", parseFloat(e.target.value)));
    $("#haut").addEventListener("input", (e) => majDims("h", parseFloat(e.target.value)));
    $("#btn-proposer").addEventListener("click", proposer);
    construirePreferences();
    $("#btn-changer").addEventListener("click", () => fichier.click());
    $("#btn-recadrer").addEventListener("click", ouvrirRecadrage);

    $("#pp-cm").addEventListener("input", (e) => {
      etat.pp.cm = parseFloat(e.target.value); etat.pp.touche = true;
      $("#pp-cm-val").textContent = etat.pp.cm + " cm";
      redessiner();
    });
    $("#vitre").addEventListener("change", (e) => { etat.vitre = e.target.checked; redessinerScene(); });
    $("#btn-telecharger").addEventListener("click", telecharger);
    $("#btn-soumission").addEventListener("click", soumission);

    let minuterie;
    window.addEventListener("resize", () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(() => etat.choix && redessinerScene(), 150);
    });
    brancherRecadrage();
  }

  // ---- Photo -----------------------------------------------------------------
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
      nouvelleSource(c, null, null);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      alerte("Le navigateur ne sait pas lire cette image (format HEIC ?). Essayez une photo en JPG ou PNG.");
    };
    img.src = url;
  }

  function nouvelleSource(canvas, type, cm) {
    etat.source = canvas;
    etat.recadre = { x: 0, y: 0, l: canvas.width, h: canvas.height };
    etat.oeuvre = canvas;
    if (type) { etat.type = type; $("#type").value = type; }
    etat.vitre = etat.type !== "toile";
    if (cm) etat.cm = Object.assign({}, cm);
    else {
      const r = canvas.width / canvas.height;
      etat.cm = r >= 1 ? { l: 50, h: arrondi(50 / r) } : { l: arrondi(50 * r), h: 50 };
    }
    etat.resultat = null; etat.choix = null; etat.pp.touche = false;
    $("#larg").value = etat.cm.l; $("#haut").value = etat.cm.h;
    apercuOeuvre();
    $("#etape-oeuvre").hidden = false;
    $("#etape-resultats").hidden = true;
    $("#etape-oeuvre").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function apercuOeuvre() {
    const c = $("#apercu-oeuvre"), o = etat.oeuvre;
    const dpr = window.devicePixelRatio || 1;
    const k = Math.min(420 / o.width, 420 / o.height);
    c.width = Math.round(o.width * k * dpr); c.height = Math.round(o.height * k * dpr);
    c.style.width = c.width / dpr + "px"; c.style.height = c.height / dpr + "px";
    const ctx = c.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(o, 0, 0, c.width, c.height);
  }

  function majDims(cote, v) {
    if (!(v > 0)) return;
    const r = etat.oeuvre.width / etat.oeuvre.height;
    if (cote === "l") { etat.cm.l = v; etat.cm.h = arrondi(v / r); $("#haut").value = etat.cm.h; }
    else { etat.cm.h = v; etat.cm.l = arrondi(v * r); $("#larg").value = etat.cm.l; }
    if (etat.resultat) redessiner();
  }

  // ---- Goûts du visiteur -----------------------------------------------------
  // Les choix possibles viennent du catalogue (criteres) : le site, le serveur
  // et la fonction en ligne lisent le même vocabulaire.
  function construirePreferences() {
    const crit = etat.cat.criteres || {};
    document.querySelectorAll("#preferences .pref").forEach((bloc) => {
      const cle = bloc.dataset.critere, unique = bloc.hasAttribute("data-unique");
      const zone = bloc.querySelector(".choix");
      for (const c of crit[cle] || []) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.id = c.id;
        b.setAttribute("aria-pressed", "false");
        b.innerHTML = (c.couleur ? `<span class="teinte" style="background:${echapper(c.couleur)}"></span>` : "") + echapper(c.nom);
        b.addEventListener("click", () => {
          if (unique) {
            etat.prefs[cle] = etat.prefs[cle] === c.id ? null : c.id;
          } else {
            const liste = etat.prefs[cle];
            const i = liste.indexOf(c.id);
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
  }

  function majPreferences() {
    const p = etat.prefs;
    document.querySelectorAll("#preferences .pref").forEach((bloc) => {
      const v = p[bloc.dataset.critere];
      bloc.querySelectorAll(".choix button").forEach((b) =>
        b.setAttribute("aria-pressed", Array.isArray(v) ? v.includes(b.dataset.id) : v === b.dataset.id));
    });
    $("#prefs-compte").textContent = p.texte.length + " / 280";
    $("#prefs-effacer").hidden = !resumePreferences();
  }

  // « Doré, classique · discret · sans passe-partout » ; vide si rien n'est choisi.
  function resumePreferences() {
    const crit = etat.cat.criteres || {}, p = etat.prefs;
    const nom = (k, id) => ((crit[k] || []).find((c) => c.id === id) || {}).nom || id;
    const morceaux = [];
    const multi = [...p.styles.map((id) => nom("styles", id)), ...p.teintes.map((id) => nom("teintes", id))];
    if (multi.length) morceaux.push(multi.join(", "));
    if (p.presence) morceaux.push(nom("presence", p.presence).toLowerCase());
    if (p.passe) morceaux.push(p.passe === "sans" ? "sans passe-partout" : "avec passe-partout");
    if (p.budget) morceaux.push("budget " + nom("budget", p.budget).toLowerCase());
    if (p.interieur) morceaux.push("pièce : " + nom("interieur", p.interieur).toLowerCase());
    if (p.texte.trim()) morceaux.push("« " + p.texte.trim() + " »");
    return morceaux.join(" · ");
  }

  // ---- Propositions ----------------------------------------------------------
  async function proposer() {
    const btn = $("#btn-proposer");
    btn.disabled = true;
    btn.innerHTML = '<span class="attente-texte">' + (etat.serveur.ia ? "L'IA regarde votre œuvre…" : "Analyse de votre œuvre…") + "</span>";
    $("#etape-resultats").hidden = false;
    $("#grille").innerHTML = '<div class="carte attente"><div class="carte-vue"></div></div>'.repeat(6);
    try {
      const prefs = JSON.parse(JSON.stringify(etat.prefs));
      prefs.texte = prefs.texte.trim();
      const res = await Suggestion.proposer(etat.cat, etat.oeuvre, etat.type, etat.cm, etat.serveur, prefs);
      etat.resultat = completer(res);
      afficherResultats();
    } finally {
      btn.disabled = false;
      btn.textContent = "Proposer six cadres";
    }
  }

  // Ne garde que les références du catalogue ; complète à six si besoin.
  function completer(res) {
    const vus = new Set();
    res.suggestions = (res.suggestions || []).filter((s) => moulure(s.id) && !vus.has(s.id) && vus.add(s.id));
    if (res.suggestions.length < 6) {
      const local = Suggestion.choisirLocal(etat.cat, Suggestion.analyser(etat.oeuvre), etat.type, etat.cm, etat.prefs);
      for (const s of local.suggestions) {
        if (res.suggestions.length === 6) break;
        if (!vus.has(s.id)) { res.suggestions.push(s); vus.add(s.id); }
      }
    }
    res.suggestions = res.suggestions.slice(0, 6);
    for (const s of res.suggestions) {
      if (!passe(s.passe_partout)) s.passe_partout = "aucun";
      // le choix du visiteur sur le passe-partout l'emporte, sauf là où il n'a pas de sens
      const sansPP = etat.type === "toile" || moulure(s.id).famille === "caisse_americaine";
      if (etat.prefs.passe === "sans" || sansPP) s.passe_partout = "aucun";
      else if (etat.prefs.passe === "avec" && s.passe_partout === "aucun") s.passe_partout = "blanc_casse";
    }
    res.palette = (res.palette || []).filter((c) => /^#[0-9a-fA-F]{6}$/.test(String(c)));
    return res;
  }

  function afficherResultats() {
    const r = etat.resultat;
    $("#lecture").textContent = r.lecture || "";
    $("#palette").innerHTML = (r.palette || []).map((c) => `<span style="background:${echapper(c)}" title="${echapper(c)}"></span>`).join("");
    const mode = $("#mode");
    mode.classList.toggle("repli", !!r.avertissement);
    mode.textContent = r.avertissement
      ? r.avertissement
      : r.mode === "ia"
        ? `Suggestions faites par l'IA (${r.modele}) à partir de votre photo.`
        : "Mode démonstration : suggestions faites par une analyse locale des couleurs, sans IA.";
    const gouts = $("#gouts"), resume = resumePreferences();
    gouts.hidden = !resume;
    if (resume) {
      const crit = etat.cat.criteres || {};
      const lus = (r.motsCompris || []).map((id) =>
        ((crit.teintes || []).concat(crit.styles || [], crit.presence || [], crit.budget || []).find((c) => c.id === id) || {}).nom || id);
      gouts.innerHTML = "Selon vos goûts : " + echapper(resume) +
        (lus.length ? ` <span class="mode">(mots retenus dans votre texte : ${echapper(lus.join(", ").toLowerCase())})</span>` : "") +
        ' <a href="#preferences">Modifier</a>';
    }

    const long = Math.max(etat.cm.l, etat.cm.h);
    if (!etat.pp.touche) etat.pp.cm = Math.min(10, Math.max(4, arrondi(long * 0.1)));
    $("#pp-cm").value = etat.pp.cm;
    $("#pp-cm-val").textContent = etat.pp.cm + " cm";
    pastillesMur();
    choisir(r.suggestions[0].id, true);
    grille();
    catalogue();
    $("#etape-resultats").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function choisir(id, depuisSuggestion) {
    etat.choix = id;
    const s = suggestion(id);
    if (s && !etat.pp.touche) etat.pp.id = s.passe_partout;
    if (!s && !etat.pp.touche && depuisSuggestion === false)
      etat.pp.id = etat.type === "toile" || etat.prefs.passe === "sans" ? "aucun" : "blanc_casse";
    document.querySelectorAll(".carte, .echantillon").forEach((c) => c.setAttribute("aria-pressed", c.dataset.id === id));
    panneau();
    redessinerScene();
  }

  function optionsRendu(m, boite, ppId, mur) {
    const p = passe(ppId);
    return {
      oeuvre: etat.oeuvre,
      oeuvreCm: etat.cm,
      moulure: m,
      passe: p && p.id !== "aucun" ? { couleur: p.couleur, ame: p.ame, cm: etat.pp.cm } : null,
      mur,
      vitre: etat.vitre,
      boite
    };
  }

  async function rendre(canvas, m, o) {
    try {
      await Rendu.preparer(m);
      Rendu.dessiner(canvas, o);
    } catch (e) {
      console.error(e);
      const ctx = canvas.getContext("2d");
      canvas.width = 300; canvas.height = 200;
      ctx.fillStyle = "#eee"; ctx.fillRect(0, 0, 300, 200);
      ctx.fillStyle = "#900"; ctx.font = "14px sans-serif";
      ctx.fillText("Cadre indisponible", 20, 100);
    }
  }

  function redessinerScene() {
    const m = moulure(etat.choix);
    const boite = $("#scene-boite");
    const l = boite.clientWidth || 800;
    const h = Math.min(760, Math.max(360, window.innerHeight * 0.72));
    rendre($("#scene"), m, optionsRendu(m, { l, h }, etat.pp.id, etat.mur));
  }

  function redessiner() {
    redessinerScene();
    grille();
  }

  function panneau() {
    const m = moulure(etat.choix), s = suggestion(m.id);
    const rang = s ? etat.resultat.suggestions.indexOf(s) + 1 : 0;
    $("#choix-ref").textContent = (rang ? `Proposition ${rang} · ` : "Catalogue · ") + "Réf. " + m.id;
    $("#choix-nom").textContent = m.nom;
    $("#choix-desc").textContent = m.description;
    $("#choix-raison").textContent = s ? s.raison : "";
    $("#choix-fiche").innerHTML = [
      ["Finition", m.finition], ["Matière", m.matiere], ["Largeur", String(m.largeur_cm).replace(".", ",") + " cm"],
      ["Style", m.style], ["Gamme", GAMMES[m.gamme] || "—"]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join("");

    const flottant = m.famille === "caisse_americaine";
    $("#pp-note").hidden = !flottant;
    $("#pp-cm").disabled = flottant || etat.pp.id === "aucun";
    $("#pp-choix").innerHTML = "";
    for (const p of etat.cat.passe_partout) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pastille" + (p.id === "aucun" ? " aucun" : "");
      if (p.couleur) b.style.background = p.couleur;
      b.title = p.nom; b.setAttribute("aria-label", "Passe-partout : " + p.nom);
      b.setAttribute("aria-pressed", !flottant && p.id === etat.pp.id);
      b.disabled = flottant;
      b.addEventListener("click", () => {
        etat.pp.id = p.id; etat.pp.touche = true;
        panneau(); redessiner();
      });
      $("#pp-choix").appendChild(b);
    }
    const v = $("#vitre");
    v.checked = etat.vitre && !flottant;
    v.disabled = flottant;
  }

  function pastillesMur() {
    const zone = $("#mur-choix");
    zone.innerHTML = "";
    for (const w of MURS) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "pastille";
      b.style.background = w.couleur;
      b.title = w.nom; b.setAttribute("aria-label", "Mur : " + w.nom);
      b.setAttribute("aria-pressed", w.couleur === etat.mur);
      b.addEventListener("click", () => {
        etat.mur = w.couleur;
        zone.querySelectorAll(".pastille").forEach((x) => x.setAttribute("aria-pressed", x === b));
        redessiner();
      });
      zone.appendChild(b);
    }
  }

  function grille() {
    const zone = $("#grille");
    zone.innerHTML = "";
    etat.resultat.suggestions.forEach((s, i) => {
      const m = moulure(s.id);
      const b = document.createElement("button");
      b.type = "button"; b.className = "carte"; b.dataset.id = m.id;
      b.setAttribute("aria-pressed", m.id === etat.choix);
      b.innerHTML = `<div class="carte-vue"><canvas></canvas></div>
        <span class="carte-rang">Proposition ${i + 1}</span>
        <h4>${echapper(m.nom)}</h4><p>${echapper(s.raison)}</p>`;
      b.addEventListener("click", () => choisir(m.id, true));
      zone.appendChild(b);
      const vue = b.querySelector(".carte-vue");
      const ppId = etat.pp.touche ? etat.pp.id : s.passe_partout;
      rendre(b.querySelector("canvas"), m, optionsRendu(m, { l: vue.clientWidth || 300, h: vue.clientHeight || 225 }, ppId, etat.mur));
    });
  }

  function catalogue() {
    const zone = $("#catalogue");
    zone.innerHTML = "";
    const echantillon = document.createElement("canvas");
    echantillon.width = 160; echantillon.height = 120;
    const g = echantillon.getContext("2d");
    g.fillStyle = "#cfcac0"; g.fillRect(0, 0, 160, 120);
    for (const m of etat.cat.moulures) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "echantillon"; b.dataset.id = m.id;
      b.setAttribute("aria-pressed", m.id === etat.choix);
      b.innerHTML = `<canvas></canvas><strong>${echapper(m.nom)}</strong><span>${echapper(m.id)} · ${String(m.largeur_cm).replace(".", ",")} cm</span>`;
      b.addEventListener("click", () => choisir(m.id, false));
      zone.appendChild(b);
      rendre(b.querySelector("canvas"), m, {
        oeuvre: echantillon, oeuvreCm: { l: 14, h: 10 }, moulure: m, passe: null, mur: null, vitre: false, boite: { l: 150, h: 110 }
      });
    }
  }

  // ---- Sorties ---------------------------------------------------------------
  async function telecharger() {
    const m = moulure(etat.choix);
    const c = document.createElement("canvas");
    await rendre(c, m, Object.assign(optionsRendu(m, { l: 2400, h: 2400 }, etat.pp.id, etat.mur), { dpr: 1 }));
    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `encadrement-${m.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  function soumission() {
    const m = moulure(etat.choix), p = passe(etat.pp.id);
    const flottant = m.famille === "caisse_americaine";
    const lignes = [
      ["Œuvre", `${TYPES[etat.type]}, ${etat.cm.l} × ${etat.cm.h} cm`],
      ["Moulure", `${m.nom} (réf. ${m.id})`],
      ["Passe-partout", flottant || p.id === "aucun" ? "aucun" : `${p.nom}, ${etat.pp.cm} cm`],
      ["Verre", etat.vitre && !flottant ? "oui" : "non"],
      ["Vos goûts", resumePreferences() || "laissés à l'IA"]
    ];
    $("#soumission-resume").innerHTML = lignes.map(([k, v]) => `<dt>${k}</dt><dd>${echapper(v)}</dd>`).join("");
    $("#soumission").showModal();
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
    const scene = $("#rc-scene"), cadre = $("#rc-cadre");
    const mini = 40;
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
    void scene;

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
      majDims("l", etat.cm.l);
      apercuOeuvre();
      if (etat.resultat) { redessiner(); catalogue(); }
    });
  }

  demarrer();
})();
