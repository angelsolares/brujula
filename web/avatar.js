// Avatar vectorial: se dibuja con los rasgos que la persona elige, sin imágenes.
// La misma figura sirve de cuerpo completo (donde se nota la estatura y la
// complexión) y de retrato para los espacios chicos, recortando el viewBox
// alrededor de la cabeza en vez de dibujar dos veces.

const AVATAR_OPTIONS = {
  skin: { label: "Tono de piel", choices: [
    ["clara", "Clara"], ["morena_clara", "Morena clara"], ["morena", "Morena"],
    ["morena_oscura", "Morena oscura"], ["oscura", "Oscura"]] },
  face: { label: "Forma de la cara", choices: [
    ["ovalada", "Ovalada"], ["redonda", "Redonda"], ["cuadrada", "Cuadrada"], ["corazon", "De corazón"]] },
  hair: { label: "Corte de cabello", choices: [
    ["rapado", "Rapado"], ["corto", "Corto"], ["medio", "Media melena"], ["largo", "Largo"],
    ["rizado", "Rizado"], ["chongo", "Chongo"], ["trenzas", "Trenzas"]] },
  hair_color: { label: "Color de cabello", choices: [
    ["negro", "Negro"], ["castano", "Castaño"], ["rubio", "Rubio"], ["rojizo", "Rojizo"], ["canoso", "Cano"]] },
  facial_hair: { label: "Barba o bigote", choices: [
    ["ninguna", "Sin barba"], ["bigote", "Bigote"], ["candado", "Candado"], ["barba", "Barba"]] },
  height: { label: "Estatura", choices: [["baja", "Bajita"], ["media", "Media"], ["alta", "Alta"]] },
  build: { label: "Complexión", choices: [["delgada", "Delgada"], ["media", "Media"], ["robusta", "Robusta"]] },
  outfit: { label: "Color de la ropa", choices: [
    ["morado", "Morado"], ["rosa", "Rosa"], ["azul", "Azul"], ["verde", "Verde"], ["arena", "Arena"]] },
  glasses: { label: "Lentes", choices: [["no", "Sin lentes"], ["si", "Con lentes"]] },
};

const AVATAR_DEFAULTS = {
  skin: "morena", face: "ovalada", hair: "corto", hair_color: "negro",
  facial_hair: "ninguna", height: "media", build: "media", outfit: "morado", glasses: "no",
};

const AVATAR_SKIN = {
  clara: ["#f7d9c1", "#e0b294"], morena_clara: ["#eec19a", "#d19b72"],
  morena: ["#cd9268", "#ac744c"], morena_oscura: ["#9d6640", "#7d4d2e"], oscura: ["#6f452a", "#54321d"],
};
const AVATAR_HAIR_COLOR = {
  negro: ["#2a2333", "#161122"], castano: ["#6d4527", "#4c2d17"],
  rubio: ["#dcae56", "#bb8b34"], rojizo: ["#a9462a", "#82311b"], canoso: ["#bcb8c6", "#9a95a8"],
};
const AVATAR_OUTFIT = {
  morado: ["#7755c7", "#5d3fa6"], rosa: ["#ed5f86", "#c9436a"], azul: ["#2878d0", "#1d5da6"],
  verde: ["#2f9e6f", "#217a54"], arena: ["#d8a76a", "#b3844b"],
};
const AVATAR_PANTS = "#39406b";
const AVATAR_INK = "#2a2440";

// Cada estatura cambia el largo de las piernas y del torso, y también qué tan
// grande se ve la cabeza respecto al cuerpo: eso es lo que hace que una figura
// se lea bajita y otra alta, no solo el tamaño total.
const AVATAR_HEIGHTS = {
  baja: { head: 20, neck: 8, torso: 44, legs: 42 },
  media: { head: 18, neck: 10, torso: 50, legs: 56 },
  alta: { head: 17, neck: 11, torso: 54, legs: 66 },
};
const AVATAR_BUILDS = {
  delgada: { shoulder: 18, hip: 15, limb: 4.6, cheek: 0.9 },
  media: { shoulder: 22, hip: 18, limb: 5.8, cheek: 1 },
  robusta: { shoulder: 27, hip: 23, limb: 7.2, cheek: 1.12 },
};

