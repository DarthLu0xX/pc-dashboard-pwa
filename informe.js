/* Informe ejecutivo — Dirección de Protección Civil, La Magdalena Contreras
 * Arma, a partir de los mismos datos del tablero, un documento formal con
 * comparativo, hallazgos, áreas de oportunidad y propuestas. Todo se calcula
 * con reglas fijas (sin IA): cada afirmación sale de una cifra del sistema.
 *
 * Criterios (también se imprimen en la nota metodológica):
 * - Un cambio es "relevante" si varía ≥ 15 % y alguno de los dos periodos tiene ≥ 10 casos.
 * - La concentración territorial se mide con la participación de las 3 colonias principales.
 * - Horarios y días excluyen los registros de carga masiva sin hora (quedaron a las 12:00).
 */
(() => {
  'use strict';

  const fmt = new Intl.NumberFormat('es-MX');
  const num = (n) => fmt.format(n || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  // En plural, para "los martes", "los domingos"
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'];
  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const MIN_CASOS = 10;
  const MIN_CAMBIO = 15;

  function fechaLarga(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} de ${MESES[m - 1]} de ${y}`;
  }
  const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);
  const porc = (parte, total) => (total ? (parte / total) * 100 : 0);
  const p1 = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
  function variacion(a, b) {
    const v = pct(a, b);
    if (v == null) return b === 0 && a > 0 ? 'Sin registros previos' : '—';
    return `${v > 0 ? '+' : ''}${p1(v)}`;
  }
  const relevante = (a, b) => b != null && Math.max(a, b) >= MIN_CASOS && b > 0 && Math.abs(pct(a, b)) >= MIN_CAMBIO;
  const vacio = (v) => !v || ['sin dato', 'no especificada', 'no especificado', 'none', 'nan', ''].includes(normalizar(v).trim());

  /* ---------------- propuestas por tipo de incidente ---------------- */
  const PROPUESTAS = [
    [/opinion tecnica|dictamen|seguimiento/, 'Fortalecer la capacidad de dictaminación técnica (personal y tiempos de respuesta) y dar seguimiento documentado al cumplimiento de las recomendaciones emitidas.'],
    [/gas/, 'Programa de verificación de instalaciones de gas LP y natural en vivienda y comercio, en coordinación con distribuidores autorizados, y difusión de medidas preventivas (revisión de reguladores, mangueras y conexiones).'],
    [/arbol|rama|poda/, 'Programa de poda y derribo preventivo coordinado con Servicios Urbanos, con dictamen previo del arbolado en riesgo, priorizando vía pública, líneas eléctricas y viviendas.'],
    [/forestal|pastizal|basura/, 'Brechas cortafuego y limpieza de predios antes de la temporada de estiaje, en coordinación con CONAFOR/SEDEMA y brigadas comunitarias del suelo de conservación.'],
    [/incendio/, 'Inspección de inmuebles de mayor riesgo y campaña de prevención de incendios domésticos (instalaciones eléctricas, uso seguro de gas y extintores).'],
    [/inundacion|encharcamiento|desbordamiento|canal|cauce/, 'Desazolve preventivo de coladeras, cauces y barrancas antes de la temporada de lluvias, y monitoreo de los puntos de encharcamiento recurrentes en coordinación con SACMEX.'],
    [/evento|festividad|concentracion/, 'Protocolo de dispositivos preventivos con anticipación para eventos masivos y festividades, con coordinación interinstitucional y plan de atención médica en sitio.'],
    [/cable|electric|poste|transformador|chispa/, 'Reporte y seguimiento formal con CFE de cableado y postes en riesgo, con atención prioritaria en las zonas reincidentes.'],
    [/animal|can|perro|enjambre|abeja|avispa|fauna/, 'Coordinación con la Brigada de Vigilancia Animal y campañas de tenencia responsable; protocolo de atención de enjambres.'],
    [/vivienda|estructura|barda|muro|grieta|edificacion|inmueble en riesgo/, 'Programa de revisión de viviendas en zonas de riesgo (laderas y barrancas), con emisión de opiniones técnicas y seguimiento de recomendaciones.'],
    [/deslave|talud|ladera|barranca|desliz|hundimiento|socavon|geolog/, 'Monitoreo de taludes y laderas, obras de mitigación coordinadas con Obras y señalización de zonas de riesgo conforme al Atlas de Riesgos.'],
    [/fuga de agua|agua potable|hidraulic/, 'Canalización y seguimiento con SACMEX de las fugas reportadas, priorizando las que afectan estabilidad de suelo o vía pública.'],
    // médicas
    [/caida/, 'Programa de prevención de caídas en adultos mayores (visitas domiciliarias, mejora de banquetas, escalinatas e iluminación en colonias de mayor incidencia).'],
    [/moto|choque|atropell|vial|transito|derrap/, 'Campañas de seguridad vial y uso de casco; coordinación con SSC para operativos en los cruceros y vialidades de mayor incidencia.'],
    [/violencia|rina|agresion|arma|golpe/, 'Coordinación con Seguridad Ciudadana para atender las zonas y horarios de mayor incidencia de agresiones.'],
    [/intoxica|alcohol|droga|sustancia/, 'Coordinación con salud pública en programas de prevención de adicciones y operativos preventivos en eventos con venta de alcohol.'],
    [/enfermedad|malestar|diabet|hiperten|cardi|respirat|metabol/, 'Vinculación con centros de salud para el seguimiento de pacientes crónicos recurrentes y jornadas de detección oportuna.'],
    [/convuls|neurolog|inconsciente|sincope|desmayo/, 'Capacitación a la población como primeros respondientes (RCP básico y manejo inicial de crisis convulsivas).'],
    [/quemadura|electrocu/, 'Campañas de prevención de quemaduras en el hogar y revisión de instalaciones eléctricas en viviendas de alta incidencia.'],
    [/mental|suicid|autolesi|ansiedad|crisis/, 'Canalización y seguimiento con servicios de salud mental; capacitación del personal en intervención en crisis.'],
  ];
  const propuestaPara = (nombre, categoria = '') => {
    const t = normalizar(`${nombre} ${categoria}`);
    const hit = PROPUESTAS.find(([re]) => re.test(t));
    return hit ? hit[1] : 'Análisis de causa raíz con el área operativa y focalización de acciones preventivas en las colonias con mayor incidencia.';
  };

  /* ---------------- análisis ---------------- */
  function cambiosPorTipo(actual, anterior, nombre, categoria) {
    if (!anterior) return { suben: [], bajan: [] };
    const previos = new Map((anterior || []).map((i) => [nombre(i), i.total]));
    const minPrevio = anterior.length ? Math.min(...anterior.map((i) => i.total)) : 0;
    const filas = (actual || []).map((i) => {
      const n = nombre(i);
      const antes = previos.has(n) ? previos.get(n) : null;
      return { nombre: n, categoria: categoria ? categoria(i) : '', ahora: i.total, antes, cota: minPrevio };
    }).filter((f) => f.nombre);
    const suben = filas.filter((f) => f.antes != null && relevante(f.ahora, f.antes) && f.ahora > f.antes)
      .sort((a, b) => (b.ahora - b.antes) - (a.ahora - a.antes));
    const bajan = filas.filter((f) => f.antes != null && relevante(f.ahora, f.antes) && f.ahora < f.antes)
      .sort((a, b) => (a.ahora - a.antes) - (b.ahora - b.antes));
    return { suben, bajan };
  }

  function temporal(d) {
    const porDia = Array(7).fill(0);
    for (const [dj, , t] of d.heatmap || []) porDia[(dj + 5) % 7] += t; // Django: 1 = domingo
    const totDia = porDia.reduce((s, v) => s + v, 0);
    const iDia = porDia.indexOf(Math.max(...porDia));
    const ph = d.por_hora || [];
    let mejor = -1, desde = 0;
    for (let h = 0; h < 24; h++) {
      const s = ph[h] + ph[(h + 1) % 24] + ph[(h + 2) % 24];
      if (s > mejor) { mejor = s; desde = h; }
    }
    const totHora = ph.reduce((s, v) => s + v, 0);
    const turnos = d.distribucion_turnos || [];
    const totT = turnos.reduce((s, t) => s + t.total, 0);
    return {
      dia: totDia ? { nombre: DIAS[iDia], pct: porc(porDia[iDia], totDia) } : null,
      franja: totHora ? { desde, hasta: (desde + 3) % 24, pct: porc(mejor, totHora) } : null,
      turno: turnos[0] && totT ? { nombre: turnos[0].turno, pct: porc(turnos[0].total, totT) } : null,
    };
  }

  function concentracion(top, total) {
    const validas = (top || []).filter((c) => !vacio(c.colonia));
    const tres = validas.slice(0, 3);
    return { tres, pct: porc(tres.reduce((s, c) => s + c.total, 0), total) };
  }

  function calidad(op, med) {
    const out = [];
    const sinHora = (op?.sin_hora || 0) + (med?.sin_hora || 0);
    const total = (op?.total || 0) + (med?.total || 0);
    if (sinHora && porc(sinHora, total) >= 2) out.push(`${num(sinHora)} registros (${p1(porc(sinHora, total))}) no tienen hora real: provienen de carga masiva y quedaron en 12:00.`);
    const unidadNE = (lista, campo, tot) => {
      const ne = (lista || []).filter((u) => vacio(u[campo])).reduce((s, u) => s + u.total, 0);
      return { ne, pct: porc(ne, tot) };
    };
    const uo = unidadNE(op?.unidades_mas_desplegadas, 'unidad_transporte', op?.total);
    const um = unidadNE(med?.unidades_que_atendieron, 'unidad_atiende', med?.total);
    if (uo.pct >= 10) out.push(`${p1(uo.pct)} de los servicios operativos no registran la unidad que atendió.`);
    if (um.pct >= 10) out.push(`${p1(um.pct)} de las atenciones médicas no registran la unidad que atendió.`);
    const colNE = (lista, tot) => porc((lista || []).filter((c) => vacio(c.colonia)).reduce((s, c) => s + c.total, 0), tot);
    const co = colNE(op?.top_colonias, op?.total), cm = colNE(med?.top_colonias, med?.total);
    if (co >= 3 || cm >= 3) out.push(`Hay registros sin colonia especificada (${p1(Math.max(co, cm))} en el módulo con más casos), lo que impide su análisis territorial.`);
    return out;
  }

  function analizar(ctx) {
    const { op, med, opAnt, medAnt } = ctx;
    const hay = (d) => d && d.total != null;
    const a = {
      tipoOp: hay(op) ? cambiosPorTipo(op.desglose_tipo, opAnt?.desglose_tipo, (i) => i.tipo_incidente__subcategoria__nombre, (i) => i.tipo_incidente__subcategoria__categoria__nombre) : { suben: [], bajan: [] },
      tipoMed: hay(med) ? cambiosPorTipo(med.desglose_tipo, medAnt?.desglose_tipo, (i) => i.incidente_medico__nombre, (i) => i.incidente_medico__tabla__nombre) : { suben: [], bajan: [] },
      concOp: hay(op) ? concentracion(op.top_colonias, op.total) : null,
      concMed: hay(med) ? concentracion(med.top_colonias, med.total) : null,
      tempOp: hay(op) ? temporal(op) : null,
      tempMed: hay(med) ? temporal(med) : null,
      calidad: calidad(op, med),
    };
    a.pctTraslado = med?.total ? porc(med.traslados, med.total) : 0;
    a.pctTrasladoAnt = medAnt?.total ? porc(medAnt.traslados, medAnt.total) : null;
    a.pctLluvia = op?.total ? porc(op.por_lluvia, op.total) : 0;
    a.lluviaAnt = opAnt ? opAnt.por_lluvia : null;
    const hosp = (med?.hospitales_receptores || []).filter((h) => !vacio(h.hospital_receptor));
    // Solo se menciona si es representativo (el nombre del hospital se captura como texto libre)
    a.hospital = hosp[0] && med.traslados && porc(hosp[0].total, med.traslados) >= 10 ? { nombre: hosp[0].hospital_receptor, pct: porc(hosp[0].total, med.traslados) } : null;
    return a;
  }

  /* ---------------- redacción ---------------- */
  function compLabel(ctx) {
    if (!ctx.ant) return null;
    return ctx.ant.anual
      ? `el mismo periodo de ${ctx.ant.inicio.slice(0, 4)}`
      : `el periodo inmediato anterior (${fechaLarga(ctx.ant.inicio)} al ${fechaLarga(ctx.ant.fin)})`;
  }
  const verbo = (a, b) => (a > b ? 'un incremento' : a < b ? 'una disminución' : 'sin variación');

  function resumen(ctx, a) {
    const { op, med, opAnt, medAnt } = ctx;
    const comp = compLabel(ctx);
    const total = (op?.total || 0) + (med?.total || 0);
    const totalAnt = opAnt && medAnt ? (opAnt.total || 0) + (medAnt.total || 0) : null;
    const periodo = ctx.periodo.inicio ? `Del ${fechaLarga(ctx.periodo.inicio)} al ${fechaLarga(ctx.periodo.fin)}` : 'En el histórico completo del sistema';
    let t = `${periodo}${ctx.colonia ? `, en la colonia ${esc(ctx.colonia)}` : ''}, la Dirección de Protección Civil registró <b>${num(total)} servicios</b>: ${num(op?.total)} operativos y ${num(med?.total)} atenciones prehospitalarias.`;
    if (comp && totalAnt != null) t += ` Respecto ${`a ${comp}`.replace(/^a el /, 'al ')} (${num(totalAnt)}), esto representa ${verbo(total, totalAnt)} de <b>${variacion(total, totalAnt)}</b>.`;
    const topOp = (op?.desglose_tipo || [])[0];
    const topMed = (med?.desglose_tipo || [])[0];
    if (topOp) t += ` El incidente operativo más frecuente fue <b>${esc(topOp.tipo_incidente__subcategoria__nombre)}</b> (${num(topOp.total)}, ${p1(porc(topOp.total, op.total))})`;
    if (topMed) t += `${topOp ? ' y, en el ámbito médico,' : ' En el ámbito médico predominó'} <b>${esc(topMed.incidente_medico__nombre)}</b> (${num(topMed.total)}, ${p1(porc(topMed.total, med.total))}).`;
    else if (topOp) t += '.';
    if (med?.total) t += ` Se realizaron ${num(med.traslados)} traslados hospitalarios (${p1(a.pctTraslado)} de las atenciones).`;
    return t;
  }

  function indicadores(ctx, a) {
    const { op, med, opAnt, medAnt } = ctx;
    const filas = [];
    const fila = (nombre, actual, anterior, fmtV = num, varTxt) => filas.push({ nombre, actual: fmtV(actual), anterior: anterior == null ? '—' : fmtV(anterior), variacion: varTxt ?? (anterior == null ? '—' : variacion(actual, anterior)) });
    if (op) {
      fila('Servicios operativos', op.total, opAnt?.total);
      fila('Servicios por lluvias', op.por_lluvia, opAnt?.por_lluvia);
    }
    if (med) {
      fila('Atenciones prehospitalarias', med.total, medAnt?.total);
      fila('Traslados hospitalarios', med.traslados, medAnt?.traslados);
      const pp = a.pctTrasladoAnt == null ? '—' : `${a.pctTraslado - a.pctTrasladoAnt >= 0 ? '+' : ''}${(Math.round((a.pctTraslado - a.pctTrasladoAnt) * 10) / 10).toFixed(1)} pp`;
      fila('Tasa de traslado', a.pctTraslado, a.pctTrasladoAnt, p1, pp);
    }
    if (op && med) fila('Total de servicios', (op.total || 0) + (med.total || 0), opAnt && medAnt ? (opAnt.total || 0) + (medAnt.total || 0) : null);
    return filas;
  }

  function hallazgos(ctx, a) {
    const H = [];
    const comp = ctx.ant ? (ctx.ant.anual ? `vs ${ctx.ant.inicio.slice(0, 4)}` : 'vs periodo anterior') : '';
    const lista = (items, max) => items.slice(0, max).map((f) => `<b>${esc(f.nombre)}</b> (${num(f.antes)} → ${num(f.ahora)}, ${variacion(f.ahora, f.antes)})`).join('; ');
    if (a.tipoOp.suben.length) H.push({ t: 'sube', txt: `Incidentes operativos al alza ${comp}: ${lista(a.tipoOp.suben, 3)}.` });
    if (a.tipoOp.bajan.length) H.push({ t: 'baja', txt: `Incidentes operativos a la baja: ${lista(a.tipoOp.bajan, 2)}.` });
    if (a.tipoMed.suben.length) H.push({ t: 'sube', txt: `Atenciones médicas al alza ${comp}: ${lista(a.tipoMed.suben, 3)}.` });
    if (a.tipoMed.bajan.length) H.push({ t: 'baja', txt: `Atenciones médicas a la baja: ${lista(a.tipoMed.bajan, 2)}.` });
    if (a.concOp && a.concOp.tres.length >= 2 && !ctx.colonia) {
      H.push({ t: 'info', txt: `Concentración territorial: ${a.concOp.tres.map((c) => `<b>${esc(c.colonia)}</b>`).join(', ')} reúnen el <b>${p1(a.concOp.pct)}</b> de los servicios operativos${a.concMed?.tres.length ? `; en atención médica destacan ${a.concMed.tres.map((c) => esc(c.colonia)).join(', ')} (${p1(a.concMed.pct)})` : ''}.` });
    }
    const t = a.tempOp;
    if (t && (t.dia || t.franja)) {
      H.push({ t: 'info', txt: `Patrón temporal operativo: mayor demanda los <b>${t.dia ? t.dia.nombre : '—'}</b>${t.dia ? ` (${p1(t.dia.pct)})` : ''}, en la franja de <b>${t.franja ? `${t.franja.desde}:00 a ${t.franja.hasta}:00` : '—'}</b>${t.franja ? ` (${p1(t.franja.pct)} de los servicios con hora registrada)` : ''}${t.turno ? `; el turno ${esc(t.turno.nombre.toLowerCase())} concentra el ${p1(t.turno.pct)}` : ''}.` });
    }
    const tm = a.tempMed;
    if (tm && tm.franja) H.push({ t: 'info', txt: `Patrón temporal médico: la franja de mayor demanda es de <b>${tm.franja.desde}:00 a ${tm.franja.hasta}:00</b> (${p1(tm.franja.pct)})${tm.dia ? `, con más atenciones los ${tm.dia.nombre}` : ''}.` });
    if (ctx.op?.total) {
      const ll = ctx.op.por_lluvia;
      H.push({ t: a.lluviaAnt != null && relevante(ll, a.lluviaAnt) && ll > a.lluviaAnt ? 'sube' : 'info', txt: `Los servicios asociados a lluvias suman <b>${num(ll)}</b> (${p1(a.pctLluvia)} del total operativo)${a.lluviaAnt != null ? `, frente a ${num(a.lluviaAnt)} ${comp} (${variacion(ll, a.lluviaAnt)})` : ''}.` });
    }
    if (ctx.med?.total) {
      let txt = `La tasa de traslado hospitalario es de <b>${p1(a.pctTraslado)}</b>`;
      if (a.pctTrasladoAnt != null) txt += ` (${p1(a.pctTrasladoAnt)} ${comp})`;
      if (a.hospital) txt += `; el principal hospital receptor es <b>${esc(a.hospital.nombre)}</b>, con el ${p1(a.hospital.pct)} de los traslados`;
      H.push({ t: 'info', txt: `${txt}.` });
    }
    for (const c of a.calidad) H.push({ t: 'alerta', txt: `Calidad del registro: ${c}` });
    return H;
  }

  function propuestas(ctx, a) {
    const P = [];
    const colTxt = (conc) => (conc && conc.tres.length ? conc.tres.map((c) => c.colonia).join(', ') : '');
    for (const f of a.tipoOp.suben.slice(0, 2)) {
      P.push({
        area: `Incremento de ${f.nombre}`,
        sustento: `Pasó de ${num(f.antes)} a ${num(f.ahora)} servicios (${variacion(f.ahora, f.antes)}).`,
        propuesta: `${propuestaPara(f.nombre, f.categoria)}${!ctx.colonia && colTxt(a.concOp) ? ` Priorizar ${colTxt(a.concOp)}.` : ''}`,
      });
    }
    for (const f of a.tipoMed.suben.slice(0, 2)) {
      P.push({
        area: `Incremento de atenciones por ${f.nombre.toLowerCase()}`,
        sustento: `Pasó de ${num(f.antes)} a ${num(f.ahora)} atenciones (${variacion(f.ahora, f.antes)}).`,
        propuesta: propuestaPara(f.nombre, f.categoria),
      });
    }
    // Sin comparativo, se atiende lo más frecuente
    if (!ctx.ant) {
      const top = (ctx.op?.desglose_tipo || [])[0];
      if (top) P.push({ area: `Principal incidencia: ${top.tipo_incidente__subcategoria__nombre}`, sustento: `${num(top.total)} servicios (${p1(porc(top.total, ctx.op.total))} del total operativo).`, propuesta: propuestaPara(top.tipo_incidente__subcategoria__nombre, top.tipo_incidente__subcategoria__categoria__nombre) });
    }
    if (a.concOp && a.concOp.pct >= 25 && !ctx.colonia) {
      P.push({
        area: 'Concentración territorial de la demanda',
        sustento: `${colTxt(a.concOp)} concentran el ${p1(a.concOp.pct)} de los servicios operativos.`,
        propuesta: 'Despliegue preventivo focalizado: pre-posicionamiento de unidades en los horarios de mayor demanda, recorridos de identificación de riesgos y trabajo con comités vecinales y la red de brigadistas comunitarios de esas colonias.',
      });
    }
    const t = a.tempOp;
    if (t && t.franja && t.franja.pct >= 20) {
      P.push({
        area: 'Cobertura en horario de mayor demanda',
        sustento: `De ${t.franja.desde}:00 a ${t.franja.hasta}:00 se concentra el ${p1(t.franja.pct)} de los servicios${t.dia ? `; la mayor carga se presenta los ${t.dia.nombre}` : ''}.`,
        propuesta: 'Ajustar roles de guardia y disponibilidad de unidades para reforzar esa franja, y programar las actividades preventivas y administrativas fuera de ella.',
      });
    }
    if (ctx.op?.total && (a.pctLluvia >= 10 || (a.lluviaAnt != null && relevante(ctx.op.por_lluvia, a.lluviaAnt) && ctx.op.por_lluvia > a.lluviaAnt))) {
      P.push({
        area: 'Afectaciones por temporada de lluvias',
        sustento: `${num(ctx.op.por_lluvia)} servicios (${p1(a.pctLluvia)}) estuvieron asociados a lluvias.`,
        propuesta: 'Plan de temporada de lluvias con desazolve preventivo, inventario de puntos de encharcamiento y deslave recurrentes, monitoreo de cauces y barrancas y alertamiento temprano a la población en zonas de riesgo.',
      });
    }
    if (ctx.med?.total && (a.pctTraslado >= 25 || (a.pctTrasladoAnt != null && a.pctTraslado - a.pctTrasladoAnt >= 3))) {
      P.push({
        area: 'Tasa de traslado hospitalario',
        sustento: `El ${p1(a.pctTraslado)} de las atenciones requirió traslado${a.pctTrasladoAnt != null ? ` (antes ${p1(a.pctTrasladoAnt)})` : ''}.`,
        propuesta: `Fortalecer la regulación médica y los acuerdos de recepción con hospitales${a.hospital ? `, en particular con ${a.hospital.nombre}` : ''}, y revisar los criterios de traslado para optimizar la disponibilidad de ambulancias.`,
      });
    }
    if (a.calidad.length) {
      P.push({
        area: 'Calidad y completitud del registro',
        sustento: a.calidad.join(' '),
        propuesta: 'Hacer obligatorios en la captura la hora real, la unidad (desde un catálogo de unidades) y la colonia (desde el catálogo oficial); validar las cargas masivas antes de importarlas y capacitar al personal en el registro. Esto mejora la confiabilidad de los indicadores de tiempos, horarios y territorio.',
      });
    }
    return P.slice(0, 7);
  }

  /* ---------------- salida ---------------- */
  function html(ctx) {
    const a = analizar(ctx);
    const ind = indicadores(ctx, a);
    const H = hallazgos(ctx, a);
    const P = propuestas(ctx, a);
    const comp = compLabel(ctx);
    const emitido = new Date();
    const periodoTxt = ctx.periodo.inicio ? `${fechaLarga(ctx.periodo.inicio)} al ${fechaLarga(ctx.periodo.fin)}` : 'Histórico completo';
    const icono = { sube: '▲', baja: '▼', info: '●', alerta: '!' };
    return `
      <article class="informe" id="informe">
        <header class="informe__cabeza">
          <img src="icons/logo-96.png" alt="" width="56" height="56">
          <div>
            <p class="informe__dep">Alcaldía La Magdalena Contreras · Dirección de Protección Civil</p>
            <h1>Informe ejecutivo de servicios</h1>
          </div>
        </header>
        <dl class="informe__datos">
          <div><dt>Periodo</dt><dd>${esc(periodoTxt)}</dd></div>
          <div><dt>Comparado con</dt><dd>${comp ? esc(comp.replace(/^el /, '').replace(/^El /, '')) : 'Sin periodo de comparación'}</dd></div>
          ${ctx.colonia ? `<div><dt>Colonia</dt><dd>${esc(ctx.colonia)}</dd></div>` : ''}
          <div><dt>Emitido</dt><dd>${emitido.getDate()} de ${MESES[emitido.getMonth()]} de ${emitido.getFullYear()}, ${String(emitido.getHours()).padStart(2, '0')}:${String(emitido.getMinutes()).padStart(2, '0')} h</dd></div>
        </dl>

        <section>
          <h2><span>1</span>Resumen ejecutivo</h2>
          <p class="informe__parrafo">${resumen(ctx, a)}</p>
        </section>

        <section>
          <h2><span>2</span>Indicadores clave</h2>
          <table class="informe__tabla">
            <thead><tr><th>Indicador</th><th>Periodo</th><th>${ctx.ant ? (ctx.ant.anual ? ctx.ant.inicio.slice(0, 4) : 'Anterior') : 'Anterior'}</th><th>Variación</th></tr></thead>
            <tbody>${ind.map((f) => `<tr><td>${esc(f.nombre)}</td><td>${esc(f.actual)}</td><td>${esc(f.anterior)}</td><td class="${/^\+/.test(f.variacion) ? 'v-sube' : /^-/.test(f.variacion) ? 'v-baja' : ''}">${esc(f.variacion)}</td></tr>`).join('')}</tbody>
          </table>
          ${tablaTop('Principales incidentes operativos', ctx.op?.desglose_tipo, (i) => i.tipo_incidente__subcategoria__nombre, (i) => i.tipo_incidente__subcategoria__categoria__nombre, ctx.op?.total)}
          ${tablaTop('Principales atenciones médicas', ctx.med?.desglose_tipo, (i) => i.incidente_medico__nombre, (i) => i.incidente_medico__tabla__nombre, ctx.med?.total)}
        </section>

        <section>
          <h2><span>3</span>Hallazgos</h2>
          ${H.length ? `<ul class="informe__hallazgos">${H.map((h) => `<li class="h-${h.t}"><i>${icono[h.t]}</i><span>${h.txt}</span></li>`).join('')}</ul>` : '<p class="informe__parrafo">No se identificaron variaciones relevantes con los criterios del informe.</p>'}
        </section>

        <section>
          <h2><span>4</span>Áreas de oportunidad y propuestas</h2>
          ${P.length ? P.map((p, i) => `
            <div class="informe__propuesta">
              <h3>${i + 1}. ${esc(p.area)}</h3>
              <p><b>Sustento:</b> ${esc(p.sustento)}</p>
              <p><b>Propuesta:</b> ${esc(p.propuesta)}</p>
            </div>`).join('') : '<p class="informe__parrafo">Con los datos del periodo no se identificaron áreas de oportunidad que superen los umbrales del informe.</p>'}
        </section>

        <footer class="informe__nota">
          <h2>Nota metodológica</h2>
          <p>Fuente: Sistema de Gestión de Protección Civil de La Magdalena Contreras (reportes operativos y de atención prehospitalaria). ${comp ? `Comparativo contra ${esc(comp)}. ` : ''}Una variación se considera relevante cuando es de al menos ${MIN_CAMBIO}% y alguno de los periodos tiene ${MIN_CASOS} casos o más. Los análisis de horario y día excluyen los registros de carga masiva sin hora real. Las propuestas son sugerencias técnicas derivadas de los datos y requieren validación del área responsable. Documento generado automáticamente; cifras sujetas a validación.</p>
        </footer>
      </article>`;
  }

  function tablaTop(titulo, lista, nombre, sub, total) {
    if (!lista || !lista.length) return '';
    return `<h3 class="informe__subtitulo">${esc(titulo)}</h3>
      <table class="informe__tabla informe__tabla--top">
        <tbody>${lista.slice(0, 5).map((i, n) => `<tr><td>${n + 1}</td><td>${esc(nombre(i))}<small>${esc(sub(i) || '')}</small></td><td>${num(i.total)}</td><td>${p1(porc(i.total, total))}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  // Versión en texto para WhatsApp (negritas con *)
  function texto(ctx) {
    const a = analizar(ctx);
    const plano = (s) => s.replace(/<b>(.*?)<\/b>/g, '*$1*').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const periodoTxt = ctx.periodo.inicio ? `${fechaLarga(ctx.periodo.inicio)} al ${fechaLarga(ctx.periodo.fin)}` : 'Histórico completo';
    const lineas = [
      '*INFORME EJECUTIVO DE SERVICIOS*',
      'Dirección de Protección Civil · La Magdalena Contreras',
      `Periodo: ${periodoTxt}${ctx.colonia ? ` · Colonia: ${ctx.colonia}` : ''}`,
      '',
      plano(resumen(ctx, a)),
      '',
      '*Indicadores*',
      ...indicadores(ctx, a).map((f) => `• ${f.nombre}: ${f.actual}${f.anterior !== '—' ? ` (antes ${f.anterior}, ${f.variacion})` : ''}`),
      '',
      '*Hallazgos*',
      ...hallazgos(ctx, a).map((h) => `• ${plano(h.txt)}`),
      '',
      '*Propuestas*',
      ...propuestas(ctx, a).map((p, i) => `${i + 1}. *${p.area}*: ${p.propuesta}`),
    ];
    return lineas.join('\n');
  }

  window.Informe = { html, texto };
})();
