/* Tablero de solo lectura — PC Magdalena Contreras
 * Datos: /api/pwa/resumen/ y /api/pwa/catalogo/ del Django (PythonAnywhere).
 * Cada respuesta se guarda en localStorage para que la app abra sin internet.
 */
(() => {
  'use strict';

  const CFG = window.PC_CONFIG;
  const TABS = ['operativo', 'medico', 'opiniones', 'info'];
  const INICIO = 'operativo';
  const TIMEOUT_MS = 20000;
  const fmt = new Intl.NumberFormat('es-MX');

  // ?api=http://127.0.0.1:8011 cambia el servidor (para pruebas); ?api= lo regresa al normal
  const qs = new URLSearchParams(location.search);
  // ?token= solo para pruebas en local (en GitHub Pages el token ya viene en config.js)
  if (qs.has('api')) guardar('pc.api', qs.get('api') || null);
  if (qs.has('token')) guardar('pc.token', qs.get('token') || null);
  if (qs.has('periodo')) guardar('pc.periodo', qs.get('periodo'));
  if (qs.has('api') || qs.has('token') || qs.has('periodo')) history.replaceState(null, '', location.pathname + location.hash);
  const API_BASE = (leer('pc.api') || CFG.API_BASE).replace(/\/+$/, '');
  const TOKEN = leer('pc.token') || CFG.TOKEN;

  const estado = {
    tab: INICIO,
    periodo: leer('pc.periodo') || 'anio',
    colonia: leer('pc.colonia') || '',
    tipo: { operativo: '', medico: '' },
    catalogo: leer('pc.catalogo'),
    cargando: false,
  };

  const $vista = document.getElementById('vista');
  const $estado = document.getElementById('estado');
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
  const vacioSi = (v, txt = 'No especificado') => (v == null || String(v).trim() === '' ? txt : v);

  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  function fechaCorta(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MESES[m - 1]} ${y}`;
  }
  function hora(h) { return h ? h.slice(0, 5) : ''; }
  function cuando(fecha, h) {
    if (!fecha) return '';
    const t = new Date(`${fecha}T${h || '00:00:00'}`);
    const min = Math.round((Date.now() - t) / 60000);
    if (h && min >= 0 && min < 60) return `Hace ${Math.max(min, 1)} min`;
    if (h && min >= 60 && min < 24 * 60) return `Hace ${Math.round(min / 60)} h`;
    return h ? `${fechaCorta(fecha)} · ${hora(h)}` : fechaCorta(fecha);
  }
  function hace(iso) {
    const min = Math.round((Date.now() - new Date(iso)) / 60000);
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
    const d = new Date(iso);
    return `el ${d.getDate()} ${MESES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function isoLocal(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const PERIODOS = [
    { id: '30d', txt: '30 días' },
    { id: 'mes', txt: 'Este mes' },
    { id: 'anio', txt: 'Este año' },
    { id: 'todo', txt: 'Todo' },
  ];
  function fechaInicio(periodo) {
    const hoy = new Date();
    if (periodo === '30d') { const d = new Date(hoy); d.setDate(d.getDate() - 30); return isoLocal(d); }
    if (periodo === 'mes') return isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    if (periodo === 'anio') return `${hoy.getFullYear()}-01-01`;
    return '';
  }

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
    return {
      modulo,
      fecha_inicio: fechaInicio(estado.periodo),
      colonia: estado.colonia,
      tipo: estado.tipo[modulo],
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
    if (guardado) pintarModulo(modulo, guardado.data);
    else $vista.innerHTML = filtrosHTML(modulo) + '<div class="esqueleto"></div><div class="esqueleto"></div>';
    enlazarFiltros(modulo);
    if (guardado) mostrarEstado(guardado.ts, !navigator.onLine);

    if (!forzar && guardado && Date.now() - guardado.ts < 60 * 1000) return;

    ocupado(true);
    try {
      const data = await pedir('resumen', p);
      guardar(clave, { ts: Date.now(), data });
      if (estado.tab === modulo && claveCache(paramsModulo(modulo)) === clave) {
        pintarModulo(modulo, data);
        mostrarEstado(Date.now(), false);
      }
    } catch (e) {
      if (estado.tab !== modulo) return;
      if (guardado) {
        mostrarEstado(guardado.ts, true, e.message);
      } else {
        $vista.innerHTML = filtrosHTML(modulo) + errorHTML(e.message);
        enlazarFiltros(modulo);
        $vista.querySelector('[data-reintentar]').addEventListener('click', () => cargarModulo(modulo, { forzar: true }));
        $estado.textContent = 'Sin datos';
        $estado.className = 'topbar__estado is-error';
      }
    } finally {
      ocupado(false);
    }
  }

  function ocupado(si) {
    estado.cargando = si;
    $btnActualizar.classList.toggle('is-loading', si);
    if (si && !$estado.textContent.startsWith('Actualizado')) $estado.textContent = 'Actualizando…';
  }

  function mostrarEstado(ts, sinRed, msg) {
    if (sinRed) {
      $estado.textContent = `${msg || 'Sin conexión'} · datos de ${hace(ts)}`;
      $estado.className = 'topbar__estado is-offline';
    } else {
      $estado.textContent = `Actualizado ${hace(ts)}`;
      $estado.className = 'topbar__estado';
    }
  }

  /* ---------------- piezas de interfaz ---------------- */
  const ICON = {
    colonia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 11V5l-3-3-3 3v2H3v14h18V11h-6zm-8 8H5v-2h2v2zm0-4H5v-2h2v2zm0-4H5V9h2v2zm6 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V9h2v2zm0-4h-2V5h2v2zm6 12h-2v-2h2v2zm0-4h-2v-2h2v2z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4v11H4V9zm6-5h4v16h-4V4zm6 8h4v8h-4v-8z"/></svg>',
    unidad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-5l-3-4zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM19.5 9.5l1.96 2.5H17V9.5h2.5zM18 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>',
    reloj: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 2.05 4.95l-1.42 1.42A9 9 0 1 0 13 3zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>',
    personas: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05A4.2 4.2 0 0 1 17 16.5V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/></svg>',
    botiquin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM10 4h4v2h-4V4zm6 11h-3v3h-2v-3H8v-2h3v-3h2v3h3v2z"/></svg>',
    ambulancia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 10h-1V7h-3V4H3c-1.1 0-2 .9-2 2v11h2a3 3 0 0 0 6 0h6a3 3 0 0 0 6 0h2v-4l-5-3zM6 18.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM10 11H8v2H6v-2H4V9h2V7h2v2h2v2zm8 7.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zM17 12V9.5l3.5 2.5H17z"/></svg>',
    alerta: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22L12 2zm1 16h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>',
    lluvia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.35 8.04A7.49 7.49 0 0 0 12 2C9.11 2 6.6 3.64 5.35 6.04A5.99 5.99 0 0 0 6 18h13a5 5 0 0 0 .35-9.96zM8 20l-1 2h2l1-2H8zm4 0-1 2h2l1-2h-2zm4 0-1 2h2l1-2h-2z"/></svg>',
    historial: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6a7 7 0 1 1 7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.25 2.52.77-1.28-3.52-2.09V8H12z"/></svg>',
    documento: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
  };

  function filtrosHTML(modulo) {
    const cat = estado.catalogo || {};
    const tipos = modulo === 'operativo' ? cat.categorias_operativo || [] : cat.tablas_medico || [];
    const opt = (v, sel) => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`;
    return `
      <section class="card filtros" aria-label="Filtros">
        <div class="chips" role="group" aria-label="Periodo">
          ${PERIODOS.map((p) => `<button type="button" class="chip" data-periodo="${p.id}" aria-pressed="${p.id === estado.periodo}">${p.txt}</button>`).join('')}
        </div>
        <label>Colonia
          <select data-filtro="colonia">
            <option value="">Todas las colonias</option>
            ${(cat.colonias || []).map((c) => opt(c, estado.colonia)).join('')}
          </select>
        </label>
        <label>${modulo === 'operativo' ? 'Categoría de incidente' : 'Tipo de incidente'}
          <select data-filtro="tipo">
            <option value="">Todos los incidentes</option>
            ${tipos.map((t) => opt(t, estado.tipo[modulo])).join('')}
          </select>
        </label>
      </section>`;
  }

  function enlazarFiltros(modulo) {
    $vista.querySelectorAll('[data-periodo]').forEach((b) =>
      b.addEventListener('click', () => {
        estado.periodo = b.dataset.periodo;
        guardar('pc.periodo', estado.periodo);
        cargarModulo(modulo);
      })
    );
    $vista.querySelector('[data-filtro="colonia"]').addEventListener('change', (e) => {
      estado.colonia = e.target.value;
      guardar('pc.colonia', estado.colonia);
      cargarModulo(modulo);
    });
    $vista.querySelector('[data-filtro="tipo"]').addEventListener('change', (e) => {
      estado.tipo[modulo] = e.target.value;
      cargarModulo(modulo);
    });
  }

  function errorHTML(msg) {
    return `
      <section class="card error-card" role="alert">
        <h2>${ICON.alerta} No se pudieron cargar los datos</h2>
        <p>${esc(msg)}. Revisa tu conexión e inténtalo de nuevo.</p>
        <button type="button" class="btn" data-reintentar>Reintentar</button>
      </section>`;
  }

  function card(titulo, icono, cuerpo, nota) {
    return `<section class="card"><h2>${icono}${esc(titulo)}</h2>${nota ? `<p class="card__nota">${esc(nota)}</p>` : ''}${cuerpo}</section>`;
  }

  function ranking(items, campo, { rojoTop = 0, vacio = 'Sin registros en este periodo' } = {}) {
    if (!items || !items.length) return `<p class="vacio">${vacio}</p>`;
    return `<ul class="ranking">${items
      .map((it, i) => `<li><span class="ranking__nombre">${esc(vacioSi(it[campo]))}</span><span class="pill${i < rojoTop ? ' pill--rojo' : ''}">${num(it.total)}</span></li>`)
      .join('')}</ul>`;
  }

  function barras(items, nombre, sub, { max = 8, rojo = false } = {}) {
    if (!items || !items.length) return '<p class="vacio">Sin registros en este periodo</p>';
    const top = items.slice(0, max);
    const mayor = Math.max(...top.map((i) => i.total), 1);
    return `<div class="barras${rojo ? ' barras--rojo' : ''}">${top
      .map((it) => `
        <div class="barra__fila">
          <div class="barra__texto">
            <span class="barra__nombre">${esc(vacioSi(nombre(it)))}${sub && sub(it) ? `<small>${esc(sub(it))}</small>` : ''}</span>
            <span class="barra__valor">${num(it.total)}</span>
          </div>
          <div class="barra__pista"><div class="barra__relleno" style="width:${((it.total / mayor) * 100).toFixed(1)}%"></div></div>
        </div>`)
      .join('')}</div>`;
  }

  const COLORES = ['#1a237e', '#b6171e', '#4c56af', '#b26a00', '#767683', '#1b6e3c'];
  function segmentos(items, campo, etiqueta = (v) => v) {
    if (!items || !items.length) return '<p class="vacio">Sin registros en este periodo</p>';
    const total = items.reduce((s, i) => s + i.total, 0) || 1;
    return `
      <div class="segmentos" role="img" aria-label="${esc(items.map((i) => `${etiqueta(i[campo])}: ${i.total}`).join(', '))}">
        ${items.map((it, i) => `<span style="flex:${it.total};background:${COLORES[i % COLORES.length]}"></span>`).join('')}
      </div>
      <ul class="leyenda">
        ${items
          .map((it, i) => `<li><i style="background:${COLORES[i % COLORES.length]}"></i>${esc(etiqueta(vacioSi(it[campo])))}<b>${num(it.total)} · ${Math.round((it.total / total) * 100)}%</b></li>`)
          .join('')}
      </ul>`;
  }

  /* ---------------- pantallas ---------------- */
  function pintarModulo(modulo, data) {
    const html = modulo === 'operativo' ? operativoHTML(data.operativos) : medicoHTML(data.medicos);
    // Conserva el scroll al refrescar en segundo plano
    const y = window.scrollY;
    $vista.innerHTML = filtrosHTML(modulo) + html;
    enlazarFiltros(modulo);
    window.scrollTo(0, y);
  }

  function operativoHTML(d) {
    if (!d) return errorHTML('Respuesta incompleta del servidor');
    const dia = d.dia_mas_activo;
    return `
      <div class="kpis">
        <div class="kpi kpi--grande">
          <span class="kpi__label">Servicios operativos</span>
          <span class="kpi__valor">${num(d.total)}</span>
          <span class="kpi__icono">${ICON.alerta}</span>
        </div>
        <div class="kpi">
          <span class="kpi__label">Por lluvias</span>
          <span class="kpi__valor">${num(d.por_lluvia)}</span>
          <span class="kpi__sub">${d.pct_lluvia || 0}% del total</span>
        </div>
        <div class="kpi">
          <span class="kpi__label">Hora pico</span>
          <span class="kpi__valor">${esc(d.hora_pico === 'No disponible' ? '—' : d.hora_pico.replace(' hrs', ''))}</span>
          <span class="kpi__sub">${dia ? `Día más activo: ${fechaCorta(dia.fecha)}` : 'Sin datos'}</span>
        </div>
      </div>
      ${card('Top colonias', ICON.colonia, ranking(d.top_colonias, 'colonia', { rojoTop: 2 }))}
      ${card('Tipos de incidente', ICON.chart, barras(d.desglose_tipo, (i) => i.tipo_incidente__subcategoria__nombre, (i) => i.tipo_incidente__subcategoria__categoria__nombre))}
      <div class="dos-col">
        ${card('Turnos', ICON.reloj, segmentos(d.distribucion_turnos, 'turno'))}
        ${card('Unidades más desplegadas', ICON.unidad, ranking(d.unidades_mas_desplegadas, 'unidad_transporte'))}
      </div>
      ${card('Últimos servicios', ICON.historial, serviciosOperativos(d.registros))}`;
  }

  function serviciosOperativos(regs) {
    if (!regs || !regs.length) return '<p class="vacio">Sin servicios en este periodo</p>';
    return `<div class="servicios">${regs
      .map((r) => {
        const lluvia = r.referente_lluvias === 'SI';
        return `
          <article class="servicio${lluvia ? ' servicio--ambar' : ''}">
            <h3>${esc(vacioSi(r.tipo_incidente__subcategoria__nombre, 'Incidente'))}</h3>
            <p class="servicio__meta">${esc(cuando(r.fecha_servicio, r.hora_salida))} · ${esc(vacioSi(r.colonia, 'Colonia no especificada'))}</p>
            ${r.descripcion_incidente ? `<p class="servicio__desc">${esc(r.descripcion_incidente)}</p>` : ''}
            <div class="etiquetas">
              ${r.tipo_incidente__subcategoria__categoria__nombre ? `<span class="etiqueta etiqueta--azul">${esc(r.tipo_incidente__subcategoria__categoria__nombre)}</span>` : ''}
              ${r.unidad_transporte ? `<span class="etiqueta">Unidad ${esc(r.unidad_transporte)}</span>` : ''}
              ${lluvia ? '<span class="etiqueta">Por lluvia</span>' : ''}
            </div>
          </article>`;
      })
      .join('')}</div>`;
  }

  function medicoHTML(d) {
    if (!d) return errorHTML('Respuesta incompleta del servidor');
    const sexo = { H: 'Hombre', M: 'Mujer', N: 'No especificado' };
    return `
      <div class="kpis">
        <div class="kpi kpi--grande">
          <span class="kpi__label">Atenciones totales</span>
          <span class="kpi__valor">${num(d.total)}</span>
          <span class="kpi__icono">${ICON.botiquin}</span>
        </div>
        <div class="kpi kpi--grande">
          <span class="kpi__label">Traslados realizados</span>
          <span class="kpi__valor kpi__valor--rojo">${num(d.traslados)}</span>
          <span class="kpi__sub">${d.pct_traslado || 0}% · ${num(d.atendidos_en_sitio)} atendidos en sitio</span>
          <span class="kpi__icono kpi__icono--rojo">${ICON.ambulancia}</span>
        </div>
      </div>
      ${card('Top colonias', ICON.colonia, ranking(d.top_colonias, 'colonia', { rojoTop: 2 }))}
      ${card('Tipos de emergencia', ICON.chart, barras(d.desglose_tipo, (i) => i.incidente_medico__nombre, (i) => i.incidente_medico__tabla__nombre))}
      <div class="dos-col">
        ${card('Grupos de edad', ICON.personas, barras(d.grupos_edad, (i) => i.grupo, null, { rojo: true }))}
        ${card('Sexo del paciente', ICON.personas, segmentos(d.distribucion_sexo, 'paciente_sexo', (v) => sexo[v] || v))}
      </div>
      <div class="dos-col">
        ${card('Hospitales receptores', ICON.hospital, ranking(d.hospitales_receptores, 'hospital_receptor', { vacio: 'Sin traslados en este periodo' }))}
        ${card('Unidades que atendieron', ICON.unidad, ranking(d.unidades_que_atendieron, 'unidad_atiende'))}
      </div>
      <section class="card">
        <h2>${ICON.reloj}Datos clave</h2>
        <dl class="datos">
          <div><dt>Hora pico</dt><dd>${esc(d.hora_pico === 'No disponible' ? '—' : d.hora_pico)}</dd></div>
          <div><dt>Día más activo</dt><dd>${d.dia_mas_activo ? `${fechaCorta(d.dia_mas_activo.fecha)} (${num(d.dia_mas_activo.total)})` : '—'}</dd></div>
        </dl>
      </section>
      ${card('Últimos servicios', ICON.historial, serviciosMedicos(d.registros))}`;
  }

  function serviciosMedicos(regs) {
    if (!regs || !regs.length) return '<p class="vacio">Sin servicios en este periodo</p>';
    return `<div class="servicios">${regs
      .map((r) => `
        <article class="servicio${r.requiere_traslado ? ' servicio--rojo' : ''}">
          <h3>${esc(vacioSi(r.incidente_medico__nombre, 'Atención médica'))}</h3>
          <p class="servicio__meta">${esc(cuando(r.fecha_servicio, r.hora_servicio))} · ${esc(vacioSi(r.colonia, 'Colonia no especificada'))}</p>
          ${r.causa_probable__nombre ? `<p class="servicio__desc">Causa probable: ${esc(r.causa_probable__nombre)}</p>` : ''}
          <div class="etiquetas">
            ${r.unidad_atiende ? `<span class="etiqueta">${esc(r.unidad_atiende)}</span>` : ''}
            ${r.requiere_traslado ? `<span class="etiqueta etiqueta--rojo">Traslado${r.hospital_receptor ? ` · ${esc(r.hospital_receptor)}` : ''}</span>` : '<span class="etiqueta">Atendido en sitio</span>'}
          </div>
        </article>`)
      .join('')}</div>`;
  }

  function opinionesHTML() {
    return `
      <section class="card aviso">
        ${ICON.documento}
        <h2>Opiniones Técnicas de Riesgo</h2>
        <p>Aquí podrás consultar los dictámenes de riesgo, su nivel y el documento de cada uno.</p>
        <span class="badge">Próximamente</span>
      </section>`;
  }

  let promptInstalar = null;
  function infoHTML() {
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    return `
      <section class="card">
        <h2>${ICON.documento}Acerca de este tablero</h2>
        <ul class="info-lista">
          <li>Es de <b>solo lectura</b>: muestra los reportes operativos y médicos registrados en el sistema de Protección Civil Magdalena Contreras.</li>
          <li>Los datos se guardan en el celular: si no hay señal, verás la última información descargada.</li>
          <li>Toca <b>↻</b> arriba a la derecha para traer lo más reciente.</li>
        </ul>
      </section>
      <section class="card">
        <h2>${ICON.botiquin}Instalar en el celular</h2>
        ${standalone
          ? '<p class="vacio">Ya estás usando la app instalada.</p>'
          : `${promptInstalar ? '<p><button type="button" class="btn" data-instalar>Instalar app</button></p>' : ''}
             <ul class="info-lista">
               <li><b>Android (Chrome):</b> menú ⋮ → <b>Agregar a la pantalla principal</b> o <b>Instalar app</b>.</li>
               <li><b>iPhone (Safari):</b> botón Compartir → <b>Agregar a inicio</b>.</li>
             </ul>`}
      </section>
      <section class="card">
        <dl class="datos">
          <div><dt>Versión</dt><dd>${esc(CFG.VERSION)}</dd></div>
          <div><dt>Servidor</dt><dd style="font-size:14px">${esc(API_BASE.replace(/^https?:\/\//, ''))}</dd></div>
        </dl>
        <p style="margin:16px 0 0"><button type="button" class="btn btn--secundario" data-borrar>Borrar datos guardados</button></p>
      </section>`;
  }

  /* ---------------- navegación ----------------
   * Las pestañas usan el historial del navegador para que el botón "atrás"
   * de Android regrese a Operativo en vez de cerrar la app, y desde
   * Operativo sí cierre la app (como una app nativa).
   */
  function render(tab) {
    estado.tab = tab;
    $tabs.forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    window.scrollTo(0, 0);
    if (tab === 'operativo' || tab === 'medico') {
      cargarModulo(tab);
      return;
    }
    $vista.innerHTML = tab === 'opiniones' ? opinionesHTML() : infoHTML();
    $estado.textContent = 'Tablero de solo lectura';
    $estado.className = 'topbar__estado';
    if (tab === 'info') {
      $vista.querySelector('[data-instalar]')?.addEventListener('click', async () => {
        promptInstalar.prompt();
        await promptInstalar.userChoice;
        promptInstalar = null;
        render('info');
      });
      $vista.querySelector('[data-borrar]').addEventListener('click', () => {
        Object.keys(localStorage).filter((k) => k.startsWith('pc.')).forEach((k) => localStorage.removeItem(k));
        location.reload();
      });
    }
  }

  function ir(tab) {
    if (tab === estado.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (estado.tab === INICIO) history.pushState({ tab }, '', '#' + tab);
    else if (tab === INICIO) { history.back(); return; }
    else history.replaceState({ tab }, '', '#' + tab);
    render(tab);
  }

  window.addEventListener('popstate', (e) => {
    const tab = e.state?.tab || tabDelHash() || INICIO;
    render(tab);
  });

  function tabDelHash() {
    const t = location.hash.slice(1);
    return TABS.includes(t) ? t : null;
  }

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
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalar = e;
    if (estado.tab === 'info') render('info');
  });

  /* ---------------- arranque ---------------- */
  const inicial = tabDelHash() || INICIO;
  history.replaceState({ tab: INICIO }, '', '#' + INICIO);
  if (inicial !== INICIO) history.pushState({ tab: inicial }, '', '#' + inicial);

  const catalogoListo = cargarCatalogo();
  if (estado.catalogo) render(inicial);
  else catalogoListo.then(() => render(estado.tab === INICIO ? inicial : estado.tab));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