const AVATAR_GROUND = 212;
const AVATAR_CX = 60;

function avatarTraits(source) {
  const traits = { ...AVATAR_DEFAULTS };
  Object.keys(AVATAR_OPTIONS).forEach((key) => {
    const value = source ? source[`avatar_${key}`] ?? source[key] : null;
    if (AVATAR_OPTIONS[key].choices.some(([option]) => option === value)) traits[key] = value;
  });
  return traits;
}

// Silueta de la cabeza. Cada forma es un trazo distinto porque una elipse
// escalada no alcanza a distinguir una cara cuadrada de una de corazón.
function avatarHeadPath(shape, cx, cy, r, cheek) {
  const w = r * 0.86 * cheek;
  if (shape === "redonda") return `<ellipse cx="${cx}" cy="${cy}" rx="${(r * 0.96 * cheek).toFixed(2)}" ry="${(r * 0.94).toFixed(2)}"`;
  if (shape === "cuadrada") {
    const half = r * 0.9 * cheek;
    return `<rect x="${(cx - half).toFixed(2)}" y="${(cy - r).toFixed(2)}" width="${(half * 2).toFixed(2)}" height="${(r * 1.95).toFixed(2)}" rx="${(r * 0.42).toFixed(2)}"`;
  }
  if (shape === "corazon") {
    return `<path d="M ${cx} ${(cy + r).toFixed(2)} C ${(cx - w * 0.72).toFixed(2)} ${(cy + r * 0.45).toFixed(2)} ${(cx - w).toFixed(2)} ${(cy - r * 0.35).toFixed(2)} ${(cx - w).toFixed(2)} ${(cy - r * 0.55).toFixed(2)} C ${(cx - w).toFixed(2)} ${(cy - r * 1.15).toFixed(2)} ${(cx + w).toFixed(2)} ${(cy - r * 1.15).toFixed(2)} ${(cx + w).toFixed(2)} ${(cy - r * 0.55).toFixed(2)} C ${(cx + w).toFixed(2)} ${(cy - r * 0.35).toFixed(2)} ${(cx + w * 0.72).toFixed(2)} ${(cy + r * 0.45).toFixed(2)} ${cx} ${(cy + r).toFixed(2)} Z"`;
  }
  return `<ellipse cx="${cx}" cy="${cy}" rx="${(r * 0.84 * cheek).toFixed(2)}" ry="${r.toFixed(2)}"`;
}

