/* Matières des moulures : textures générées (bois, dorure, laque, métal)
   et paramètres d'éclairage. Une texture est une bande où le fil du bois
   court sur l'axe x ; le rendu la fait tourner le long de chaque côté. */
(function () {
  "use strict";

  const TUILE_L = 1024;   // longueur de la tuile (le long de la baguette)
  const TUILE_H = 256;    // largeur de la tuile (en travers)

  function prng(graine) {
    let a = graine >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Bruit de valeur 2D, périodique en x pour que la tuile se raccorde.
  function bruit(graine, periodeX, periodeY) {
    const alea = prng(graine);
    const N = 256;
    const table = new Float32Array(N * N);
    for (let i = 0; i < table.length; i++) table[i] = alea();
    const lisse = (t) => t * t * (3 - 2 * t);
    return function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = ((xi % periodeX) + periodeX) % periodeX, x1 = (x0 + 1) % periodeX;
      const y0 = ((yi % periodeY) + periodeY) % periodeY, y1 = (y0 + 1) % periodeY;
      const v = (xx, yy) => table[(yy % N) * N + (xx % N)];
      const u = lisse(xf), w = lisse(yf);
      const a = v(x0, y0) + (v(x1, y0) - v(x0, y0)) * u;
      const b = v(x0, y1) + (v(x1, y1) - v(x0, y1)) * u;
      return a + (b - a) * w;
    };
  }

  // Somme d'octaves ; `echX` est un diviseur de TUILE_L pour rester périodique.
  function fbm(graine, echX, echY, octaves) {
    const couches = [];
    for (let o = 0; o < octaves; o++) {
      const ex = echX * (1 << o), ey = echY * (1 << o);
      couches.push({ f: bruit(graine + o * 101, ex, ey), ex, ey, amp: 1 / (1 << o) });
    }
    const total = couches.reduce((s, c) => s + c.amp, 0);
    return function (x, y) {
      let s = 0;
      for (const c of couches) s += c.f(x / TUILE_L * c.ex, y / TUILE_H * c.ey) * c.amp;
      return s / total;
    };
  }

  const melange = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const borne = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

  function tuile(peindre) {
    const c = document.createElement("canvas");
    c.width = TUILE_L; c.height = TUILE_H;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(TUILE_L, TUILE_H);
    const d = img.data;
    for (let y = 0; y < TUILE_H; y++) {
      for (let x = 0; x < TUILE_L; x++) {
        const rgb = peindre(x, y);
        const i = (y * TUILE_L + x) * 4;
        d[i] = borne(rgb[0]); d[i + 1] = borne(rgb[1]); d[i + 2] = borne(rgb[2]); d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Bois : cernes déformés + fibres fines dans le sens du fil.
  function bois(o) {
    const deforme = fbm(o.graine, 4, 3, 3);
    const fibres = fbm(o.graine + 7, 64, 48, 2);
    const pores = fbm(o.graine + 13, 256, 160, 1);
    const tache = fbm(o.graine + 29, 2, 2, 2);
    return tuile((x, y) => {
      const cerne = (y / TUILE_H) * o.cernes + deforme(x, y) * o.ondulation;
      const f = cerne - Math.floor(cerne);
      const trait = Math.pow(Math.abs(Math.sin(Math.PI * f)), o.finesse);
      let t = trait * o.contraste + (tache(x, y) - 0.5) * 0.35;
      t += (fibres(x, y) - 0.5) * 0.5;
      t = Math.max(0, Math.min(1, t));
      let c = melange(o.clair, o.fonce, t);
      const p = pores(x, y);
      if (o.pores && p > 0.78) c = melange(c, o.pores, Math.min(1, (p - 0.78) * 4));
      return c;
    });
  }

  // Dorure / argenture à la feuille : marbrures, carrés de feuille, patine.
  function feuille(o) {
    const marbre = fbm(o.graine, 3, 2, 4);
    const fin = fbm(o.graine + 5, 128, 64, 2);
    const patine = fbm(o.graine + 11, 6, 4, 3);
    const carre = TUILE_L / 4;  // ≈ 7,5 cm : quatre feuilles par tuile, raccord exact
    const tons = prng(o.graine + 3);
    const decal = [];
    for (let i = 0; i < 64; i++) decal.push((tons() - 0.5) * 0.12);
    return tuile((x, y) => {
      const cx = Math.floor(x / carre), cy = Math.floor(y / carre);
      let t = 0.5 + (marbre(x, y) - 0.5) * 0.9 + decal[(cx * 7 + cy * 3) & 63];
      t += (fin(x, y) - 0.5) * 0.25;
      const bord = Math.min(x % carre, y % carre);
      if (bord < 2) t -= 0.12;
      let c = melange(o.sombre, o.clair, Math.max(0, Math.min(1, t)));
      const p = patine(x, y);
      if (p > 0.6) c = melange(c, o.patine, Math.min(0.55, (p - 0.6) * 2.2));
      return c;
    });
  }

  // Peinture, laque : uni avec un grain très discret (le bois sous la peinture).
  function uni(o) {
    const grain = fbm(o.graine, 16, 24, 3);
    const fin = fbm(o.graine + 3, 256, 128, 1);
    return tuile((x, y) => {
      const t = (grain(x, y) - 0.5) * o.grain + (fin(x, y) - 0.5) * o.grain * 0.6;
      return [o.couleur[0] + t * 255, o.couleur[1] + t * 255, o.couleur[2] + t * 255];
    });
  }

  // Métal brossé : stries fines dans le sens du profilé.
  function brosse(o) {
    const strie = fbm(o.graine, 2, 220, 2);
    const onde = fbm(o.graine + 9, 3, 2, 2);
    return tuile((x, y) => {
      const t = (strie(x, y) - 0.5) * 0.22 + (onde(x, y) - 0.5) * 0.1;
      return melange(o.couleur, [255, 255, 255], Math.max(-0.4, t));
    });
  }

  // Bois de grange : bois grisé, fentes, nœuds sombres.
  function grange(o) {
    const base = bois({ graine: o.graine, clair: [150, 146, 136], fonce: [88, 84, 78], cernes: 9, ondulation: 2.2, finesse: 3, contraste: 0.7, pores: [62, 58, 54] });
    const ctx = base.getContext("2d");
    const alea = prng(o.graine + 17);
    ctx.strokeStyle = "rgba(40,36,32,0.55)";
    for (let i = 0; i < 9; i++) {
      const y = alea() * TUILE_H, x = alea() * TUILE_L, l = 80 + alea() * 260;
      ctx.lineWidth = 1 + alea() * 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y + (alea() - 0.5) * 6); ctx.stroke();
    }
    return base;
  }

  // Éclairage : `ombre`/`lumiere` teintent les creux et les reliefs,
  // `brillance`/`durete` règlent le reflet spéculaire.
  const MATIERES = {
    noir_mat:      { cm: 40, gen: () => uni({ graine: 1, couleur: [30, 29, 28], grain: 0.035 }), ombre: [0, 0, 0], lumiere: [255, 255, 255], diffus: 0.55, eclat: 0.35, brillance: 0.06, durete: 6 },
    noir_laque:    { cm: 40, gen: () => uni({ graine: 2, couleur: [17, 16, 16], grain: 0.012 }), ombre: [0, 0, 0], lumiere: [255, 255, 255], diffus: 0.6, eclat: 0.4, brillance: 0.75, durete: 46 },
    blanc_satine:  { cm: 40, gen: () => uni({ graine: 3, couleur: [240, 238, 232], grain: 0.03 }), ombre: [70, 64, 58], lumiere: [255, 255, 255], diffus: 0.6, eclat: 0.2, brillance: 0.12, durete: 14 },
    // Bois : placages photographiés (Poly Haven, CC0), recolorés à la teinte voulue.
    // `gen` reste en secours si l'image ne se charge pas.
    chene:         { cm: 55, image: { src: "assets/textures/noyer.jpg", teinte: [204, 164, 110], contraste: 1.15 }, gen: () => bois({ graine: 21, clair: [214, 178, 128], fonce: [150, 108, 62], cernes: 7, ondulation: 1.5, finesse: 5, contraste: 0.75, pores: [120, 84, 46] }), ombre: [45, 26, 8], lumiere: [255, 240, 215], diffus: 0.7, eclat: 0.35, brillance: 0.1, durete: 10 },
    chene_blanchi: { cm: 55, image: { src: "assets/textures/bois_fin.jpg", teinte: [228, 219, 202], contraste: 1.6 }, gen: () => bois({ graine: 22, clair: [230, 222, 206], fonce: [178, 162, 138], cernes: 7, ondulation: 1.5, finesse: 5, contraste: 0.55, pores: [246, 244, 238] }), ombre: [60, 50, 38], lumiere: [255, 252, 245], diffus: 0.6, eclat: 0.25, brillance: 0.08, durete: 10 },
    noyer:         { cm: 55, image: { src: "assets/textures/noyer.jpg", teinte: [104, 68, 44], contraste: 1.5 }, gen: () => bois({ graine: 23, clair: [128, 88, 60], fonce: [62, 38, 24], cernes: 6, ondulation: 2.4, finesse: 3, contraste: 0.8, pores: [44, 26, 16] }), ombre: [20, 10, 4], lumiere: [255, 228, 196], diffus: 0.75, eclat: 0.45, brillance: 0.22, durete: 16 },
    ebene:         { cm: 55, image: { src: "assets/textures/ebene.jpg", teinte: [44, 37, 33], contraste: 2.2 }, gen: () => bois({ graine: 24, clair: [70, 58, 50], fonce: [26, 21, 19], cernes: 8, ondulation: 1.2, finesse: 6, contraste: 0.85, pores: [18, 14, 12] }), ombre: [0, 0, 0], lumiere: [255, 240, 225], diffus: 0.6, eclat: 0.4, brillance: 0.18, durete: 14 },
    erable:        { cm: 55, image: { src: "assets/textures/erable.jpg", teinte: [232, 207, 162], contraste: 1.7 }, gen: () => bois({ graine: 25, clair: [236, 212, 168], fonce: [204, 170, 120], cernes: 5, ondulation: 1.0, finesse: 6, contraste: 0.55, pores: null }), ombre: [60, 40, 15], lumiere: [255, 248, 230], diffus: 0.65, eclat: 0.3, brillance: 0.1, durete: 10 },
    alu_argent:    { cm: 40, gen: () => brosse({ graine: 31, couleur: [190, 193, 196] }), ombre: [20, 22, 26], lumiere: [255, 255, 255], diffus: 0.8, eclat: 0.6, brillance: 0.55, durete: 22 },
    alu_champagne: { cm: 40, gen: () => brosse({ graine: 32, couleur: [204, 184, 140] }), ombre: [40, 28, 10], lumiere: [255, 248, 225], diffus: 0.8, eclat: 0.6, brillance: 0.5, durete: 22 },
    or_feuille:    { cm: 30, gen: () => feuille({ graine: 41, sombre: [150, 108, 40], clair: [222, 184, 96], patine: [96, 70, 36] }), ombre: [60, 34, 4], lumiere: [255, 244, 200], diffus: 0.95, eclat: 0.75, brillance: 0.6, durete: 16 },
    argent_feuille:{ cm: 30, gen: () => feuille({ graine: 42, sombre: [140, 142, 142], clair: [214, 216, 214], patine: [92, 88, 80] }), ombre: [26, 26, 30], lumiere: [255, 255, 255], diffus: 0.95, eclat: 0.7, brillance: 0.55, durete: 16 },
    grange:        { cm: 50, image: { src: "assets/textures/grange.jpg", rotation: 90, contraste: 1.1 }, gen: () => grange({ graine: 51 }), ombre: [20, 18, 16], lumiere: [255, 250, 240], diffus: 0.7, eclat: 0.3, brillance: 0.04, durete: 6 }
  };

  // Texture photographiée : pivotée si le fil est vertical, puis recolorée
  // autour de sa luminance moyenne (le veinage reste, la teinte change).
  function chargerTexture(o) {
    return new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => {
        const tourne = o.rotation === 90;
        const c = document.createElement("canvas");
        c.width = tourne ? img.naturalHeight : img.naturalWidth;
        c.height = tourne ? img.naturalWidth : img.naturalHeight;
        const ctx = c.getContext("2d");
        if (tourne) { ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); }
        ctx.drawImage(img, 0, 0);
        const donnees = ctx.getImageData(0, 0, c.width, c.height), d = donnees.data;
        let somme = 0;
        for (let i = 0; i < d.length; i += 4) somme += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const moy = somme / (d.length / 4);
        const k = o.contraste ?? 1;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          const v = 1 + (l / moy - 1) * k;
          if (o.teinte) { d[i] = o.teinte[0] * v; d[i + 1] = o.teinte[1] * v; d[i + 2] = o.teinte[2] * v; }
          else { const f = v / (l / moy || 1); d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; }
        }
        ctx.putImageData(donnees, 0, 0);
        ok(c);
      };
      img.onerror = () => ko(new Error("Texture introuvable : " + o.src));
      img.src = o.src;
    });
  }

  const enCours = new Map();
  function preparer(nom) {
    const m = MATIERES[nom];
    if (!m || !m.image) return Promise.resolve();
    if (!enCours.has(nom)) {
      enCours.set(nom, chargerTexture(m.image)
        .then((c) => { m._tuile = c; })
        .catch((e) => { console.warn(e.message, "— texture générée à la place"); }));
    }
    return enCours.get(nom);
  }

  // Tuiles réduites par paliers : un motif fortement réduit sans palier
  // scintille (aucun mipmap sur les motifs du canvas).
  const cache = new Map();
  function niveaux(nom) {
    if (cache.has(nom)) return cache.get(nom);
    const m = MATIERES[nom];
    if (!m) throw new Error("Matière inconnue : " + nom);
    const liste = [m._tuile || m.gen()];
    while (liste[liste.length - 1].width > 64) {
      const prec = liste[liste.length - 1];
      const c = document.createElement("canvas");
      c.width = prec.width / 2; c.height = prec.height / 2;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(prec, 0, 0, c.width, c.height);
      liste.push(c);
    }
    cache.set(nom, liste);
    return liste;
  }

  // Rend la tuile adaptée à l'échelle voulue et l'échelle résiduelle.
  function tuilePour(nom, pxParCm) {
    const m = MATIERES[nom];
    const liste = niveaux(nom);
    let echelle = (pxParCm * m.cm) / liste[0].width;
    let niv = 0;
    while (echelle < 0.5 && niv < liste.length - 1) { echelle *= 2; niv++; }
    return { image: liste[niv], echelle };
  }

  // Grain de papier ou de mur, en tuile carrée.
  let grainPapier = null;
  function papier() {
    if (grainPapier) return grainPapier;
    const n = 256, f = bruit(77, 32, 32), g = bruit(78, 128, 128);
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 128 + (f(x / 8, y / 8) - 0.5) * 40 + (g(x / 2, y / 2) - 0.5) * 50;
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grainPapier = c;
    return c;
  }

  window.Matieres = { MATIERES, tuilePour, papier, preparer, existe: (nom) => nom in MATIERES };
})();
