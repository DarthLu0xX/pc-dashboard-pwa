/* Gráficas SVG del tablero, sin librerías (funcionan sin internet).
 * Especificación de marcas según la guía de dataviz: línea 2px, área al ~10%,
 * barras con punta redondeada de 4px, rejilla de 1px, punto ≥ 8px con anillo
 * del color de la superficie, tooltip con cruz que busca la X más cercana.
 */
(() => {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const SUPERFICIE = '#161a23';
  const fmt = new Intl.NumberFormat('es-MX');
  const cuenta = (n, unidad) => `${fmt.format(n)} ${n === 1 ? unidad.replace(/s$/, '') : unidad}`;
  const compacto = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '')}K` : String(n));

  /* ---------------- tooltip único ---------------- */
  let $tip;
  function tip() {
    if (!$tip) {
      $tip = document.createElement('div');
      $tip.className = 'tooltip';
      $tip.hidden = true;
      $tip.setAttribute('role', 'status');
      document.body.appendChild($tip);
    }
    return $tip;
  }
  function mostrarTip(x, y, valor, etiqueta) {
    const t = tip();
    t.replaceChildren();
    const b = document.createElement('b');
    b.textContent = valor;
    t.append(b, document.createTextNode(etiqueta));
    t.hidden = false;
    const w = t.offsetWidth;
    const xx = Math.min(Math.max(x, w / 2 + 8), window.innerWidth - w / 2 - 8);
    t.style.left = `${xx}px`;
    t.style.top = `${Math.max(y, t.offsetHeight + 20)}px`;
  }
  function ocultarTip() { if ($tip) $tip.hidden = true; }
  window.addEventListener('scroll', ocultarTip, { passive: true });

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  function maxBonito(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  // Curva monótona (no se pasa de los datos, nunca baja de 0)
  function curva(pts) {
    if (pts.length < 2) return '';
    const n = pts.length;
    const dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1][0] - pts[i][0];
      dy[i] = pts[i + 1][1] - pts[i][1];
      m[i] = dy[i] / dx[i];
    }
    t[0] = m[0];
    t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
    return d;
  }

  /* ---------------- área con cruz ----------------
   * puntos: [{ etiqueta, corta, t }]
   */
  function area(contenedor, puntos, { color = '#3987e5', alto = 160, unidad = 'servicios' } = {}) {
    contenedor.replaceChildren();
    if (!puntos.length) {
      contenedor.innerHTML = '<p class="chart-vacio">Sin registros en este periodo</p>';
      return;
    }
    const W = Math.max(contenedor.clientWidth, 260);
    const H = alto;
    const pl = 34, pr = 10, pt = 10, pb = 24;
    const max = maxBonito(Math.max(...puntos.map((p) => p.t), 1));
    const n = puntos.length;
    const x = (i) => (n === 1 ? (pl + W - pr) / 2 : pl + (i * (W - pl - pr)) / (n - 1));
    const y = (v) => pt + (H - pt - pb) * (1 - v / max);

    const svg = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
    svg.style.touchAction = 'pan-y';
    const total = puntos.reduce((s, p) => s + p.t, 0);
    svg.setAttribute('aria-label', `Tendencia: ${fmt.format(total)} ${unidad} en ${n} periodos, máximo ${fmt.format(Math.max(...puntos.map((p) => p.t)))}`);

    const id = `g${Math.random().toString(36).slice(2, 8)}`;
    const defs = el('defs', {}, svg);
    const lg = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.28 }, lg);
    el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, lg);

    for (const v of [0, max / 2, max]) {
      el('line', { class: 'grid', x1: pl, x2: W - pr, y1: y(v), y2: y(v) }, svg);
      const tx = el('text', { class: 'eje', x: pl - 8, y: y(v) + 4, 'text-anchor': 'end' }, svg);
      tx.textContent = compacto(v);
    }

    const pts = puntos.map((p, i) => [x(i), y(p.t)]);
    if (n > 1) {
      const d = curva(pts);
      el('path', { d: `${d}L${pts[n - 1][0]},${y(0)}L${pts[0][0]},${y(0)}Z`, fill: `url(#${id})` }, svg);
      // Si el último periodo va en curso (mes o día actual), ese tramo se dibuja punteado
      const parcial = puntos[n - 1].parcial && n > 2;
      const linea = { fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' };
      el('path', { ...linea, d: parcial ? curva(pts.slice(0, n - 1)) : d }, svg);
      if (parcial) el('path', { ...linea, d: `M${pts[n - 2][0]},${pts[n - 2][1]}L${pts[n - 1][0]},${pts[n - 1][1]}`, 'stroke-dasharray': '4 5', opacity: 0.85 }, svg);
    }
    // Punto final (o único) con su valor
    const ult = pts[n - 1];
    el('circle', { cx: ult[0], cy: ult[1], r: 4, fill: puntos[n - 1].parcial ? SUPERFICIE : color, stroke: puntos[n - 1].parcial ? color : SUPERFICIE, 'stroke-width': 2 }, svg);

    // Etiquetas X: inicio, medio y fin
    const idx = n === 1 ? [0] : n < 5 ? puntos.map((_, i) => i) : [0, Math.floor((n - 1) / 2), n - 1];
    idx.forEach((i) => {
      const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const tx = el('text', { class: 'eje', x: x(i), y: H - 6, 'text-anchor': anchor }, svg);
      tx.textContent = puntos[i].corta;
    });

    // Capa de interacción
    const cruz = el('line', { class: 'cruz', y1: pt, y2: y(0), visibility: 'hidden' }, svg);
    const punto = el('circle', { r: 5, fill: color, stroke: SUPERFICIE, 'stroke-width': 2, visibility: 'hidden' }, svg);
    const capa = el('rect', { x: pl, y: 0, width: W - pl - pr, height: H, fill: 'transparent' }, svg);
    const mover = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((px - pl) / (W - pl - pr)) * (n - 1))));
      const [cx, cy] = pts[i];
      cruz.setAttribute('x1', cx); cruz.setAttribute('x2', cx); cruz.setAttribute('visibility', 'visible');
      punto.setAttribute('cx', cx); punto.setAttribute('cy', cy); punto.setAttribute('visibility', 'visible');
      mostrarTip(r.left + cx, r.top + cy, cuenta(puntos[i].t, unidad), puntos[i].etiqueta);
    };
    const salir = () => { cruz.setAttribute('visibility', 'hidden'); punto.setAttribute('visibility', 'hidden'); ocultarTip(); };
    capa.addEventListener('pointermove', mover);
    capa.addEventListener('pointerdown', mover);
    capa.addEventListener('pointerleave', salir);
    capa.addEventListener('pointercancel', salir);
    contenedor.appendChild(svg);
  }

  /* ---------------- mini columnas por hora ---------------- */
  function miniHoras(porHora) {
    const max = Math.max(...porHora, 1);
    const pico = porHora.indexOf(Math.max(...porHora));
    const w = 6, gap = 2, H = 34;
    const rects = porHora.map((v, h) => {
      const alto = v ? Math.max(3, (v / max) * H) : 2;
      const col = v && h === pico ? '#3987e5' : 'rgba(57,135,229,.32)';
      return `<rect x="${h * (w + gap)}" y="${H - alto}" width="${w}" height="${alto}" rx="2" fill="${col}"/>`;
    }).join('');
    const W = 24 * (w + gap) - gap;
    return `<svg class="mini" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Servicios por hora del día, pico a las ${pico}:00">${rects}</svg>`;
  }

  /* ---------------- anillo de porcentaje ---------------- */
  function anillo(pct, color, pista, tam = 56) {
    const r = tam / 2 - 5, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct));
    return `<svg width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="${v}%">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${pista}" stroke-width="6"/>
      ${v > 0 ? `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${(c * v) / 100} ${c}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>` : ''}
      <text x="50%" y="54%" text-anchor="middle" font-size="12" font-weight="700" fill="#eef1f6">${Math.round(v)}%</text>
    </svg>`;
  }

  /* ---------------- dona ----------------
   * items: [{ nombre, t, color }]
   */
  function dona(items, centro, sub) {
    const total = items.reduce((s, i) => s + i.t, 0) || 1;
    const tam = 132, r = 52, grosor = 16, c = 2 * Math.PI * r;
    const hueco = items.filter((i) => i.t > 0).length > 1 ? 3 : 0; // separación de 2-3px entre segmentos
    let acum = 0;
    const segs = items.filter((i) => i.t > 0).map((i) => {
      const largo = (i.t / total) * c;
      const s = `<circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${i.color}" stroke-width="${grosor}"
        stroke-dasharray="${Math.max(largo - hueco, 0.5)} ${c}" stroke-dashoffset="${-acum}" transform="rotate(-90 ${tam / 2} ${tam / 2})"/>`;
      acum += largo;
      return s;
    }).join('');
    return `<svg width="100%" viewBox="0 0 ${tam} ${tam}" role="img" aria-label="${items.map((i) => `${i.nombre}: ${i.t}`).join(', ')}">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="#1b2130" stroke-width="${grosor}"/>
      ${segs}
      <text class="dona__centro" x="50%" y="50%" text-anchor="middle">${centro}</text>
      <text class="dona__centro-sub" x="50%" y="62%" text-anchor="middle">${sub}</text>
    </svg>`;
  }

  /* ---------------- mapa de calor día × hora ----------------
   * celdas: [[diaSemanaDjango(1=Dom..7=Sáb), hora, total], ...] → 7 filas × 12 bloques de 2 h
   */
  const RAMPA = ['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4'];
  const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  function calor(contenedor, celdas, unidad = 'servicios') {
    const m = Array.from({ length: 7 }, () => Array(12).fill(0));
    for (const [d, h, t] of celdas) m[(d + 5) % 7][Math.floor(h / 2)] += t;
    const max = Math.max(...m.flat(), 0);
    if (!max) {
      contenedor.innerHTML = '<p class="chart-vacio">Sin registros en este periodo</p>';
      return;
    }
    const color = (v) => (v ? RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / max) * RAMPA.length - 1e-9))] : '#1b2130');
    let html = '<div class="heat" role="grid" aria-label="Servicios por día de la semana y hora">';
    m.forEach((fila, d) => {
      html += `<span class="heat__dia">${DIAS[d]}</span>`;
      fila.forEach((v, b) => {
        html += `<button type="button" class="heat__celda" style="background:${color(v)}" data-v="${v}" data-d="${d}" data-b="${b}" aria-label="${DIAS_LARGOS[d]} ${b * 2}:00 a ${b * 2 + 2}:00, ${v} ${unidad}"></button>`;
      });
    });
    html += '<span></span>';
    for (const h of [0, 6, 12, 18]) html += `<span class="heat__hora">${h}h</span>`;
    html += '</div><div class="heat-leyenda"><span>Menos</span>';
    html += ['#1b2130', ...RAMPA].map((c) => `<i style="background:${c}"></i>`).join('');
    html += '<span>Más</span></div>';
    contenedor.innerHTML = html;

    let activa = null;
    const ver = (btn) => {
      if (activa) activa.classList.remove('is-activa');
      activa = btn;
      btn.classList.add('is-activa');
      const r = btn.getBoundingClientRect();
      const d = +btn.dataset.d, b = +btn.dataset.b;
      mostrarTip(r.left + r.width / 2, r.top, cuenta(+btn.dataset.v, unidad), `${DIAS_LARGOS[d]} · ${b * 2}:00–${b * 2 + 2}:00`);
    };
    contenedor.querySelectorAll('.heat__celda').forEach((btn) => {
      btn.addEventListener('pointerenter', () => ver(btn));
      btn.addEventListener('focus', () => ver(btn));
      btn.addEventListener('click', () => ver(btn));
      btn.addEventListener('pointerleave', () => { btn.classList.remove('is-activa'); ocultarTip(); });
      btn.addEventListener('blur', () => { btn.classList.remove('is-activa'); ocultarTip(); });
    });
  }

  window.Graficas = { area, miniHoras, anillo, dona, calor, ocultarTip };
})();