function avatarHairBack(style, cx, cy, r, w, dark) {
  if (style === "largo") {
    return `<path d="M ${(cx - w * 1.04).toFixed(2)} ${(cy - r * 0.3).toFixed(2)} C ${(cx - w * 1.16).toFixed(2)} ${(cy + r * 0.9).toFixed(2)} ${(cx - w * 0.98).toFixed(2)} ${(cy + r * 1.5).toFixed(2)} ${(cx - w * 0.82).toFixed(2)} ${(cy + r * 1.72).toFixed(2)} L ${(cx + w * 0.82).toFixed(2)} ${(cy + r * 1.72).toFixed(2)} C ${(cx + w * 0.98).toFixed(2)} ${(cy + r * 1.5).toFixed(2)} ${(cx + w * 1.16).toFixed(2)} ${(cy + r * 0.9).toFixed(2)} ${(cx + w * 1.04).toFixed(2)} ${(cy - r * 0.3).toFixed(2)} Z" fill="${dark}"/>`;
  }
  if (style === "trenzas") {
    const braid = (side) => {
      const x = cx + side * w * 1.05;
      return `<rect x="${(x - 3.2).toFixed(2)}" y="${(cy - r * 0.1).toFixed(2)}" width="6.4" height="${(r * 1.5).toFixed(2)}" rx="3.2" fill="${dark}"/>` +
        `<circle cx="${x.toFixed(2)}" cy="${(cy + r * 1.45).toFixed(2)}" r="4.1" fill="${dark}"/>`;
    };
    return braid(-1) + braid(1);
  }
  if (style === "rizado") {
    let bubbles = "";
    for (let i = 0; i < 7; i += 1) {
      const angle = Math.PI + (Math.PI * i) / 6;
      bubbles += `<circle cx="${(cx + Math.cos(angle) * w * 1.02).toFixed(2)}" cy="${(cy + Math.sin(angle) * r * 0.95).toFixed(2)}" r="${(r * 0.34).toFixed(2)}" fill="${dark}"/>`;
    }
    return bubbles;
  }
  if (style === "medio") {
    return `<path d="M ${(cx - w * 1.02).toFixed(2)} ${(cy - r * 0.25).toFixed(2)} L ${(cx - w * 1.02).toFixed(2)} ${(cy + r * 0.95).toFixed(2)} Q ${cx} ${(cy + r * 1.25).toFixed(2)} ${(cx + w * 1.02).toFixed(2)} ${(cy + r * 0.95).toFixed(2)} L ${(cx + w * 1.02).toFixed(2)} ${(cy - r * 0.25).toFixed(2)} Z" fill="${dark}"/>`;
  }
  return "";
}

function avatarHairFront(style, cx, cy, r, w, base, dark) {
  if (style === "rapado") {
    return `<path d="M ${(cx - w * 0.98).toFixed(2)} ${(cy - r * 0.28).toFixed(2)} Q ${cx} ${(cy - r * 1.28).toFixed(2)} ${(cx + w * 0.98).toFixed(2)} ${(cy - r * 0.28).toFixed(2)} Q ${cx} ${(cy - r * 0.68).toFixed(2)} ${(cx - w * 0.98).toFixed(2)} ${(cy - r * 0.28).toFixed(2)} Z" fill="${base}" opacity=".85"/>`;
  }
  const cap = `<path d="M ${(cx - w * 1.02).toFixed(2)} ${(cy - r * 0.16).toFixed(2)} Q ${(cx - w * 1.02).toFixed(2)} ${(cy - r * 1.16).toFixed(2)} ${cx} ${(cy - r * 1.16).toFixed(2)} Q ${(cx + w * 1.02).toFixed(2)} ${(cy - r * 1.16).toFixed(2)} ${(cx + w * 1.02).toFixed(2)} ${(cy - r * 0.16).toFixed(2)} Q ${(cx + w * 0.55).toFixed(2)} ${(cy - r * 0.52).toFixed(2)} ${(cx - w * 0.15).toFixed(2)} ${(cy - r * 0.42).toFixed(2)} Q ${(cx - w * 0.7).toFixed(2)} ${(cy - r * 0.36).toFixed(2)} ${(cx - w * 1.02).toFixed(2)} ${(cy - r * 0.16).toFixed(2)} Z" fill="${base}"/>`;
  if (style === "chongo") {
    return `<circle cx="${cx}" cy="${(cy - r * 1.28).toFixed(2)}" r="${(r * 0.42).toFixed(2)}" fill="${dark}"/>` + cap;
  }
  return cap;
}

