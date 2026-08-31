// La brújula de los cinco perfiles, dibujada con los puntajes reales de la base.
// Antes esto era una ilustración con los números y el polígono pintados encima
// (23, 21, 31...), iguales para todo el mundo; aquí no hay nada fijo: el
// polígono, los números y el avatar del centro salen de los datos de la persona.

// El orden es el de la rueda impresa, en el sentido de las manecillas desde
// arriba, para que quien ya conoce el material no tenga que reaprenderlo.
const COMPASS_ORDER = ["analyst", "executor", "connection", "constancy", "leadership"];
const COMPASS_MAX = 40;
const COMPASS_RINGS = [10, 20, 30, 40];
// Solo se rotulan los anillos que caen fuera del avatar; los de más adentro
// quedarían encima de la cara y estorban más de lo que informan.
const COMPASS_TICKS = [20, 30, 40];

const COMPASS_GEO = {
  cx: 210, cy: 214, radar: 112, ringIn: 140, ringOut: 205, avatar: 46,
};

function compassTint(hex, blanco) {
  const n = parseInt((hex || "#888888").slice(1), 16);
  const mezcla = (canal) => Math.round(canal + (255 - canal) * blanco);
  return `rgb(${mezcla((n >> 16) & 255)},${mezcla((n >> 8) & 255)},${mezcla(n & 255)})`;
}

const compassPoint = (r, angle) => [
  COMPASS_GEO.cx + r * Math.cos(angle),
  COMPASS_GEO.cy + r * Math.sin(angle),
];

// Ángulo del eje de cada perfil: el primero apunta hacia arriba.
const compassAngle = (index) => (-90 + index * (360 / COMPASS_ORDER.length)) * (Math.PI / 180);

function compassSector(rIn, rOut, a0, a1) {
  const [x0, y0] = compassPoint(rOut, a0);
  const [x1, y1] = compassPoint(rOut, a1);
  const [x2, y2] = compassPoint(rIn, a1);
  const [x3, y3] = compassPoint(rIn, a0);
  return `M ${x0.toFixed(1)} ${y0.toFixed(1)} A ${rOut} ${rOut} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}` +
    ` L ${x2.toFixed(1)} ${y2.toFixed(1)} A ${rIn} ${rIn} 0 0 0 ${x3.toFixed(1)} ${y3.toFixed(1)} Z`;
}

