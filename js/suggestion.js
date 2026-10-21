/* Suggestion de six moulures.
   1) Par l'IA quand le serveur a une clé OpenAI (/api/suggest) : server.py
      en local, la fonction Cloudflare (window.BASE_IA) sur GitHub Pages.
   2) Sinon, par une analyse locale des couleurs de l'œuvre : gratuite,
      instantanée, et étiquetée comme telle dans l'interface. */
(function () {
  "use strict";

  // ---- Lecture des couleurs de l'œuvre ---------------------------------------
  function pixels(source, cote) {
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const k = cote / Math.max(sw, sh);
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
    const ctx = c.getContext("2d");
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  }

  function hsv(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  // k-moyennes sur 64×64 px : 5 couleurs dominantes et leur part.
  function palette(d, k) {
    const pts = [];
    for (let i = 0; i < d.length; i += 4) pts.push([d[i], d[i + 1], d[i + 2]]);
    pts.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
    let centres = [];
    for (let j = 0; j < k; j++) centres.push(pts[Math.floor(((j + 0.5) / k) * pts.length)].slice());
    let affect = new Array(pts.length).fill(0);
    for (let it = 0; it < 12; it++) {
      const somme = centres.map(() => [0, 0, 0, 0]);
      pts.forEach((p, i) => {
        let best = 0, bd = Infinity;
        centres.forEach((c, j) => {
          const dd = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
          if (dd < bd) { bd = dd; best = j; }
        });
        affect[i] = best;
        const s = somme[best]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      });
      centres = somme.map((s, j) => (s[3] ? [s[0] / s[3], s[1] / s[3], s[2] / s[3]] : centres[j]));
    }
    const parts = centres.map(() => 0);
    affect.forEach((j) => parts[j]++);
    return centres
      .map((c, j) => ({ rgb: c, hex: hex(c), part: parts[j] / pts.length }))
      .filter((c) => c.part > 0.02)
      .sort((a, b) => b.part - a.part);
  }

  function nomCouleur(rgb) {
    const { h, s, v } = hsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    if (v < 0.18) return "noirs";
    if (s < 0.15) return v > 0.82 ? "blancs" : "gris";
    if (v > 0.8 && s < 0.3) return "crèmes";
    if (h < 15 || h >= 340) return v < 0.5 ? "bordeaux" : "rouges";
    if (h < 45) return v < 0.55 ? "bruns" : "ocres et orangés";
    if (h < 70) return "jaunes";
    if (h < 160) return "verts";
    if (h < 200) return "bleus-verts";
    if (h < 255) return "bleus";
    if (h < 290) return "violets";
    return "roses";
  }

  function analyser(source) {
    const d = pixels(source, 64);
    let n = 0, sl = 0, sl2 = 0, ss = 0, chaud = 0, poids = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const c = hsv(r, g, b);
      sl += l; sl2 += l * l; ss += c.s; n++;
      const w = c.s * c.v;
      chaud += w * Math.cos(((c.h - 35) * Math.PI) / 180);
      poids += w;
    }
    const lum = sl / n;
    const pal = palette(d, 5);
    const a = {
      luminosite: lum,
      contraste: Math.sqrt(Math.max(0, sl2 / n - lum * lum)),
      saturation: ss / n,
      chaleur: poids > 0.01 ? chaud / poids : 0,
      palette: pal
    };
    a.mono = a.saturation < 0.09;
    const vives = pal.filter((p) => hsv(p.rgb[0] / 255, p.rgb[1] / 255, p.rgb[2] / 255).s > 0.25);
    a.couleurPrincipale = nomCouleur((vives[0] || pal[0]).rgb);
    return a;
  }

  function lecture(a) {
    const morceaux = [];
    if (a.mono) morceaux.push("une image en noir et blanc");
    else {
      morceaux.push(a.chaleur > 0.25 ? "des tons chauds" : a.chaleur < -0.2 ? "des tons froids" : "des tons mêlés, ni chauds ni froids");
      morceaux.push("dominés par les " + a.couleurPrincipale);
    }
    const val = a.luminosite < 0.35 ? "une œuvre plutôt sombre" : a.luminosite > 0.65 ? "une œuvre lumineuse" : "des valeurs moyennes";
    const con = a.contraste > 0.24 ? "au contraste marqué" : a.contraste < 0.12 ? "au contraste doux" : "";
    const sat = !a.mono && a.saturation > 0.45 ? ", aux couleurs vives" : !a.mono && a.saturation < 0.2 ? ", aux couleurs sourdes" : "";
    return `On voit ${morceaux.join(" ")}, ${val}${con ? " " + con : ""}${sat}.`;
  }

  // ---- Choix local ------------------------------------------------------------
  const STYLES_SOBRES = ["moderne", "contemporain", "scandinave"];

  function noter(m, a, type, cm) {
    let s = 0;
    const raisons = [];
    const ajoute = (pts, texte) => { s += pts; if (texte && pts > 0) raisons.push({ pts, texte }); };
    const long = Math.max(cm.l, cm.h);

    ajoute(m.convient.includes(type) ? 1 : -6);
    if (m.famille === "caisse_americaine" && type === "toile")
      ajoute(2.5, "Cadre flottant : la toile reste visible jusqu'à ses bords, sans vitre, comme suspendue.");

    if (a.mono) {
      if (m.temperature !== "chaud") ajoute(1.5, "Un cadre neutre respecte le noir et blanc sans y ajouter de couleur.");
      if (["noir", "blanc", "metal", "argent"].includes(m.famille)) ajoute(1);
      if (m.famille === "or") ajoute(-1);
    } else if (a.chaleur > 0.25) {
      if (m.temperature === "chaud") ajoute(2, `Sa teinte chaude prolonge les ${a.couleurPrincipale} de l'œuvre.`);
      if (m.temperature === "froid") ajoute(-1.5);
    } else if (a.chaleur < -0.2) {
      if (m.temperature === "froid") ajoute(2, `Ses reflets froids accompagnent les ${a.couleurPrincipale} de l'œuvre.`);
      if (m.temperature === "neutre") ajoute(0.6);
      if (m.temperature === "chaud") ajoute(-1);
    } else if (m.temperature === "neutre") {
      ajoute(0.8, "Sa teinte neutre ne prend pas parti entre les tons chauds et froids de l'œuvre.");
    }

    if (a.luminosite < 0.35) {
      if (m.valeur === "clair") ajoute(1.2, "Plus clair que l'œuvre, il la détache du mur et l'éclaire.");
      if (m.valeur === "moyen") ajoute(0.9, "Son reflet métallique accroche la lumière autour d'une œuvre sombre.");
    } else if (a.luminosite > 0.65) {
      if (m.valeur === "fonce") ajoute(1.2, "Sa teinte sombre dessine un contour net autour d'une œuvre claire.");
      if (m.valeur === "moyen") ajoute(0.5);
    }

    if (!a.mono && a.saturation > 0.45) {
      if (STYLES_SOBRES.includes(m.style)) ajoute(1.2, "Sobre, il laisse toute la place à des couleurs vives.");
      if (m.style === "classique" || m.style === "musée") ajoute(-0.8);
    }
    if (!a.mono && a.saturation < 0.2 && ["rustique", "classique", "musée"].includes(m.style))
      ajoute(0.7, "Sa matière patinée s'accorde aux couleurs sourdes de l'œuvre.");
    if (a.contraste > 0.24 && (m.famille === "noir" || m.famille === "musee"))
      ajoute(0.6, "Il répond au contraste marqué de l'œuvre.");

    if (long < 30) {
      if (m.largeur_cm <= 2.2) ajoute(1, "Sa faible largeur reste à l'échelle d'un petit format.");
      if (m.largeur_cm >= 4) ajoute(-1.5);
    } else if (long > 80) {
      if (m.largeur_cm >= 3) ajoute(0.8, "Sa largeur tient un grand format sans paraître frêle.");
      if (m.largeur_cm < 1.5) ajoute(-1);
    }
    if (type === "photo" && m.style === "moderne") ajoute(0.8, "Un profil net, dans la tradition de l'encadrement photo.");

    raisons.sort((x, y) => y.pts - x.pts);
    return { score: s, raison: raisons.length ? raisons[0].texte : m.description };
  }

  function passePartoutLocal(a, type, moulure) {
    if (type === "toile" || moulure.famille === "caisse_americaine") return "aucun";
    if (a.mono) return a.luminosite < 0.4 && moulure.valeur === "fonce" ? "noir" : "blanc_casse";
    if (a.chaleur > 0.25) return "creme";
    if (a.chaleur < -0.2) return "gris_perle";
    return "blanc_casse";
  }

  // Six moulures, une par famille d'abord, pour que le choix soit un vrai choix.
  function choisirLocal(cat, a, type, cm) {
    const notes = cat.moulures.map((m) => Object.assign({ m }, noter(m, a, type, cm)))
      .sort((x, y) => y.score - x.score);
    const pris = [], familles = new Set();
    for (const n of notes) {
      if (pris.length === 6) break;
      if (!familles.has(n.m.famille)) { pris.push(n); familles.add(n.m.famille); }
    }
    for (const n of notes) {
      if (pris.length === 6) break;
      if (!pris.includes(n)) pris.push(n);
    }
    return {
      mode: "local",
      lecture: lecture(a),
      palette: a.palette.map((p) => p.hex),
      suggestions: pris.map((n) => ({
        id: n.m.id, raison: n.raison, passe_partout: passePartoutLocal(a, type, n.m)
      }))
    };
  }

  // ---- Appel au serveur ------------------------------------------------------
  function jpegBase64(source, cote) {
    const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
    const k = Math.min(1, cote / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    c.getContext("2d").drawImage(source, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function etatServeur() {
    try {
      const r = await fetch((window.BASE_IA || "") + "api/etat", { cache: "no-store" });
      if (!r.ok) return { ia: false };
      return await r.json();
    } catch (e) {
      return { ia: false };
    }
  }

  async function proposer(cat, source, type, cm, etat) {
    const a = analyser(source);
    if (etat && etat.ia) {
      try {
        const r = await fetch((window.BASE_IA || "") + "api/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: jpegBase64(source, 768), type, dimensions_cm: cm })
        });
        const res = await r.json();
        if (!r.ok || res.erreur) throw new Error(res.erreur || "HTTP " + r.status);
        return res;
      } catch (e) {
        const repli = choisirLocal(cat, a, type, cm);
        repli.avertissement = "L'IA n'a pas répondu (" + e.message + "). Suggestions faites par l'analyse locale.";
        return repli;
      }
    }
    return choisirLocal(cat, a, type, cm);
  }

  window.Suggestion = { analyser, proposer, etatServeur, choisirLocal };
})();