function avatarFacialHair(style, cx, cy, r, w, base) {
  if (style === "ninguna") return "";
  const mouthY = cy + r * 0.42;
  if (style === "bigote") return "";
  if (style === "candado") {
    return `<path d="M ${(cx - w * 0.3).toFixed(2)} ${(mouthY + r * 0.22).toFixed(2)} Q ${cx} ${(mouthY + r * 0.52).toFixed(2)} ${(cx + w * 0.3).toFixed(2)} ${(mouthY + r * 0.22).toFixed(2)} Q ${cx} ${(mouthY + r * 0.3).toFixed(2)} ${(cx - w * 0.3).toFixed(2)} ${(mouthY + r * 0.22).toFixed(2)} Z" fill="${base}"/>`;
  }
  return `<path d="M ${(cx - w * 1.0).toFixed(2)} ${(cy + r * 0.14).toFixed(2)} Q ${(cx - w * 0.95).toFixed(2)} ${(cy + r * 1.06).toFixed(2)} ${cx} ${(cy + r * 1.06).toFixed(2)} Q ${(cx + w * 0.95).toFixed(2)} ${(cy + r * 1.06).toFixed(2)} ${(cx + w * 1.0).toFixed(2)} ${(cy + r * 0.14).toFixed(2)} Q ${(cx + w * 0.62).toFixed(2)} ${(cy + r * 0.4).toFixed(2)} ${cx} ${(cy + r * 0.38).toFixed(2)} Q ${(cx - w * 0.62).toFixed(2)} ${(cy + r * 0.4).toFixed(2)} ${(cx - w * 1.0).toFixed(2)} ${(cy + r * 0.14).toFixed(2)} Z" fill="${base}"/>`;
}

// La barba se pinta antes que la boca para que la boca quede encima y siga
// leyéndose; el bigote va después, que es como se encima en una cara real.
function avatarMustache(style, cx, cy, r, w, base) {
  if (style !== "bigote" && style !== "candado" && style !== "barba") return "";
  const mouthY = cy + r * 0.42;
  return `<path d="M ${(cx - w * 0.42).toFixed(2)} ${(mouthY - r * 0.2).toFixed(2)} Q ${cx} ${(mouthY + r * 0.02).toFixed(2)} ${(cx + w * 0.42).toFixed(2)} ${(mouthY - r * 0.2).toFixed(2)} Q ${cx} ${(mouthY - r * 0.3).toFixed(2)} ${(cx - w * 0.42).toFixed(2)} ${(mouthY - r * 0.2).toFixed(2)} Z" fill="${base}"/>`;
}