function compassSvg(profiles, user) {
  const porClave = {};
  (profiles || []).forEach((p) => { porClave[p.profile_key] = p; });
  const orden = COMPASS_ORDER.map((clave) => porClave[clave]).filter(Boolean);
  if (!orden.length) return "";

  const { cx, cy, radar, ringIn, ringOut, avatar } = COMPASS_GEO;
  const paso = (2 * Math.PI) / orden.length;
  const dominante = orden.reduce((mejor, p) => (p.score > mejor.score ? p : mejor), orden[0]);

  const sectores = orden.map((perfil, i) => {
    const centro = compassAngle(i);
    const relleno = compassTint(perfil.color, perfil.profile_key === dominante.profile_key ? 0.6 : 0.78);
    return `<path d="${compassSector(ringIn, ringOut, centro - paso / 2, centro + paso / 2)}" fill="${relleno}" stroke="#fff" stroke-width="3"/>`;
  }).join("");

  const etiquetas = orden.map((perfil, i) => {
    const [tx, ty] = compassPoint((ringIn + ringOut) / 2, compassAngle(i));
    return `<text x="${tx.toFixed(1)}" y="${(ty - 6).toFixed(1)}" text-anchor="middle" class="compass-name" fill="${perfil.color}">${perfil.label.toUpperCase()}</text>` +
      `<text x="${tx.toFixed(1)}" y="${(ty + 22).toFixed(1)}" text-anchor="middle" class="compass-score" fill="${perfil.color}">${perfil.score}</text>`;
  }).join("");

  const anillos = COMPASS_RINGS.map((valor) => {
    const r = (valor / COMPASS_MAX) * radar;
    const puntos = orden.map((_, i) => compassPoint(r, compassAngle(i)).map((n) => n.toFixed(1)).join(",")).join(" ");
    return `<polygon points="${puntos}" fill="none" stroke="#d9d3ee" stroke-width="1" stroke-dasharray="3 3"/>`;
  }).join("");

  const ejes = orden.map((_, i) => {
    const [x, y] = compassPoint(radar, compassAngle(i));
    return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e0dbf0" stroke-width="1"/>`;
  }).join("");

  // La escala se rotula sobre el eje de arriba, como en la rueda impresa.
  const escala = COMPASS_TICKS.map((valor) => {
    const r = (valor / COMPASS_MAX) * radar;
    return `<text x="${cx + 5}" y="${(cy - r + 4).toFixed(1)}" class="compass-tick">${valor}</text>`;
  }).join("");

  const vertices = orden.map((perfil, i) => {
    const r = (Math.max(0, Math.min(COMPASS_MAX, perfil.score)) / COMPASS_MAX) * radar;
    return { perfil, punto: compassPoint(r, compassAngle(i)) };
  });
  const poligono = `<polygon points="${vertices.map(({ punto }) => punto.map((n) => n.toFixed(1)).join(",")).join(" ")}" fill="rgba(40,120,208,.16)" stroke="#2878d0" stroke-width="2.5" stroke-linejoin="round"/>`;
  const puntos = vertices.map(({ perfil, punto }) =>
    `<circle cx="${punto[0].toFixed(1)}" cy="${punto[1].toFixed(1)}" r="5.5" fill="${perfil.color}" stroke="#fff" stroke-width="2"><title>${perfil.label}: ${perfil.score} de ${COMPASS_MAX}</title></circle>`).join("");

  // Quien eligió "Sin avatar" no debe encontrarse uno en el centro: ahí va la
  // rosa de los vientos, que es el símbolo de la app.
  const base = `<circle cx="${cx}" cy="${cy}" r="${avatar}" fill="#fff" stroke="#efeaff" stroke-width="3"/>`;
  let centro;
  if (user?.gender === "neutral") {
    const puntas = [0, 1, 2, 3].map((i) => {
      const a = (i * 90 - 90) * (Math.PI / 180);
      const [px, py] = compassPoint(avatar * 0.72, a);
      const [ix, iy] = compassPoint(avatar * 0.2, a + Math.PI / 4);
      const [jx, jy] = compassPoint(avatar * 0.2, a - Math.PI / 4);
      return `<path d="M ${px.toFixed(1)} ${py.toFixed(1)} L ${ix.toFixed(1)} ${iy.toFixed(1)} L ${jx.toFixed(1)} ${jy.toFixed(1)} Z" fill="${i % 2 ? "#cfc6ea" : "#8d76cf"}"/>`;
    }).join("");
    centro = base + puntas;
  } else {
    const figura = avatarShape(user, "retrato");
    centro = base +
      `<g clip-path="url(#compassAvatarClip)"><svg x="${cx - avatar}" y="${cy - avatar}" width="${avatar * 2}" height="${avatar * 2}" viewBox="${figura.viewBox}">${figura.body}</svg></g>`;
  }

  return `<svg class="compass-svg" viewBox="0 0 420 440" role="img" aria-label="Mi brújula: ${orden.map((p) => `${p.label} ${p.score}`).join(", ")}">
    <defs><clipPath id="compassAvatarClip"><circle cx="${cx}" cy="${cy}" r="${avatar - 2}"/></clipPath></defs>
    ${sectores}${etiquetas}
    <circle cx="${cx}" cy="${cy}" r="${radar + 14}" fill="#fcfbff" stroke="#e7e2f7" stroke-width="1.5"/>
    ${anillos}${ejes}${centro}${escala}${poligono}${puntos}
  </svg>`;
}
