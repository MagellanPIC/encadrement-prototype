/* Rendu de l'œuvre encadrée, en calques sur un canvas :
   mur → ombre portée → passe-partout → œuvre → biseau → ombre du cadre → cadre → vitre.
   L'œuvre n'est jamais modifiée : le cadre est dessiné par-dessus. */
(function () {
  "use strict";

  const norme = (v) => { const n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; };
  const scal = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

  // Lumière venant d'en haut à gauche, devant le tableau.
  const LUM = norme([-0.35, -0.6, 0.72]);
  const MI = norme([LUM[0], LUM[1], LUM[2] + 1]);

  // Les quatre côtés : coin de départ, angle du fil, normale vers l'extérieur.
  // Dans le repère local d'un côté, x court le long du côté et y vers l'intérieur.
  function cotes(x0, y0, x1, y1) {
    return [
      { P: [x0, y0], angle: 0,               long: x1 - x0, u: [0, -1] },
      { P: [x1, y0], angle: Math.PI / 2,     long: y1 - y0, u: [1, 0] },
      { P: [x1, y1], angle: Math.PI,         long: x1 - x0, u: [0, 1] },
      { P: [x0, y1], angle: -Math.PI / 2,    long: y1 - y0, u: [-1, 0] }
    ];
  }

  // Profil en travers de la moulure : hauteur h(s), s = 0 au bord extérieur.
  function profil(segments, W) {
    const total = segments.reduce((s, g) => s + g.w, 0);
    let cumul = 0;
    const segs = segments.map((g) => {
      const d = (cumul / total) * W;
      cumul += g.w;
      return Object.assign({}, g, { d, f: (cumul / total) * W, h1: g.h1 ?? g.h0 });
    });
    const arrondi = Math.min(0.08, W * 0.05);
    function seg(s) {
      for (const g of segs) if (s <= g.f) return g;
      return segs[segs.length - 1];
    }
    function h(s) {
      s = Math.max(0, Math.min(W, s));
      const g = seg(s);
      const t = g.f > g.d ? (s - g.d) / (g.f - g.d) : 0;
      const a = g.a || 0, monte = g.h1 >= g.h0;
      let v;
      switch (g.forme) {
        case "pente":   v = g.h0 + (g.h1 - g.h0) * t; break;
        case "concave": v = g.h0 + (g.h1 - g.h0) * (monte ? t * t : 1 - (1 - t) * (1 - t)); break;
        case "convexe": v = g.h0 + (g.h1 - g.h0) * (monte ? 1 - (1 - t) * (1 - t) : t * t); break;
        case "bombe":   v = g.h0 + (g.h1 - g.h0) * t + a * Math.sin(Math.PI * t); break;
        case "perle":   v = g.h0 + (g.h1 - g.h0) * t + a * Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)); break;
        default:        v = g.h0;  // plat, jour
      }
      const bord = Math.min(s, W - s);
      if (bord < arrondi) v -= arrondi * (1 - Math.sqrt(1 - (1 - bord / arrondi) ** 2));
      return v;
    }
    return { h, segs, W };
  }

  // Dégradés d'ombre, de lumière et de reflet en travers d'un côté.
  function ombrer(ctx, prof, Wpx, longueur, u, mat) {
    const N = Math.max(24, Math.min(180, Math.round(Wpx * 1.5)));
    const W = prof.W, pas = W / N;
    const plat = Math.pow(MI[2], mat.durete);
    const gs = ctx.createLinearGradient(0, 0, 0, Wpx);
    const gl = ctx.createLinearGradient(0, 0, 0, Wpx);
    const ge = ctx.createLinearGradient(0, 0, 0, Wpx);
    for (let k = 0; k <= N; k++) {
      const s = (k / N) * W;
      const pente = (prof.h(s + pas / 2) - prof.h(s - pas / 2)) / pas;
      const n = norme([pente * u[0], pente * u[1], 1]);
      const diff = Math.max(0, scal(n, LUM)) / LUM[2];
      const sombre = diff < 1 ? Math.min(0.92, (1 - diff) * mat.diffus) : 0;
      const clair = diff > 1 ? Math.min(0.85, (diff - 1) * mat.eclat * 2) : 0;
      const reflet = mat.brillance * Math.max(0, Math.pow(Math.max(0, scal(n, MI)), mat.durete) - plat * 0.85);
      gs.addColorStop(k / N, rgba(mat.ombre, sombre));
      gl.addColorStop(k / N, rgba(mat.lumiere, clair));
      ge.addColorStop(k / N, rgba(mat.lumiere, Math.min(0.9, reflet)));
    }
    for (const g of [gs, gl, ge]) { ctx.fillStyle = g; ctx.fillRect(-2, 0, longueur + 4, Wpx); }
  }

  function remplirTexture(ctx, nom, pxParCm, y0, y1, longueur, decalage) {
    const t = Matieres.tuilePour(nom, pxParCm);
    ctx.save();
    ctx.scale(t.echelle, t.echelle);
    const motif = ctx.createPattern(t.image, "repeat");
    motif.setTransform(new DOMMatrix().translate(-decalage * t.image.width, 0));
    ctx.fillStyle = motif;
    ctx.fillRect(-2 / t.echelle, y0 / t.echelle, (longueur + 4) / t.echelle, (y1 - y0) / t.echelle);
    ctx.restore();
  }

  function graine(texte) {
    let h = 2166136261;
    for (const c of texte) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967296;
  }

  // Cadre dessiné : chaque côté est un trapèze coupé d'onglet, rempli de sa
  // matière bande par bande, puis ombré selon la pente du profil.
  function cadreDessine(ctx, m, ext, Wpx, pxParCm) {
    const r = m.rendu;
    const prof = profil(r.profil, m.largeur_cm);
    const mat1 = Matieres.MATIERES[r.matiere];
    const [x0, y0, x1, y1] = ext;
    cotes(x0, y0, x1, y1).forEach((c, i) => {
      ctx.save();
      ctx.translate(c.P[0], c.P[1]);
      ctx.rotate(c.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(c.long, 0); ctx.lineTo(c.long - Wpx, Wpx); ctx.lineTo(Wpx, Wpx);
      ctx.closePath();
      ctx.clip();
      const decalage = graine(m.id + ":" + i);
      for (const g of prof.segs) {
        const a = g.d * pxParCm, b = g.f * pxParCm + 0.5;
        if (g.forme === "jour") {
          ctx.fillStyle = "#141210";
          ctx.fillRect(-2, a, c.long + 4, b - a);
        } else {
          remplirTexture(ctx, g.matiere === 2 ? r.matiere_2 : r.matiere, pxParCm, a, b, c.long, decalage);
        }
      }
      ombrer(ctx, prof, Wpx, c.long, c.u, mat1);
      ctx.restore();
    });
    // Joints d'onglet et arête extérieure.
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.lineWidth = Math.max(0.6, 0.025 * pxParCm);
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + Wpx, y0 + Wpx);
    ctx.moveTo(x1, y0); ctx.lineTo(x1 - Wpx, y0 + Wpx);
    ctx.moveTo(x1, y1); ctx.lineTo(x1 - Wpx, y1 - Wpx);
    ctx.moveTo(x0, y1); ctx.lineTo(x0 + Wpx, y1 - Wpx);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = Math.max(0.6, 0.02 * pxParCm);
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    ctx.restore();
    return prof.h(m.largeur_cm);
  }

  // ---- Cadres photographiés (découpe en neuf) ------------------------------
  const images = new Map();
  function chargerImage(src) {
    if (images.has(src)) return images.get(src);
    const p = new Promise((ok, ko) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ko(new Error("Image de cadre introuvable : " + src));
      img.src = src;
    });
    images.set(src, p);
    return p;
  }

  // Détecte, sur un PNG à ouverture transparente, le bord extérieur du cadre
  // et la largeur de chaque côté (en pixels de la source).
  function detecterTranches(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const a = (x, y) => d[(y * c.width + x) * 4 + 3];
    const lignes = [0.35, 0.5, 0.65];
    const res = { g: [], d: [], h: [], b: [], eg: [], ed: [], eh: [], eb: [] };
    for (const f of lignes) {
      const y = Math.round(c.height * f), x = Math.round(c.width * f);
      let i = 0; while (i < c.width && a(i, y) < 128) i++; res.eg.push(i);
      i = c.width - 1; while (i > 0 && a(i, y) < 128) i--; res.ed.push(i);
      i = Math.round(c.width / 2); while (i > 0 && a(i, y) < 128) i--; res.g.push(i);
      i = Math.round(c.width / 2); while (i < c.width - 1 && a(i, y) < 128) i++; res.d.push(i);
      let j = 0; while (j < c.height && a(x, j) < 128) j++; res.eh.push(j);
      j = c.height - 1; while (j > 0 && a(x, j) < 128) j--; res.eb.push(j);
      j = Math.round(c.height / 2); while (j > 0 && a(x, j) < 128) j--; res.h.push(j);
      j = Math.round(c.height / 2); while (j < c.height - 1 && a(x, j) < 128) j++; res.b.push(j);
    }
    const min = (t) => Math.min(...t), max = (t) => Math.max(...t);
    const ext = { x: min(res.eg), y: min(res.eh), x2: max(res.ed) + 1, y2: max(res.eb) + 1 };
    const centreOpaque = a(Math.round(c.width / 2), Math.round(c.height / 2)) >= 128;
    return {
      recadre: { x: ext.x, y: ext.y, l: ext.x2 - ext.x, h: ext.y2 - ext.y },
      tranche: {
        gauche: max(res.g) - ext.x + 1,
        droite: ext.x2 - min(res.d),
        haut: max(res.h) - ext.y + 1,
        bas: ext.y2 - min(res.b)
      },
      ouvertureTransparente: !centreOpaque
    };
  }

  // Photo d'archive en noir et blanc : on lui redonne une couleur par
  // dégradé (ombres → `sombre`, lumières → `clair`).
  function teinter(img, t) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const donnees = ctx.getImageData(0, 0, c.width, c.height), d = donnees.data;
    const bas = t.bas ?? 0, haut = t.haut ?? 255;
    for (let i = 0; i < d.length; i += 4) {
      const l = Math.max(0, Math.min(1, ((d[i] + d[i + 1] + d[i + 2]) / 3 - bas) / (haut - bas)));
      const g = Math.pow(l, t.gamma ?? 1);
      d[i] = t.sombre[0] + (t.clair[0] - t.sombre[0]) * g;
      d[i + 1] = t.sombre[1] + (t.clair[1] - t.sombre[1]) * g;
      d[i + 2] = t.sombre[2] + (t.clair[2] - t.sombre[2]) * g;
    }
    ctx.putImageData(donnees, 0, 0);
    return c;
  }

  async function preparer(m) {
    if (m.rendu.type !== "image") {
      await Promise.all([Matieres.preparer(m.rendu.matiere), Matieres.preparer(m.rendu.matiere_2)]);
      return;
    }
    if (m._prepare) return m._prepare;
    m._prepare = (async () => {
      const brute = await chargerImage(m.rendu.src);
      const img = m.rendu.teinte ? teinter(brute, m.rendu.teinte) : brute;
      m._img = img;
      if (!m.rendu.tranche) {
        const t = detecterTranches(img);
        m._recadre = t.recadre; m._tranche = t.tranche;
      } else {
        m._recadre = m.rendu.recadre || { x: 0, y: 0, l: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
        m._tranche = m.rendu.tranche;
      }
    })();
    return m._prepare;
  }

  // Largeur de chaque côté en cm (un cadre photographié peut être inégal).
  function epaisseurs(m) {
    if (m.rendu.type !== "image" || !m._tranche) {
      const w = m.largeur_cm;
      return { haut: w, droite: w, bas: w, gauche: w };
    }
    const t = m._tranche;
    const moy = (t.haut + t.droite + t.bas + t.gauche) / 4;
    const k = m.largeur_cm / moy;
    return { haut: t.haut * k, droite: t.droite * k, bas: t.bas * k, gauche: t.gauche * k };
  }

  function cadrePhoto(ctx, m, ext, ep, pxParCm) {
    const img = m._img, R = m._recadre, T = m._tranche;
    const [x0, y0, x1, y1] = ext;
    const H = ep.haut * pxParCm, B = ep.bas * pxParCm, G = ep.gauche * pxParCm, D = ep.droite * pxParCm;
    const etirer = m.rendu.repetition === "etirer";
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    const sx = (v) => R.x + v, sy = (v) => R.y + v;
    // coins
    ctx.drawImage(img, sx(0), sy(0), T.gauche, T.haut, x0, y0, G, H);
    ctx.drawImage(img, sx(R.l - T.droite), sy(0), T.droite, T.haut, x1 - D, y0, D, H);
    ctx.drawImage(img, sx(R.l - T.droite), sy(R.h - T.bas), T.droite, T.bas, x1 - D, y1 - B, D, B);
    ctx.drawImage(img, sx(0), sy(R.h - T.bas), T.gauche, T.bas, x0, y1 - B, G, B);
    // côtés
    const bord = (srcX, srcY, srcL, srcH, dx, dy, dl, dh, horizontal) => {
      const longueurSrc = horizontal ? srcL : srcH;
      const longueurDst = horizontal ? dl : dh;
      const echelle = horizontal ? dh / srcH : dl / srcL;
      const n = etirer ? 1 : Math.max(1, Math.round(longueurDst / (longueurSrc * echelle)));
      const pas = longueurDst / n;
      for (let i = 0; i < n; i++) {
        if (horizontal) ctx.drawImage(img, srcX, srcY, srcL, srcH, dx + i * pas, dy, pas + 0.6, dh);
        else ctx.drawImage(img, srcX, srcY, srcL, srcH, dx, dy + i * pas, dl, pas + 0.6);
      }
    };
    bord(sx(T.gauche), sy(0), R.l - T.gauche - T.droite, T.haut, x0 + G, y0, x1 - x0 - G - D, H, true);
    bord(sx(T.gauche), sy(R.h - T.bas), R.l - T.gauche - T.droite, T.bas, x0 + G, y1 - B, x1 - x0 - G - D, B, true);
    bord(sx(0), sy(T.haut), T.gauche, R.h - T.haut - T.bas, x0, y0 + H, G, y1 - y0 - H - B, false);
    bord(sx(R.l - T.droite), sy(T.haut), T.droite, R.h - T.haut - T.bas, x1 - D, y0 + H, D, y1 - y0 - H - B, false);
    ctx.restore();
    return m.rendu.relief_cm ?? 1.5;
  }

  // ---- Passe-partout ---------------------------------------------------------
  function passePartout(ctx, pp, zone, ouv, pxParCm) {
    const [x0, y0, x1, y1] = zone;
    ctx.fillStyle = pp.couleur;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    grain(ctx, zone, 0.05);
  }

  function biseau(ctx, pp, ouv, pxParCm) {
    const b = Math.max(1, 0.22 * pxParCm);
    const [x0, y0, x1, y1] = ouv;
    const faces = [
      { pts: [[x0 - b, y0 - b], [x1 + b, y0 - b], [x1, y0], [x0, y0]], u: [0, -1] },
      { pts: [[x1 + b, y0 - b], [x1 + b, y1 + b], [x1, y1], [x1, y0]], u: [1, 0] },
      { pts: [[x1 + b, y1 + b], [x0 - b, y1 + b], [x0, y1], [x1, y1]], u: [0, 1] },
      { pts: [[x0 - b, y1 + b], [x0 - b, y0 - b], [x0, y0], [x0, y1]], u: [-1, 0] }
    ];
    const ame = couleur(pp.ame);
    for (const f of faces) {
      const n = norme([-f.u[0], -f.u[1], 1]);
      const diff = Math.max(0, scal(n, LUM)) / LUM[2];
      ctx.beginPath();
      f.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      const k = 0.55 + 0.45 * diff;
      ctx.fillStyle = `rgb(${Math.min(255, ame[0] * k) | 0},${Math.min(255, ame[1] * k) | 0},${Math.min(255, ame[2] * k) | 0})`;
      ctx.fill();
    }
  }

  function couleur(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  function grain(ctx, zone, force) {
    const [x0, y0, x1, y1] = zone;
    ctx.save();
    ctx.globalAlpha = force;
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = ctx.createPattern(Matieres.papier(), "repeat");
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  // Ombre que le relief du cadre jette dans l'ouverture (haut et gauche).
  function ombreInterieure(ctx, ouv, largeur, force) {
    const [x0, y0, x1, y1] = ouv;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    let g = ctx.createLinearGradient(0, y0, 0, y0 + largeur);
    g.addColorStop(0, `rgba(0,0,0,${force})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x0, y0, x1 - x0, largeur);
    g = ctx.createLinearGradient(x0, 0, x0 + largeur * 0.8, 0);
    g.addColorStop(0, `rgba(0,0,0,${force * 0.8})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x0, y0, largeur * 0.8, y1 - y0);
    const fin = largeur * 0.3;
    g = ctx.createLinearGradient(0, y1, 0, y1 - fin);
    g.addColorStop(0, `rgba(0,0,0,${force * 0.3})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x0, y1 - fin, x1 - x0, fin);
    g = ctx.createLinearGradient(x1, 0, x1 - fin, 0);
    g.addColorStop(0, `rgba(0,0,0,${force * 0.3})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x1 - fin, y0, fin, y1 - y0);
    ctx.restore();
  }

  function mur(ctx, l, h, teinte) {
    ctx.fillStyle = teinte;
    ctx.fillRect(0, 0, l, h);
    grain(ctx, [0, 0, l, h], 0.06);
    const g = ctx.createRadialGradient(l * 0.35, -h * 0.2, 0, l * 0.5, h * 0.3, Math.max(l, h) * 1.1);
    g.addColorStop(0, "rgba(255,255,255,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0.10)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, l, h);
  }

  function vitre(ctx, zone) {
    const [x0, y0, x1, y1] = zone;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0.0, "rgba(255,255,255,0)");
    g.addColorStop(0.30, "rgba(255,255,255,0)");
    g.addColorStop(0.42, "rgba(255,255,255,0.07)");
    g.addColorStop(0.50, "rgba(255,255,255,0.02)");
    g.addColorStop(0.56, "rgba(255,255,255,0.05)");
    g.addColorStop(0.70, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  function oeuvreCouvrante(ctx, art, zone) {
    const [x0, y0, x1, y1] = zone;
    const l = x1 - x0, h = y1 - y0;
    const aw = art.naturalWidth || art.width, ah = art.naturalHeight || art.height;
    const ra = aw / ah, rz = l / h;
    let sx = 0, sy = 0, sl = aw, sh = ah;
    if (ra > rz) { sl = ah * rz; sx = (aw - sl) / 2; } else { sh = aw / rz; sy = (ah - sh) / 2; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(art, sx, sy, sl, sh, x0, y0, l, h);
  }

  /* Point d'entrée.
     o = { oeuvre, oeuvreCm: {l, h}, moulure, passe: {couleur, ame, cm} | null,
           mur: '#hex' | null, vitre: bool, boite: {l, h} en px CSS, dpr } */
  function dessiner(canvas, o) {
    const m = o.moulure;
    const flottant = m.famille === "caisse_americaine";
    const pp = flottant ? null : o.passe;
    const ep = epaisseurs(m);
    const ppCm = pp ? pp.cm : 0;
    const extL = o.oeuvreCm.l + 2 * ppCm + ep.gauche + ep.droite;
    const extH = o.oeuvreCm.h + 2 * ppCm + ep.haut + ep.bas;
    const marge = o.mur ? Math.max(extL, extH) * 0.14 + 3 : Math.max(ep.haut, 1) * 0.6 + 1.5;
    const totL = extL + 2 * marge, totH = extH + 2 * marge;
    const dpr = o.dpr || window.devicePixelRatio || 1;
    const pxParCm = Math.min(o.boite.l / totL, o.boite.h / totH) * dpr;

    canvas.width = Math.round(totL * pxParCm);
    canvas.height = Math.round(totH * pxParCm);
    canvas.style.width = canvas.width / dpr + "px";
    canvas.style.height = canvas.height / dpr + "px";
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const X = (cm) => cm * pxParCm;
    const ext = [X(marge), X(marge), X(marge + extL), X(marge + extH)];
    const vue = [ext[0] + X(ep.gauche), ext[1] + X(ep.haut), ext[2] - X(ep.droite), ext[3] - X(ep.bas)];
    const ouv = [vue[0] + X(ppCm), vue[1] + X(ppCm), vue[2] - X(ppCm), vue[3] - X(ppCm)];

    if (o.mur) mur(ctx, canvas.width, canvas.height, o.mur);

    // ombres portées sur le mur
    ctx.save();
    ctx.fillStyle = "#777";
    ctx.shadowColor = "rgba(0,0,0,0.30)";
    ctx.shadowBlur = X(1.6); ctx.shadowOffsetX = X(0.5); ctx.shadowOffsetY = X(0.9);
    ctx.fillRect(ext[0], ext[1], ext[2] - ext[0], ext[3] - ext[1]);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = X(0.3); ctx.shadowOffsetX = X(0.1); ctx.shadowOffsetY = X(0.2);
    ctx.fillRect(ext[0], ext[1], ext[2] - ext[0], ext[3] - ext[1]);
    ctx.restore();

    // fond de feuillure, puis passe-partout et œuvre
    ctx.fillStyle = "#2a2622";
    ctx.fillRect(vue[0] - 2, vue[1] - 2, vue[2] - vue[0] + 4, vue[3] - vue[1] + 4);
    if (pp) {
      passePartout(ctx, pp, vue, ouv, pxParCm);
      oeuvreCouvrante(ctx, o.oeuvre, ouv);
      ombreInterieure(ctx, ouv, X(0.12), 0.22);
      biseau(ctx, pp, ouv, pxParCm);
    } else if (!flottant) {
      // l'œuvre passe sous la feuillure : aucun jour entre l'œuvre et le cadre
      const r = m.rendu.type === "image" ? X(0.4) : 0;
      oeuvreCouvrante(ctx, o.oeuvre, [ouv[0] - r, ouv[1] - r, ouv[2] + r, ouv[3] + r]);
    }

    // le cadre
    let relief;
    if (m.rendu.type === "image") {
      relief = cadrePhoto(ctx, m, ext, ep, pxParCm);
    } else if (flottant) {
      // caisse américaine : la toile est posée après le cadre, son ombre tombe
      // dans le jour sombre qui l'entoure
      relief = cadreDessine(ctx, m, ext, X(m.largeur_cm), pxParCm);
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = X(0.3); ctx.shadowOffsetX = X(0.1); ctx.shadowOffsetY = X(0.18);
      ctx.fillStyle = "#000";
      ctx.fillRect(ouv[0], ouv[1], ouv[2] - ouv[0], ouv[3] - ouv[1]);
      ctx.restore();
      oeuvreCouvrante(ctx, o.oeuvre, ouv);
    } else {
      relief = cadreDessine(ctx, m, ext, X(m.largeur_cm), pxParCm);
    }
    if (!flottant) ombreInterieure(ctx, vue, X(0.25 + 0.3 * relief), 0.42);
    if (o.vitre && !flottant) vitre(ctx, vue);
    return { pxParCm, dpr };
  }

  window.Rendu = { dessiner, preparer, profil };
})();