// Devuelve el trazo y su viewBox por separado, para poder anidar el avatar
// dentro de otro SVG (la brújula lo mete en su centro) sin recortar cadenas.
// `mode` es "cuerpo" (figura entera) o "retrato" (recortado a la cabeza).
function avatarShape(source, mode = "cuerpo") {
  const t = avatarTraits(source);
  const alto = AVATAR_HEIGHTS[t.height];
  const cuerpo = AVATAR_BUILDS[t.build];
  const [piel, pielSombra] = AVATAR_SKIN[t.skin];
  const [pelo, peloOscuro] = AVATAR_HAIR_COLOR[t.hair_color];
  const [ropa, ropaSombra] = AVATAR_OUTFIT[t.outfit];

  const cx = AVATAR_CX;
  const hipY = AVATAR_GROUND - alto.legs;
  const shoulderY = hipY - alto.torso;
  const headCy = shoulderY - alto.neck - alto.head * 0.92;
  const r = alto.head;
  const w = r * 0.84 * cuerpo.cheek;
  const sh = cuerpo.shoulder;
  const hip = cuerpo.hip;

  const piernas = `<rect x="${(cx - hip + 1).toFixed(2)}" y="${(hipY - 4).toFixed(2)}" width="${(cuerpo.limb * 1.7).toFixed(2)}" height="${(alto.legs + 4).toFixed(2)}" rx="${(cuerpo.limb * 0.85).toFixed(2)}" fill="${AVATAR_PANTS}"/>` +
    `<rect x="${(cx + hip - 1 - cuerpo.limb * 1.7).toFixed(2)}" y="${(hipY - 4).toFixed(2)}" width="${(cuerpo.limb * 1.7).toFixed(2)}" height="${(alto.legs + 4).toFixed(2)}" rx="${(cuerpo.limb * 0.85).toFixed(2)}" fill="${AVATAR_PANTS}"/>`;
  const zapatos = `<rect x="${(cx - hip - 0.5).toFixed(2)}" y="${(AVATAR_GROUND - 5).toFixed(2)}" width="${(cuerpo.limb * 2.1).toFixed(2)}" height="6" rx="3" fill="${AVATAR_INK}"/>` +
    `<rect x="${(cx + hip + 0.5 - cuerpo.limb * 2.1).toFixed(2)}" y="${(AVATAR_GROUND - 5).toFixed(2)}" width="${(cuerpo.limb * 2.1).toFixed(2)}" height="6" rx="3" fill="${AVATAR_INK}"/>`;

  const torso = `<path d="M ${(cx - sh).toFixed(2)} ${(shoulderY + 7).toFixed(2)} Q ${(cx - sh).toFixed(2)} ${shoulderY.toFixed(2)} ${(cx - sh + 7).toFixed(2)} ${(shoulderY - 1).toFixed(2)} L ${(cx + sh - 7).toFixed(2)} ${(shoulderY - 1).toFixed(2)} Q ${(cx + sh).toFixed(2)} ${shoulderY.toFixed(2)} ${(cx + sh).toFixed(2)} ${(shoulderY + 7).toFixed(2)} L ${(cx + hip).toFixed(2)} ${(hipY + 2).toFixed(2)} L ${(cx - hip).toFixed(2)} ${(hipY + 2).toFixed(2)} Z" fill="${ropa}"/>`;
  const brazos = [-1, 1].map((side) => {
    const x0 = cx + side * (sh - 2);
    const x1 = cx + side * (sh + 3);
    const y1 = hipY - 2;
    return `<path d="M ${x0.toFixed(2)} ${(shoulderY + 4).toFixed(2)} Q ${(x1 + side * 2).toFixed(2)} ${((shoulderY + y1) / 2).toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${ropaSombra}" stroke-width="${(cuerpo.limb * 1.5).toFixed(2)}" stroke-linecap="round"/>` +
      `<circle cx="${x1.toFixed(2)}" cy="${(y1 + 3).toFixed(2)}" r="${(cuerpo.limb * 0.78).toFixed(2)}" fill="${piel}"/>`;
  }).join("");

  const cuello = `<rect x="${(cx - r * 0.3).toFixed(2)}" y="${(headCy + r * 0.6).toFixed(2)}" width="${(r * 0.6).toFixed(2)}" height="${(alto.neck + r * 0.55).toFixed(2)}" rx="${(r * 0.28).toFixed(2)}" fill="${pielSombra}"/>`;
  const orejas = `<ellipse cx="${(cx - w * 1.02).toFixed(2)}" cy="${(headCy + r * 0.12).toFixed(2)}" rx="${(r * 0.16).toFixed(2)}" ry="${(r * 0.24).toFixed(2)}" fill="${pielSombra}"/>` +
    `<ellipse cx="${(cx + w * 1.02).toFixed(2)}" cy="${(headCy + r * 0.12).toFixed(2)}" rx="${(r * 0.16).toFixed(2)}" ry="${(r * 0.24).toFixed(2)}" fill="${pielSombra}"/>`;
  const cabeza = `${avatarHeadPath(t.face, cx, headCy, r, cuerpo.cheek)} fill="${piel}"/>`;

  const ojoY = headCy - r * 0.05;
  const ojoX = w * 0.42;
  const ojos = `<ellipse cx="${(cx - ojoX).toFixed(2)}" cy="${ojoY.toFixed(2)}" rx="${(r * 0.11).toFixed(2)}" ry="${(r * 0.14).toFixed(2)}" fill="${AVATAR_INK}"/>` +
    `<ellipse cx="${(cx + ojoX).toFixed(2)}" cy="${ojoY.toFixed(2)}" rx="${(r * 0.11).toFixed(2)}" ry="${(r * 0.14).toFixed(2)}" fill="${AVATAR_INK}"/>`;
  const cejas = `<path d="M ${(cx - ojoX - r * 0.17).toFixed(2)} ${(ojoY - r * 0.32).toFixed(2)} Q ${(cx - ojoX).toFixed(2)} ${(ojoY - r * 0.44).toFixed(2)} ${(cx - ojoX + r * 0.17).toFixed(2)} ${(ojoY - r * 0.32).toFixed(2)}" fill="none" stroke="${peloOscuro}" stroke-width="${(r * 0.09).toFixed(2)}" stroke-linecap="round"/>` +
    `<path d="M ${(cx + ojoX - r * 0.17).toFixed(2)} ${(ojoY - r * 0.32).toFixed(2)} Q ${(cx + ojoX).toFixed(2)} ${(ojoY - r * 0.44).toFixed(2)} ${(cx + ojoX + r * 0.17).toFixed(2)} ${(ojoY - r * 0.32).toFixed(2)}" fill="none" stroke="${peloOscuro}" stroke-width="${(r * 0.09).toFixed(2)}" stroke-linecap="round"/>`;
  const nariz = `<path d="M ${cx} ${(headCy + r * 0.1).toFixed(2)} L ${(cx - r * 0.09).toFixed(2)} ${(headCy + r * 0.26).toFixed(2)}" fill="none" stroke="${pielSombra}" stroke-width="${(r * 0.08).toFixed(2)}" stroke-linecap="round"/>`;
  const boca = `<path d="M ${(cx - w * 0.26).toFixed(2)} ${(headCy + r * 0.44).toFixed(2)} Q ${cx} ${(headCy + r * 0.66).toFixed(2)} ${(cx + w * 0.26).toFixed(2)} ${(headCy + r * 0.44).toFixed(2)}" fill="none" stroke="#a34a5c" stroke-width="${(r * 0.1).toFixed(2)}" stroke-linecap="round"/>`;
  const lentes = t.glasses === "si"
    ? `<g fill="none" stroke="${AVATAR_INK}" stroke-width="${(r * 0.07).toFixed(2)}"><circle cx="${(cx - ojoX).toFixed(2)}" cy="${ojoY.toFixed(2)}" r="${(r * 0.26).toFixed(2)}"/><circle cx="${(cx + ojoX).toFixed(2)}" cy="${ojoY.toFixed(2)}" r="${(r * 0.26).toFixed(2)}"/><path d="M ${(cx - ojoX + r * 0.26).toFixed(2)} ${ojoY.toFixed(2)} L ${(cx + ojoX - r * 0.26).toFixed(2)} ${ojoY.toFixed(2)}"/></g>`
    : "";

  // El cabello de atrás va antes que el cuello: si se pinta encima, cierra un
  // marco alrededor de la cara y la melena larga termina pareciendo capucha.
  const dibujo = piernas + zapatos + torso + brazos +
    avatarHairBack(t.hair, cx, headCy, r, w, peloOscuro) + cuello +
    cabeza + orejas + ojos + cejas + nariz +
    avatarFacialHair(t.facial_hair, cx, headCy, r, w, peloOscuro) + boca +
    avatarMustache(t.facial_hair, cx, headCy, r, w, peloOscuro) +
    avatarHairFront(t.hair, cx, headCy, r, w, pelo, peloOscuro) + lentes;

  const viewBox = mode === "retrato"
    ? `${(cx - r * 1.75).toFixed(2)} ${(headCy - r * 1.9).toFixed(2)} ${(r * 3.5).toFixed(2)} ${(r * 3.5).toFixed(2)}`
    : "0 0 120 220";
  return { viewBox, body: dibujo };
}

function avatarSvg(source, mode = "cuerpo") {
  const { viewBox, body } = avatarShape(source, mode);
  return `<svg class="avatar-svg avatar-svg-${mode}" viewBox="${viewBox}" role="img" aria-label="Mi avatar" focusable="false">${body}</svg>`;
}
