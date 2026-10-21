/* Œuvres d'exemple peintes au canvas, pour essayer sans photo. */
(function () {
  "use strict";

  function prng(graine) {
    let a = graine >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function toile(l, h) {
    const c = document.createElement("canvas");
    c.width = l; c.height = h;
    return c;
  }

  // Grain de surface (toile, papier ou film).
  function grain(ctx, l, h, force, graine) {
    const alea = prng(graine);
    const img = ctx.getImageData(0, 0, l, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (alea() - 0.5) * force;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  // Bloc de couleur aux bords frottés, à la manière des champs colorés.
  function champ(ctx, x, y, l, h, couleur, alea) {
    for (let i = 0; i < 260; i++) {
      const bx = x + (alea() - 0.5) * 18, by = y + (alea() - 0.5) * 18;
      ctx.globalAlpha = 0.05 + alea() * 0.06;
      ctx.fillStyle = couleur;
      ctx.beginPath();
      ctx.rect(bx + alea() * 10, by + alea() * 10, l - alea() * 20, h - alea() * 20);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function couleurs() {
    const l = 900, h = 1200, c = toile(l, h), ctx = c.getContext("2d"), alea = prng(7);
    ctx.fillStyle = "#6e1f17"; ctx.fillRect(0, 0, l, h);
    champ(ctx, 70, 80, l - 140, 560, "#e0862c", alea);
    champ(ctx, 80, 700, l - 160, 120, "#9c2c1c", alea);
    champ(ctx, 70, 860, l - 140, 270, "#c9562a", alea);
    grain(ctx, l, h, 18, 3);
    return { canvas: c, type: "toile", cm: { l: 60, h: 80 }, nom: "Champs de couleur" };
  }

  function paysage() {
    const l = 1200, h = 800, c = toile(l, h), ctx = c.getContext("2d"), alea = prng(11);
    const ciel = ctx.createLinearGradient(0, 0, 0, h * 0.6);
    ciel.addColorStop(0, "#5c7f9e"); ciel.addColorStop(1, "#cfdbe0");
    ctx.fillStyle = ciel; ctx.fillRect(0, 0, l, h);
    const plans = [["#8ea2b0", 0.42, 70], ["#6d8697", 0.5, 55], ["#4c6878", 0.58, 45], ["#2f4a52", 0.68, 35]];
    for (const [teinte, base, amp] of plans) {
      ctx.fillStyle = teinte;
      ctx.beginPath(); ctx.moveTo(0, h);
      let y = h * base;
      for (let x = 0; x <= l; x += 12) {
        y += (alea() - 0.5) * amp * 0.35;
        y = Math.max(h * base - amp, Math.min(h * base + amp, y));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(l, h); ctx.closePath(); ctx.fill();
    }
    const eau = ctx.createLinearGradient(0, h * 0.78, 0, h);
    eau.addColorStop(0, "#9fb4bf"); eau.addColorStop(1, "#56707c");
    ctx.fillStyle = eau; ctx.fillRect(0, h * 0.78, l, h * 0.22);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      const y = h * 0.8 + alea() * h * 0.18, x = alea() * l;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + alea() * 80, y); ctx.stroke();
    }
    grain(ctx, l, h, 10, 5);
    return { canvas: c, type: "papier", cm: { l: 42, h: 28 }, nom: "Paysage" };
  }

  function photo() {
    const l = 1000, h = 1250, c = toile(l, h), ctx = c.getContext("2d"), alea = prng(23);
    const ciel = ctx.createLinearGradient(0, 0, 0, h);
    ciel.addColorStop(0, "#dcdcdc"); ciel.addColorStop(1, "#8a8a8a");
    ctx.fillStyle = ciel; ctx.fillRect(0, 0, l, h);
    // façade en contre-plongée
    ctx.fillStyle = "#1c1c1c";
    ctx.beginPath(); ctx.moveTo(120, h); ctx.lineTo(380, 140); ctx.lineTo(1000, 40); ctx.lineTo(1000, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#e6e6e6";
    for (let r = 0; r < 14; r++) for (let k = 0; k < 6; k++) {
      const t = r / 14, x = 420 + k * 95 - t * 120 + r * 4, y = 200 + r * 75;
      ctx.globalAlpha = 0.35 + alea() * 0.5;
      ctx.fillRect(x, y, 52 - t * 8, 38);
    }
    ctx.globalAlpha = 1;
    const ombre = ctx.createLinearGradient(0, 0, l, 0);
    ombre.addColorStop(0, "rgba(0,0,0,0.35)"); ombre.addColorStop(0.5, "rgba(0,0,0,0)");
    ctx.fillStyle = ombre; ctx.fillRect(0, 0, l, h);
    grain(ctx, l, h, 34, 9);
    return { canvas: c, type: "photo", cm: { l: 30, h: 37.5 }, nom: "Photo noir et blanc" };
  }

  window.Exemples = { couleurs, paysage, photo };
})();
