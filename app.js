/* Tablero ejecutivo de solo lectura — PC Magdalena Contreras
 * Datos: /api/pwa/resumen/ y /api/pwa/catalogo/ del Django (PythonAnywhere).
 * Cada respuesta se guarda en localStorage para que la app abra sin internet.
 */
(() => {
  'use strict';

  const CFG = window.PC_CONFIG;
  const G = window.Graficas;
  const TABS = ['operativo', 'medico', 'opiniones', 'informe'];
  const INICIO = 'operativo';
  const TIMEOUT_MS = 25000;
  const fmt = new Intl.NumberFormat('es-MX');

  // ?api=, ?token= y ?periodo= solo para pruebas en local
  const qs = new URLSearchParams(location.search);
  if (qs.has('api')) guardar('pc.api', qs.get('api') || null);
  if (qs.has('token')) guardar('pc.token', qs.get('token') || null);
  if (qs.has('periodo')) guardar('pc.periodo', qs.get('periodo'));
  if (qs.has('api') || qs.has('token') || qs.has('periodo')) history.replaceState(null, '', location.pathname + location.hash);
  const API_BASE = (leer('pc.api') || CFG.API_BASE).replace(/\/+$/, '');
  const TOKEN = leer('pc.token') || CFG.TOKEN;

  const estado = {
    tab: INICIO,
    periodo: leer('pc.periodo') || 'anio',
    desde: leer('pc.desde') || '',
    hasta: leer('pc.hasta') || '',
    colonia: leer('pc.colonia') || '',
    tipo: { operativo: leer('pc.tipo.operativo'), medico: leer('pc.tipo.medico') },
    lluvia: leer('pc.lluvia') === true,
    vistaTipos: 'sub',
    lista: null,
    catalogo: leer('pc.catalogo'),
    datos: null,
    cargando: false,
  };

  const $vista = document.getElementById('vista');
  const $btnActualizar = document.getElementById('btn-actualizar');
  const $tabs = [...document.querySelectorAll('.tabbar button')];

  /* ---------------- almacenamiento ---------------- */
  function leer(k) {
    try { const v = localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch { return null; }
  }
  function guardar(k, v) {
    try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio o bloqueado */ }
  }

  /* ---------------- utilidades ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => fmt.format(n || 0);
  const cuenta = (n, palabra = 'servicio', plural = `${palabra}s`) => `${num(n)} ${n === 1 ? palabra : plural}`;
  const vacioSi = (v, txt = 'No especificado') => (v == null || String(v).trim() === '' ? txt : v);

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
  const aFecha = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function fechaCorta(iso, conAnio = true) {
    if (!iso) return '';
    const d = aFecha(iso);
    return `${d.getDate()} ${MESES[d.getMonth()]}${conAnio ? ` ${d.getFullYear()}` : ''}`;
  }
  const hora = (h) => (h ? h.slice(0, 5) : '');
  function cuando(fecha, h) {
    if (!fecha) return '';
    const t = new Date(`${fecha}T${h || '00:00:00'}`);
    const min = Math.round((Date.now() - t) / 60000);
    if (h && min >= 0 && min < 60) return `Hace ${Math.max(min, 1)} min`;
    if (h && min >= 60 && min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
    return fechaCorta(fecha);
  }
  function hace(ts) {
    const min = Math.round((Date.now() - ts) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
    const d = new Date(ts);
    return `el ${d.getDate()} ${MESES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim();

  /* ---------------- periodo ---------------- */
  const PERIODOS = [
    { id: '30d', txt: '30 días' },
    { id: 'mes', txt: 'Este mes' },
    { id: 'anio', txt: 'Este año' },
    { id: 'todo', txt: 'Todo' },
  ];
  function rango() {
    const hoy = new Date();
    const fin = isoLocal(hoy);
    if (estado.periodo === '30d') { const d = new Date(hoy); d.setDate(d.getDate() - 29); return { inicio: isoLocal(d), fin }; }
    if (estado.periodo === 'mes') return { inicio: isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), fin };
    if (estado.periodo === 'anio') return { inicio: `${hoy.getFullYear()}-01-01`, fin };
    if (estado.periodo === 'rango' && estado.desde) return { inicio: estado.desde, fin: estado.hasta || fin };
    return { inicio: null, fin: null };
  }
  function rangoAnterior({ inicio, fin }) {
    if (!inicio) return null;
    if (estado.periodo === 'anio') {
      const menosUnAnio = (iso) => { const [y, m, d] = iso.split('-'); return `${+y - 1}-${m}-${m === '02' && d === '29' ? '28' : d}`; };
      return { inicio: menosUnAnio(inicio), fin: menosUnAnio(fin), anual: true };
    }
    const a = aFecha(inicio), b = aFecha(fin);
    const dias = Math.round((b - a) / 86400000) + 1;
    const af = new Date(a); af.setDate(af.getDate() - 1);
    const ai = new Date(af); ai.setDate(ai.getDate() - (dias - 1));
    return { inicio: isoLocal(ai), fin: isoLocal(af) };
  }

  /* ---------------- búsqueda tolerante ----------------
   * Acepta palabras sin acentos, incompletas o con un error de dedo:
   * "arbol caido", "arbl", "caida", "convulcion".
   */
  function distancia(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const v = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = v[0]; v[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = v[j];
        v[j] = Math.min(v[j] + 1, v[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    return v[b.length];
  }
  function puntaje(q, nombre, ruta) {
    if (!q) return 0;
    if (nombre === q) return 1000;
    if (nombre.startsWith(q)) return 900;
    const pos = nombre.indexOf(q);
    if (pos >= 0) return 800 - pos;
    const palabrasN = nombre.split(' ');
    const palabrasR = ruta.split(' ');
    let suma = 0, enNombre = true;
    for (const t of q.split(' ')) {
      const buscar = (palabras) => {
        let mejor = 0;
        for (const w of palabras) {
          if (!w) continue;
          if (w.startsWith(t)) mejor = Math.max(mejor, 1);
          else if (t.length >= 4) {
            const d = distancia(t, w.slice(0, t.length + 1));
            const tol = t.length >= 7 ? 2 : 1;
            if (d <= tol) mejor = Math.max(mejor, 1 - d * 0.2);
          }
        }
        return mejor;
      };
      let s = buscar(palabrasN);
      if (!s) { s = buscar(palabrasR) * 0.6; enNombre = false; }
      if (!s) return 0;
      suma += s;
    }
    return Math.round(300 * (suma / q.split(' ').length)) + (enNombre ? 100 : 0);
  }
  const PRIORIDAD = { subcategoria: 3, incidente: 3, detalle: 2, causa: 2, categoria: 1, tabla: 1 };
  function buscarEn(lista, texto, max = 12) {
    const q = normalizar(texto);
    if (!q) return [];
    return lista
      .map((it) => ({ it, s: puntaje(q, it._n || (it._n = normalizar(it.n)), it._r || (it._r = normalizar(it.r))) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || (PRIORIDAD[b.it.nv] || 0) - (PRIORIDAD[a.it.nv] || 0) || a.it.n.localeCompare(b.it.n))
      .slice(0, max)
      .map((x) => x.it);
  }
  function resaltar(nombre, texto) {
    const q = normalizar(texto);
    const n = normalizar(nombre);
    const i = q ? n.indexOf(q) : -1;
    if (i < 0) return esc(nombre);
    return `${esc(nombre.slice(0, i))}<mark>${esc(nombre.slice(i, i + q.length))}</mark>${esc(nombre.slice(i + q.length))}`;
  }
  const NIVELES = { categoria: 'Categoría', subcategoria: 'Subcategoría', detalle: 'Detalle', tabla: 'Tabla', incidente: 'Incidente', causa: 'Causa' };

  /* ---------------- red ---------------- */
  async function pedir(ruta, params = {}) {
    const url = new URL(`${API_BASE}/api/pwa/${ruta}/`);
    url.searchParams.set('token', TOKEN);
    for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Token no válido' : `Error del servidor (${res.status})`);
      return await res.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('El servidor tardó demasiado');
      if (e instanceof TypeError) throw new Error('Sin conexión');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  function paramsModulo(modulo) {
    const { inicio, fin } = rango();
    const tipo = estado.tipo[modulo];
    return {
      modulo,
      fecha_inicio: inicio,
      fecha_fin: fin,
      colonia: estado.colonia,
      nivel: tipo ? tipo.nv : '',
      id: tipo ? String(tipo.id) : '',
      comparar: estado.periodo === 'anio' ? 'anio' : '',
      lluvia: modulo === 'operativo' && estado.lluvia ? '1' : '',
    };
  }
  const claveCache = (p) => 'pc.datos.' + JSON.stringify(p);

  async function cargarCatalogo() {
    try {
      estado.catalogo = await pedir('catalogo');
      guardar('pc.catalogo', estado.catalogo);
    } catch { /* se queda con el guardado */ }
  }

  // Muestra primero lo guardado (si hay) y luego lo trae fresco del servidor
  async function cargarModulo(modulo, { forzar = false } = {}) {
    const p = paramsModulo(modulo);
    const clave = claveCache(p);
    const guardado = leer(clave);
    const $datos = document.getElementById('datos');
    if (!$datos) return;
    actualizarFiltrosUI(modulo);

    if (guardado) {
      pintarDatos(modulo, guardado.data);
      mostrarEstado(guardado.ts, !navigator.onLine);
    } else if (!$datos.children.length) {
      $datos.innerHTML = '<div class="esqueleto"></div><div class="esqueleto"></div>';
    }
    if (!forzar && guardado && Date.now() - guardado.ts < 60 * 1000) return;

    ocupado(true);
    try {
      const data = await pedir('resumen', p);
      guardar(clave, { ts: Date.now(), data });
      if (estado.tab === modulo && claveCache(paramsModulo(modulo)) === clave) {
        pintarDatos(modulo, data);
        mostrarEstado(Date.now(), false);
      }
    } catch (e) {
      if (estado.tab !== modulo || claveCache(paramsModulo(modulo)) !== clave) return;
      if (guardado) {
        mostrarEstado(guardado.ts, true, e.message);
      } else {
        $datos.innerHTML = errorHTML(e.message);
        $datos.querySelector('[data-reintentar]').addEventListener('click', () => cargarModulo(modulo, { forzar: true }));
        mostrarError('Sin datos');
      }
    } finally {
      ocupado(false);
    }
  }

  function ocupado(si) {
    estado.cargando = si;
    $btnActualizar.classList.toggle('is-loading', si);
    $vista.classList.toggle('is-refreshing', si);
  }

  function $estadoLinea() { return document.getElementById('estado'); }
  function mostrarEstado(ts, sinRed, msg) {
    const $e = $estadoLinea();
    if (!$e) return;
    $e.className = `estado${sinRed ? ' is-offline' : ''}`;
    $e.innerHTML = sinRed
      ? `<span class="estado__punto"></span><span><b>${esc(msg || 'Sin conexión')}</b> · datos de ${esc(hace(ts))}</span>`
      : `<span class="estado__punto"></span><span>En línea · actualizado ${esc(hace(ts))}</span>`;
  }
  function mostrarError(msg) {
    const $e = $estadoLinea();
    if (!$e) return;
    $e.className = 'estado is-error';
    $e.innerHTML = `<span class="estado__punto"></span><span><b>${esc(msg)}</b></span>`;
  }

  /* ---------------- íconos ---------------- */
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICON = {
    alerta: svg('M12 2 1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z'),
    botiquin: svg('M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm6 11h-3v3h-2v-3H8v-2h3v-3h2v3h3v2z'),
    colonia: svg('M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z'),
    chart: svg('M4 9h4v11H4V9zm6-5h4v16h-4V4zm6 8h4v8h-4v-8z'),
    unidad: svg('M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM19.5 9.5l1.96 2.5H17V9.5h2.5zM18 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z'),
    reloj: svg('M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z'),
    calor: svg('M3 3h4v4H3V3zm6 0h4v4H9V3zm6 0h4v4h-4V3zM3 9h4v4H3V9zm6 0h4v4H9V9zm6 0h4v4h-4V9zM3 15h4v4H3v-4zm6 0h4v4H9v-4zm6 0h4v4h-4v-4z'),
    tendencia: svg('M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6h-6z'),
    personas: svg('M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z'),
    hospital: svg('M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z'),
    historial: svg('M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z'),
    documento: svg('M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z'),
    lupa: svg('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'),
    calendario: svg('M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z'),
    lluvia: svg('M19.35 8.04A7.49 7.49 0 0 0 12 2C9.11 2 6.6 3.64 5.35 6.04A5.99 5.99 0 0 0 6 18h13a5 5 0 0 0 .35-9.96zM8 20l-1 2h2l1-2H8zm4 0-1 2h2l1-2h-2zm4 0-1 2h2l1-2h-2z'),
    arriba: svg('M7 14l5-5 5 5z'),
    abajo: svg('M7 10l5 5 5-5z'),
    pin: svg('M14 4v5c0 1.12.37 2.16 1 3H9c.65-.86 1-1.9 1-3V4h4m3-2H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3V4h1c.55 0 1-.45 1-1s-.45-1-1-1z'),
  };
  const titulo = (txt, icono, naranja = false, extra = '') =>
    `<div class="card__head"><h2 class="card__title"><i class="${naranja ? 'naranja' : ''}">${icono}</i>${esc(txt)}</h2>${extra}</div>`;

  /* ---------------- filtros ---------------- */
  function filtrosHTML(modulo) {
    const tipoTxt = modulo === 'operativo' ? 'Tipo de incidente' : 'Tipo de emergencia';
    const ejemplo = modulo === 'operativo' ? 'Ej. árbol caído, fuga de gas…' : 'Ej. caída, convulsión, choque…';
    return `
      <div class="estado" id="estado"><span class="estado__punto"></span><span>Cargando…</span></div>
      <section class="card filtros" aria-label="Filtros">
        <div class="chips" role="group" aria-label="Periodo">
          ${PERIODOS.map((p) => `<button type="button" class="chip" data-periodo="${p.id}">${p.txt}</button>`).join('')}
          <button type="button" class="chip" data-periodo="rango">${ICON.calendario}Fechas</button>
        </div>
        <div class="rango" id="rango" hidden>
          <label class="campo"><span>Desde</span><input class="entrada" type="date" id="f-desde"></label>
          <label class="campo"><span>Hasta</span><input class="entrada" type="date" id="f-hasta"></label>
        </div>
        <div class="filtros__fila">
          <label class="campo buscador"><span>${tipoTxt}</span>
            <input class="entrada" id="b-tipo" type="search" autocomplete="off" placeholder="${ejemplo}" role="combobox" aria-expanded="false" aria-controls="s-tipo">
            ${ICON.lupa}
            <ul class="sugerencias" id="s-tipo" role="listbox" hidden></ul>
          </label>
          <label class="campo buscador"><span>Colonia</span>
            <input class="entrada" id="b-colonia" type="search" autocomplete="off" placeholder="Buscar colonia…" role="combobox" aria-expanded="false" aria-controls="s-colonia">
            ${ICON.lupa}
            <ul class="sugerencias" id="s-colonia" role="listbox" hidden></ul>
          </label>
        </div>
        <div class="activos" id="activos"></div>
        <div class="periodo-texto" id="periodo-texto"></div>
        <button type="button" class="btn btn--informe" data-informe>${ICON.documento}Generar informe ejecutivo</button>
      </section>
      <div class="datos-vista" id="datos"></div>`;
  }

  function actualizarFiltrosUI(modulo) {
    document.querySelectorAll('[data-periodo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.periodo === estado.periodo)));
    const $rango = document.getElementById('rango');
    if ($rango) {
      $rango.hidden = estado.periodo !== 'rango';
      document.getElementById('f-desde').value = estado.desde;
      document.getElementById('f-hasta').value = estado.hasta;
      document.getElementById('f-hasta').max = isoLocal(new Date());
    }
    const tipo = estado.tipo[modulo];
    const pills = [];
    if (tipo) pills.push(`<span class="pill-filtro"><span>${esc(tipo.n)} <small>· ${esc(NIVELES[tipo.nv] || '')}</small></span><button type="button" data-quitar="tipo" aria-label="Quitar filtro ${esc(tipo.n)}">×</button></span>`);
    if (modulo === 'operativo' && estado.lluvia) pills.push(`<span class="pill-filtro pill-filtro--naranja"><span>${ICON.lluvia.replace('<svg', '<svg width="13" height="13" style="fill:currentColor;vertical-align:-2px"')} Solo por lluvias</span><button type="button" data-quitar="lluvia" aria-label="Quitar filtro de lluvias">×</button></span>`);
    if (estado.colonia) pills.push(`<span class="pill-filtro"><span>${ICON.pin.replace('<svg', '<svg width="12" height="12" style="fill:currentColor;vertical-align:-1px"')} ${esc(estado.colonia)}</span><button type="button" data-quitar="colonia" aria-label="Quitar colonia">×</button></span>`);
    const $act = document.getElementById('activos');
    if ($act) {
      $act.innerHTML = pills.join('');
      $act.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', () => {
        if (b.dataset.quitar === 'tipo') { estado.tipo[modulo] = null; guardar(`pc.tipo.${modulo}`, null); }
        else if (b.dataset.quitar === 'lluvia') { estado.lluvia = false; guardar('pc.lluvia', null); }
        else { estado.colonia = ''; guardar('pc.colonia', null); }
        cargarModulo(modulo);
      }));
    }
    const $pt = document.getElementById('periodo-texto');
    if ($pt) {
      const r = rango();
      const ant = rangoAnterior(r);
      $pt.innerHTML = r.inicio
        ? `<b>${fechaCorta(r.inicio)} – ${fechaCorta(r.fin)}</b>${ant ? ` · comparado con ${fechaCorta(ant.inicio)} – ${fechaCorta(ant.fin)}${ant.anual ? ' (mismo periodo del año pasado)' : ''}` : ''}`
        : '<b>Todo el historial</b>';
    }
  }

  function enlazarFiltros(modulo) {
    document.querySelector('[data-informe]').addEventListener('click', () => ir('informe'));
    document.querySelectorAll('[data-periodo]').forEach((b) =>
      b.addEventListener('click', () => {
        estado.periodo = b.dataset.periodo;
        if (estado.periodo === 'rango' && !estado.desde) {
          const d = new Date(); d.setDate(d.getDate() - 6);
          estado.desde = isoLocal(d);
          estado.hasta = isoLocal(new Date());
        }
        guardar('pc.periodo', estado.periodo);
        guardar('pc.desde', estado.desde || null);
        guardar('pc.hasta', estado.hasta || null);
        cargarModulo(modulo);
      })
    );
    const alCambiarFecha = () => {
      let d = document.getElementById('f-desde').value;
      let h = document.getElementById('f-hasta').value;
      if (d && h && d > h) [d, h] = [h, d];
      estado.desde = d;
      estado.hasta = h;
      guardar('pc.desde', d || null);
      guardar('pc.hasta', h || null);
      if (d) cargarModulo(modulo);
    };
    document.getElementById('f-desde').addEventListener('change', alCambiarFecha);
    document.getElementById('f-hasta').addEventListener('change', alCambiarFecha);

    const fuenteTipo = () => (estado.catalogo || {})[modulo === 'operativo' ? 'buscar_operativo' : 'buscar_medico'] || [];
    combobox('b-tipo', 's-tipo',
      (texto) => buscarEn(fuenteTipo(), texto).map((it) => ({
        valor: it,
        html: `<span class="s-nombre">${resaltar(it.n, texto)}</span><span class="s-ruta"><span class="s-nivel">${esc(NIVELES[it.nv] || '')}</span>${esc(it.r)}</span>`,
      })),
      (it) => {
        estado.tipo[modulo] = { id: it.id, nv: it.nv, n: it.n, r: it.r };
        guardar(`pc.tipo.${modulo}`, estado.tipo[modulo]);
        cargarModulo(modulo);
      },
      () => (fuenteTipo().length ? 'Sin coincidencias. Prueba con otra palabra.' : 'El catálogo aún no se descarga; revisa tu conexión.'));

    const fuenteColonias = () => ((estado.catalogo || {}).colonias || []).map((c) => ({ n: c, r: '', nv: 'colonia' }));
    combobox('b-colonia', 's-colonia',
      (texto) => buscarEn(fuenteColonias(), texto, 10).map((it) => ({ valor: it, html: `<span class="s-nombre">${resaltar(it.n, texto)}</span>` })),
      (it) => {
        estado.colonia = it.n;
        guardar('pc.colonia', it.n);
        cargarModulo(modulo);
      },
      () => 'Sin coincidencias.');
  }

  // Campo de búsqueda con lista de sugerencias (teclado y táctil)
  function combobox(idInput, idLista, buscar, alElegir, textoVacio) {
    const $in = document.getElementById(idInput);
    const $ul = document.getElementById(idLista);
    let items = [], activo = -1;
    const cerrar = () => { $ul.hidden = true; $in.setAttribute('aria-expanded', 'false'); activo = -1; };
    const elegir = (i) => {
      const it = items[i];
      if (!it) return;
      $in.value = '';
      cerrar();
      $in.blur();
      alElegir(it.valor);
    };
    const pintar = () => {
      const texto = $in.value;
      if (!normalizar(texto)) { cerrar(); return; }
      items = buscar(texto);
      $ul.innerHTML = items.length
        ? items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === activo}">${it.html}</li>`).join('')
        : `<li class="s-vacio">${esc(textoVacio())}</li>`;
      $ul.hidden = false;
      $in.setAttribute('aria-expanded', 'true');
    };
    $in.addEventListener('input', () => { activo = -1; pintar(); });
    $in.addEventListener('focus', () => { if ($in.value) pintar(); });
    $in.addEventListener('keydown', (e) => {
      if ($ul.hidden) return;
      if (e.key === 'ArrowDown') { activo = Math.min(items.length - 1, activo + 1); pintar(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { activo = Math.max(0, activo - 1); pintar(); e.preventDefault(); }
      else if (e.key === 'Enter') { elegir(activo >= 0 ? activo : 0); e.preventDefault(); }
      else if (e.key === 'Escape') cerrar();
    });
    $in.addEventListener('blur', () => setTimeout(cerrar, 150));
    $ul.addEventListener('pointerdown', (e) => e.preventDefault());
    $ul.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (li) elegir(+li.dataset.i);
    });
  }

  function errorHTML(msg) {
    return `
      <section class="card error-card" role="alert">
        ${titulo('No se pudieron cargar los datos', ICON.alerta, true)}
        <p>${esc(msg)}. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" class="btn" data-reintentar>Reintentar</button>
      </section>`;
  }

  /* ---------------- piezas de datos ---------------- */
  function delta(total, anterior) {
    if (anterior == null) return '';
    if (!anterior) return total ? '<span class="delta">Nuevo vs periodo anterior</span>' : '';
    const pct = ((total - anterior) / anterior) * 100;
    const r = Math.round(pct * 10) / 10;
    const flecha = r > 0 ? ICON.arriba : r < 0 ? ICON.abajo : '';
    return `<span class="delta" title="Periodo anterior: ${num(anterior)}">${flecha}${r > 0 ? '+' : ''}${r.toFixed(1)}% <span style="color:var(--text-3);font-weight:500">vs ${num(anterior)}</span></span>`;
  }

  // Completa la serie con ceros para que la tendencia no salte periodos vacíos
  function puntosSerie(d) {
    const mapa = new Map((d.serie || []).map((s) => [s.p, s.t]));
    const out = [];
    const r = rango();
    if (d.granularidad === 'dia' && r.inicio) {
      for (let f = aFecha(r.inicio), fin = aFecha(r.fin); f <= fin; f.setDate(f.getDate() + 1)) {
        const iso = isoLocal(f);
        const hoy = iso === isoLocal(new Date());
        out.push({ t: mapa.get(iso) || 0, parcial: hoy, corta: `${f.getDate()} ${MESES[f.getMonth()]}`, etiqueta: `${DIAS_CORTOS[f.getDay()]} ${f.getDate()} ${MESES[f.getMonth()]} ${f.getFullYear()}${hoy ? ' (hoy, en curso)' : ''}` });
      }
      return out;
    }
    const claves = [...mapa.keys()].sort();
    if (!claves.length) return out;
    const desde = r.inicio ? aFecha(r.inicio) : aFecha(claves[0]);
    const hasta = r.fin ? aFecha(r.fin) : aFecha(claves[claves.length - 1]);
    const ahora = new Date();
    for (let f = new Date(desde.getFullYear(), desde.getMonth(), 1); f <= hasta; f.setMonth(f.getMonth() + 1)) {
      const iso = isoLocal(f);
      const enCurso = f.getFullYear() === ahora.getFullYear() && f.getMonth() === ahora.getMonth();
      out.push({ t: mapa.get(iso) || 0, parcial: enCurso, corta: `${MESES[f.getMonth()]} ${String(f.getFullYear()).slice(2)}`, etiqueta: `${MESES_LARGOS[f.getMonth()]} ${f.getFullYear()}${enCurso ? ' (en curso)' : ''}` });
    }
    return out;
  }

  function barras(items, nombre, sub, { max = 8, naranja = false, total = 0, vacio = 'Sin registros en este periodo' } = {}) {
    if (!items || !items.length) return `<p class="vacio">${vacio}</p>`;
    const top = items.slice(0, max);
    const mayor = Math.max(...top.map((i) => i.total), 1);
    return `<div class="barras${naranja ? ' barras--naranja' : ''}">${top.map((it, i) => `
      <div class="barra${i === 0 ? ' barra--top' : ''}">
        <div class="barra__texto">
          <span class="barra__nombre">${esc(vacioSi(nombre(it)))}${sub && sub(it) ? `<small>${esc(sub(it))}</small>` : ''}</span>
          <span class="barra__valor">${num(it.total)}${total ? `<small>${Math.round((it.total / total) * 100)}%</small>` : ''}</span>
        </div>
        <div class="barra__pista"><div class="barra__relleno" style="width:${((it.total / mayor) * 100).toFixed(1)}%"></div></div>
      </div>`).join('')}</div>`;
  }

  const COLORES = ['#3987e5', '#d95926', '#199e70'];
  function donaHTML(items, campo, etiqueta, centro, sub) {
    if (!items || !items.length) return '<p class="vacio">Sin registros en este periodo</p>';
    const total = items.reduce((s, i) => s + i.total, 0) || 1;
    // Más de 3 partes se agrupan en "Otros" (máximo 3 colores validados)
    let lista = items.slice(0, 3);
    if (items.length > 3) lista = [...items.slice(0, 2), { [campo]: 'Otros', total: items.slice(2).reduce((s, i) => s + i.total, 0) }];
    const partes = lista.map((it, i) => ({ nombre: etiqueta(vacioSi(it[campo])), t: it.total, color: COLORES[i] }));
    return `<div class="dona">
      <div>${G.dona(partes, num(centro), centro === 1 ? ({ servicios: 'servicio', atenciones: 'atención', pacientes: 'paciente' }[sub] || sub) : sub)}</div>
      <ul class="leyenda">${partes.map((p) => `<li><i style="background:${p.color}"></i><span>${esc(p.nombre)}</span><b>${num(p.t)}<small>${Math.round((p.t / total) * 100)}%</small></b></li>`).join('')}</ul>
    </div>`;
  }

  function heroHTML(label, d, unidad) {
    return `
      <section class="card hero">
        <div class="hero__label">${esc(label)}</div>
        <div class="hero__fila"><span class="hero__valor num">${num(d.total)}</span>${delta(d.total, d.anterior)}</div>
        <div class="hero__nota">${unidad === 'atenciones' ? 'Atenciones' : 'Servicios'} por ${d.granularidad === 'dia' ? 'día' : 'mes'} · toca la gráfica para ver el detalle${puntosSerie(d).some((p) => p.parcial) ? ` · <span class="hero__en-curso">┄ ${d.granularidad === 'dia' ? 'hoy' : 'el mes actual'} va en curso</span>` : ''}</div>
        <div class="chart" data-chart="area" data-unidad="${unidad}"></div>
      </section>`;
  }

  function kpi(label, valor, sub, extra = '', texto = false) {
    return `<section class="card kpi">
      <span class="kpi__label">${esc(label)}</span>
      <div class="kpi__fila"><span class="kpi__valor${texto ? ' kpi__valor--texto' : ''} num">${valor}</span>${extra}</div>
      ${sub ? `<span class="kpi__sub">${sub}</span>` : ''}
    </section>`;
  }

  const notaSinHora = (d) => (d.sin_hora ? `No cuenta ${cuenta(d.sin_hora, 'registro')} de carga masiva sin hora (quedaron a las 12:00)` : '');

  function horaPicoKPI(d, singular = 'servicio', plural = 'servicios') {
    const ph = d.por_hora || [];
    const max = ph.length ? Math.max(...ph) : 0;
    const pico = d.hora_pico && d.hora_pico !== 'No disponible' ? d.hora_pico.replace(' hrs', '') : '—';
    return `<section class="card kpi">
      <span class="kpi__label">Hora pico</span>
      <span class="kpi__valor num">${esc(pico)}</span>
      <span class="kpi__sub">${max ? `${cuenta(max, singular, plural)} en esa hora` : 'Sin datos'}</span>
      ${ph.length ? G.miniHoras(ph) : ''}
      ${d.sin_hora ? `<span class="kpi__nota">${notaSinHora(d)}</span>` : ''}
    </section>`;
  }

  function diaActivoKPI(d, singular = 'servicio', plural = 'servicios') {
    const dia = d.dia_mas_activo;
    return kpi('Día más activo', dia ? esc(fechaCorta(dia.fecha, false)) : '—', dia ? `${esc(String(aFecha(dia.fecha).getFullYear()))} · ${cuenta(dia.total, singular, plural)}` : 'Sin datos');
  }

  const tarjeta = (r, modulo) => modulo === 'operativo' ? `
      <article class="servicio${r.referente_lluvias === 'SI' ? ' servicio--naranja' : ''}">
        <div class="servicio__top"><h3>${esc(vacioSi(r.tipo_incidente__subcategoria__nombre, 'Incidente'))}</h3><span class="servicio__hora">${esc(hora(r.hora_salida))}</span></div>
        <p class="servicio__meta">${esc(cuando(r.fecha_servicio, r.hora_salida))} · ${esc(vacioSi(r.colonia, 'Colonia no especificada'))}</p>
        ${r.descripcion_incidente ? `<p class="servicio__desc">${esc(r.descripcion_incidente)}</p>` : ''}
        <div class="etiquetas">
          ${r.tipo_incidente__subcategoria__categoria__nombre ? `<span class="etiqueta etiqueta--azul">${esc(r.tipo_incidente__subcategoria__categoria__nombre)}</span>` : ''}
          ${r.tipo_incidente__nombre ? `<span class="etiqueta">${esc(r.tipo_incidente__nombre)}</span>` : ''}
          ${r.unidad_transporte ? `<span class="etiqueta">Unidad ${esc(r.unidad_transporte)}</span>` : ''}
          ${r.referente_lluvias === 'SI' ? '<span class="etiqueta etiqueta--naranja">Por lluvia</span>' : ''}
        </div>
      </article>` : `
      <article class="servicio${r.requiere_traslado ? ' servicio--naranja' : ''}">
        <div class="servicio__top"><h3>${esc(vacioSi(r.incidente_medico__nombre, 'Atención médica'))}</h3><span class="servicio__hora">${esc(hora(r.hora_servicio))}</span></div>
        <p class="servicio__meta">${esc(cuando(r.fecha_servicio, r.hora_servicio))} · ${esc(vacioSi(r.colonia, 'Colonia no especificada'))}</p>
        ${r.causa_probable__nombre ? `<p class="servicio__desc">Causa probable: ${esc(r.causa_probable__nombre)}</p>` : ''}
        <div class="etiquetas">
          ${r.incidente_medico__tabla__nombre ? `<span class="etiqueta etiqueta--azul">${esc(r.incidente_medico__tabla__nombre)}</span>` : ''}
          ${r.unidad_atiende ? `<span class="etiqueta">${esc(r.unidad_atiende)}</span>` : ''}
          ${r.requiere_traslado ? `<span class="etiqueta etiqueta--naranja">Traslado${r.hospital_receptor ? ` · ${esc(r.hospital_receptor)}` : ''}</span>` : '<span class="etiqueta">Atendido en sitio</span>'}
        </div>
      </article>`;

  const POR_PAGINA = 25;
  function serviciosHTML(regs, total) {
    if (!regs || !regs.length) return '<p class="vacio">Sin servicios en este periodo</p>';
    return `<div class="servicios" data-lista></div>
      <div class="lista-pie">
        <p class="lista-pie__texto" data-lista-texto></p>
        <div class="lista-pie__botones" data-lista-botones>
          <button type="button" class="btn btn--secundario" data-cargar="mas">Cargar ${POR_PAGINA} más</button>
          <button type="button" class="btn btn--secundario" data-cargar="todos">Cargar todos (${num(total)})</button>
        </div>
      </div>`;
  }

  // Pinta la lista y trae más servicios del servidor cuando hace falta
  function pintarLista() {
    const L = estado.lista;
    const $l = document.querySelector('[data-lista]');
    if (!L || !$l) return;
    $l.innerHTML = L.items.slice(0, L.visibles).map((r) => tarjeta(r, L.modulo)).join('');
    const mostrados = Math.min(L.visibles, L.items.length);
    const $t = document.querySelector('[data-lista-texto]');
    if ($t) $t.textContent = L.cargando ? L.cargando : `Mostrando ${num(mostrados)} de ${num(L.total)}`;
    const $b = document.querySelector('[data-lista-botones]');
    if ($b) $b.hidden = mostrados >= L.total;
    document.querySelectorAll('[data-cargar]').forEach((b) => (b.disabled = !!L.cargando));
  }

  async function cargarLista(cuantos) {
    const L = estado.lista;
    if (!L || L.cargando) return;
    const meta = Math.min(L.total, cuantos === 'todos' ? L.total : L.visibles + POR_PAGINA);
    try {
      while (L.items.length < meta) {
        if (estado.lista !== L) return; // cambió el filtro o la pestaña
        L.cargando = `Cargando ${num(L.items.length)} de ${num(meta)}…`;
        pintarLista();
        const res = await pedir('resumen', { ...L.params, lista: '1', desde: String(L.items.length), cuantos: String(Math.min(500, meta - L.items.length)) });
        if (!res.registros || !res.registros.length) break;
        L.items.push(...res.registros);
        L.total = res.total;
      }
      L.cargando = '';
      L.visibles = meta;
    } catch (e) {
      L.cargando = '';
      L.visibles = L.items.length;
      if (estado.lista === L) {
        pintarLista();
        const $t = document.querySelector('[data-lista-texto]');
        if ($t) $t.textContent = `${e.message}. Se muestran ${num(L.items.length)} de ${num(L.total)}.`;
        return;
      }
    }
    if (estado.lista === L) pintarLista();
  }

  /* ---------------- pantallas ---------------- */
  function pintarDatos(modulo, data) {
    const $datos = document.getElementById('datos');
    if (!$datos) return;
    estado.datos = data;
    const d = modulo === 'operativo' ? data.operativos : data.medicos;
    if (!d) { $datos.innerHTML = errorHTML('Respuesta incompleta del servidor'); return; }
    $datos.innerHTML = modulo === 'operativo' ? operativoHTML(d) : medicoHTML(d);

    const unidad = modulo === 'operativo' ? 'servicios' : 'atenciones';
    const $area = $datos.querySelector('[data-chart="area"]');
    if ($area) G.area($area, puntosSerie(d), { unidad });
    const $calor = $datos.querySelector('[data-chart="calor"]');
    if ($calor) G.calor($calor, d.heatmap || [], unidad);

    estado.lista = { modulo, params: paramsModulo(modulo), items: (d.registros || []).slice(), total: d.total, visibles: 10, cargando: '' };
    pintarLista();
    $datos.querySelectorAll('[data-cargar]').forEach((b) => b.addEventListener('click', () => cargarLista(b.dataset.cargar)));
    $datos.querySelector('[data-lluvia]')?.addEventListener('click', () => {
      estado.lluvia = !estado.lluvia;
      guardar('pc.lluvia', estado.lluvia || null);
      cargarModulo('operativo');
      if (estado.lluvia) document.getElementById('activos')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $datos.querySelectorAll('[data-vista-tipos]').forEach((b) => b.addEventListener('click', () => {
      estado.vistaTipos = b.dataset.vistaTipos;
      pintarDatos(modulo, estado.datos);
    }));
  }

  function lluviaKPI(d) {
    const activo = estado.lluvia;
    return `<button type="button" class="card kpi kpi--accion${activo ? ' is-activo' : ''}" data-lluvia aria-pressed="${activo}">
      <span class="kpi__label">Por lluvias</span>
      <span class="kpi__fila"><span class="kpi__valor num">${num(d.por_lluvia)}</span>${activo ? '' : G.anillo(d.pct_lluvia || 0, '#d95926', '#4a2617')}</span>
      <span class="kpi__sub">${activo ? 'Mostrando solo servicios por lluvia' : `${d.pct_lluvia || 0}% del total`}</span>
      <span class="kpi__accion">${activo ? 'Quitar filtro ✕' : 'Ver estos servicios ›'}</span>
    </button>`;
  }

  function operativoHTML(d) {
    const col = (d.top_colonias || [])[0];
    const porCategoria = estado.vistaTipos === 'cat' && d.desglose_categoria;
    const selector = d.desglose_categoria ? `<div class="segmentado" role="group" aria-label="Agrupar por">
      <button type="button" data-vista-tipos="sub" aria-pressed="${!porCategoria}">Tipo</button>
      <button type="button" data-vista-tipos="cat" aria-pressed="${!!porCategoria}">Categoría</button></div>` : '';
    return `
      ${heroHTML('Servicios operativos', d, 'servicios')}
      <div class="grid-kpi">
        ${lluviaKPI(d)}
        ${horaPicoKPI(d)}
        ${diaActivoKPI(d)}
        ${kpi('Colonia con más servicios', col ? esc(vacioSi(col.colonia)) : '—', col ? cuenta(col.total) : 'Sin datos', '', true)}
      </div>
      <section class="card">
        ${titulo('¿Cuándo ocurren?', ICON.calor, false, '<span class="card__meta">Día × hora</span>')}
        <div class="chart" data-chart="calor"></div>
        ${d.sin_hora ? `<p class="card__pie">${notaSinHora(d)}.</p>` : ''}
      </section>
      <div class="grid-2">
        <section class="card">
          ${titulo('Incidentes más frecuentes', ICON.chart, false, selector)}
          ${porCategoria
            ? barras(d.desglose_categoria, (i) => i.tipo_incidente__subcategoria__categoria__nombre, null, { total: d.total })
            : barras(d.desglose_tipo, (i) => i.tipo_incidente__subcategoria__nombre, (i) => i.tipo_incidente__subcategoria__categoria__nombre, { total: d.total })}
        </section>
        <section class="card">
          ${titulo('Top colonias', ICON.colonia, true)}
          ${barras(d.top_colonias, (i) => i.colonia, null, { naranja: true, max: 10, total: d.total })}
        </section>
      </div>
      <div class="grid-2">
        <section class="card">
          ${titulo('Turnos', ICON.reloj)}
          ${donaHTML(d.distribucion_turnos, 'turno', (v) => v, d.total, 'servicios')}
        </section>
        <section class="card">
          ${titulo('Unidades más desplegadas', ICON.unidad)}
          ${barras(d.unidades_mas_desplegadas, (i) => (i.unidad_transporte ? `Unidad ${i.unidad_transporte}` : ''), null, { total: d.total })}
        </section>
      </div>
      <section class="card">
        ${titulo(estado.lluvia ? 'Servicios por lluvias' : 'Servicios', ICON.historial, estado.lluvia, '<span class="card__meta">Más recientes primero</span>')}
        ${serviciosHTML(d.registros, d.total)}
      </section>`;
  }

  function medicoHTML(d) {
    const sexo = { H: 'Hombre', M: 'Mujer', N: 'No especificado' };
    const pctSitio = d.total ? Math.round(((d.atendidos_en_sitio || 0) / d.total) * 1000) / 10 : 0;
    return `
      ${heroHTML('Atenciones médicas', d, 'atenciones')}
      <div class="grid-kpi">
        ${kpi('Traslados', num(d.traslados), `${d.pct_traslado || 0}% del total`, G.anillo(d.pct_traslado || 0, '#d95926', '#4a2617'))}
        ${kpi('Atendidos en sitio', num(d.atendidos_en_sitio), `${pctSitio}% del total`, G.anillo(pctSitio, '#3987e5', '#1d3557'))}
        ${horaPicoKPI(d, 'atención', 'atenciones')}
        ${diaActivoKPI(d, 'atención', 'atenciones')}
      </div>
      <section class="card">
        ${titulo('¿Cuándo ocurren?', ICON.calor, false, '<span class="card__meta">Día × hora</span>')}
        <div class="chart" data-chart="calor"></div>
        ${d.sin_hora ? `<p class="card__pie">${notaSinHora(d)}.</p>` : ''}
      </section>
      <div class="grid-2">
        <section class="card">
          ${titulo('Tipos de emergencia', ICON.chart)}
          ${barras(d.desglose_tipo, (i) => i.incidente_medico__nombre, (i) => i.incidente_medico__tabla__nombre, { total: d.total })}
        </section>
        <section class="card">
          ${titulo('Top colonias', ICON.colonia, true)}
          ${barras(d.top_colonias, (i) => i.colonia, null, { naranja: true, max: 10, total: d.total })}
        </section>
      </div>
      <div class="grid-2">
        <section class="card">
          ${titulo('Causas probables', ICON.botiquin, true)}
          ${barras(d.causas_probables, (i) => i.causa_probable__nombre, null, { naranja: true, total: d.total })}
        </section>
        <section class="card">
          ${titulo('Turnos', ICON.reloj)}
          ${donaHTML(d.distribucion_turnos, 'turno', (v) => v, d.total, 'atenciones')}
        </section>
      </div>
      <div class="grid-2">
        <section class="card">
          ${titulo('Sexo del paciente', ICON.personas)}
          ${donaHTML(d.distribucion_sexo, 'paciente_sexo', (v) => sexo[v] || v, d.total, 'pacientes')}
        </section>
        <section class="card">
          ${titulo('Grupos de edad', ICON.personas)}
          ${barras(d.grupos_edad, (i) => i.grupo, null, { total: d.total })}
        </section>
      </div>
      <div class="grid-2">
        <section class="card">
          ${titulo('Hospitales receptores', ICON.hospital, true)}
          ${barras(d.hospitales_receptores, (i) => i.hospital_receptor, null, { naranja: true, total: d.traslados, vacio: 'Sin traslados en este periodo' })}
        </section>
        <section class="card">
          ${titulo('Unidades que atendieron', ICON.unidad)}
          ${barras(d.unidades_que_atendieron, (i) => i.unidad_atiende, null, { total: d.total })}
        </section>
      </div>
      <section class="card">
        ${titulo('Atenciones', ICON.historial, false, '<span class="card__meta">Más recientes primero</span>')}
        ${serviciosHTML(d.registros, d.total)}
      </section>`;
  }

  function opinionesHTML() {
    return `
      <section class="card aviso">
        <div class="aviso__icono">${ICON.documento}</div>
        <h2>Opiniones Técnicas de Riesgo</h2>
        <p>Aquí podrás consultar los dictámenes de riesgo, su nivel y el documento de cada uno.</p>
        <span class="badge">Próximamente</span>
      </section>`;
  }

  // Informe ejecutivo: ambos módulos con el periodo y la colonia seleccionados,
  // más el periodo de comparación, para que informe.js redacte el documento.
  async function obtener(p) {
    const clave = claveCache(p);
    try {
      const data = await pedir('resumen', p);
      guardar(clave, { ts: Date.now(), data });
      return data;
    } catch (e) {
      const g = leer(clave);
      if (g) return g.data;
      throw e;
    }
  }

  async function mostrarInforme() {
    $vista.innerHTML = `
      <div class="informe-barra no-imprimir">
        <button type="button" class="btn btn--secundario" data-volver>‹ Volver</button>
        <button type="button" class="btn" data-imprimir disabled>${ICON.documento}Guardar PDF</button>
        <button type="button" class="btn btn--secundario" data-compartir disabled>Compartir</button>
      </div>
      <p class="informe-aviso no-imprimir">Incluye los módulos operativo y médico con el periodo${estado.colonia ? ' y la colonia' : ''} seleccionados en los filtros.</p>
      <div id="informe-cont"><div class="esqueleto" style="height:520px"></div></div>`;
    $vista.querySelector('[data-volver]').addEventListener('click', () => history.back());
    const r = rango();
    const ant = rangoAnterior(r);
    ocupado(true);
    try {
      const base = { modulo: 'ambos', colonia: estado.colonia };
      const [actual, previo] = await Promise.all([
        obtener({ ...base, fecha_inicio: r.inicio, fecha_fin: r.fin }),
        ant ? obtener({ ...base, fecha_inicio: ant.inicio, fecha_fin: ant.fin }) : Promise.resolve(null),
      ]);
      if (estado.tab !== 'informe') return;
      const ctx = {
        op: actual.operativos, med: actual.medicos,
        opAnt: previo ? previo.operativos : null, medAnt: previo ? previo.medicos : null,
        periodo: r, ant, colonia: estado.colonia,
      };
      document.getElementById('informe-cont').innerHTML = window.Informe.html(ctx);
      const $imp = $vista.querySelector('[data-imprimir]');
      const $comp = $vista.querySelector('[data-compartir]');
      $imp.disabled = false;
      $comp.disabled = false;
      $imp.addEventListener('click', () => window.print());
      $comp.addEventListener('click', async () => {
        const texto = window.Informe.texto(ctx);
        try {
          if (navigator.share) await navigator.share({ title: 'Informe ejecutivo — Protección Civil MC', text: texto });
          else { await navigator.clipboard.writeText(texto); $comp.textContent = 'Copiado ✓'; }
        } catch { /* el usuario canceló */ }
      });
    } catch (e) {
      if (estado.tab === 'informe') document.getElementById('informe-cont').innerHTML = errorHTML(e.message);
      $vista.querySelector('[data-reintentar]')?.addEventListener('click', () => mostrarInforme());
    } finally {
      ocupado(false);
    }
  }

  /* ---------------- navegación ----------------
   * Las pestañas usan el historial del navegador para que el botón "atrás"
   * de Android regrese a Operativo en vez de cerrar la app, y desde
   * Operativo sí cierre la app (como una app nativa).
   */
  function render(tab) {
    estado.tab = tab;
    estado.lista = null;
    G.ocultarTip();
    $tabs.forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    window.scrollTo(0, 0);
    if (tab === 'operativo' || tab === 'medico') {
      $vista.innerHTML = filtrosHTML(tab);
      enlazarFiltros(tab);
      cargarModulo(tab);
      return;
    }
    if (tab === 'informe') { mostrarInforme(); return; }
    $vista.innerHTML = opinionesHTML();
  }

  function ir(tab) {
    if (tab === estado.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (tab === 'informe') { history.pushState({ tab }, '', '#informe'); render(tab); return; }
    if (estado.tab === 'informe') { history.replaceState({ tab }, '', '#' + tab); render(tab); return; }
    if (estado.tab === INICIO) history.pushState({ tab }, '', '#' + tab);
    else if (tab === INICIO) { history.back(); return; }
    else history.replaceState({ tab }, '', '#' + tab);
    render(tab);
  }

  window.addEventListener('popstate', (e) => render(e.state?.tab || tabDelHash() || INICIO));

  function tabDelHash() {
    const t = location.hash.slice(1);
    return TABS.includes(t) ? t : null;
  }

  // Redibuja la tendencia al girar el celular o cambiar el tamaño de la ventana
  let anchoPrevio = window.innerWidth;
  window.addEventListener('resize', () => {
    if (Math.abs(window.innerWidth - anchoPrevio) < 40 || !estado.datos) return;
    anchoPrevio = window.innerWidth;
    if (estado.tab === 'operativo' || estado.tab === 'medico') pintarDatos(estado.tab, estado.datos);
  });

  $tabs.forEach((b) => b.addEventListener('click', () => ir(b.dataset.tab)));
  $btnActualizar.addEventListener('click', async () => {
    if (estado.cargando) return;
    if (estado.tab === 'operativo' || estado.tab === 'medico') {
      await cargarCatalogo();
      cargarModulo(estado.tab, { forzar: true });
    }
  });
  window.addEventListener('online', () => {
    if (estado.tab === 'operativo' || estado.tab === 'medico') cargarModulo(estado.tab, { forzar: true });
  });

  /* ---------------- arranque ---------------- */
  const inicial = tabDelHash() || INICIO;
  history.replaceState({ tab: INICIO }, '', '#' + INICIO);
  if (inicial !== INICIO) history.pushState({ tab: inicial }, '', '#' + inicial);

  // El catálogo nuevo trae el buscador; si el guardado es viejo (sin él), se pide de nuevo
  const catalogoListo = cargarCatalogo();
  if (estado.catalogo && estado.catalogo.buscar_operativo) render(inicial);
  else catalogoListo.then(() => render(estado.tab === INICIO ? inicial : estado.tab));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
