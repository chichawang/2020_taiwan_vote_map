const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const formatTxt = s => esc(s).replace(/@([0-9A-Fa-f]{4,6})@/g, (_, code) => `<img class="rareChar" src="https://www.cns11643.gov.tw/char/kai/4/${code}.png" alt="罕用字">`);

const VOTER_TYPES = { '01': '一般選舉人', '02': '山地原住民', '03': '平地原住民' };

const BASEMAPS = [
  {
    id: 'nlsc-emap',
    name: '國土測繪 彩色',
    sub: '臺灣通用電子地圖',
    swatch: 'sw-emap',
    thumbClass: '',
    url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}',
    opts: { attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>', minZoom: 0, maxNativeZoom: 19, maxZoom: 20 }
  },
  {
    id: 'nlsc-gray',
    name: '國土測繪 灰階',
    sub: '簡潔灰階街道',
    swatch: 'sw-gray',
    thumbClass: 'mode-gray',
    url: 'https://wmts.nlsc.gov.tw/wmts/EMAP01/default/GoogleMapsCompatible/{z}/{y}/{x}',
    opts: { attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>', minZoom: 0, maxNativeZoom: 19, maxZoom: 20 }
  },
  {
    id: 'nlsc-mix',
    name: '國土衛星混合',
    sub: '正射影像＋路網',
    swatch: 'sw-mix',
    thumbClass: 'mode-sat',
    url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO_MIX/default/GoogleMapsCompatible/{z}/{y}/{x}',
    opts: { attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>', minZoom: 0, maxNativeZoom: 19, maxZoom: 20 }
  },
  {
    id: 'nlsc-photo',
    name: '國土衛星影像',
    sub: '航照正射影像',
    swatch: 'sw-sat',
    thumbClass: 'mode-sat',
    url: 'https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}',
    opts: { attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>', minZoom: 0, maxNativeZoom: 19, maxZoom: 20 }
  },
  {
    id: 'carto-voyager',
    name: '簡潔彩色',
    sub: 'Carto Voyager',
    swatch: 'sw-carto',
    thumbClass: '',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    opts: { attribution: '&copy; OpenStreetMap &copy; CARTO', subdomains: 'abcd', maxZoom: 20 }
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    sub: '標準社群圖磚',
    swatch: 'sw-osm',
    thumbClass: '',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    opts: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }
  }
];

const OVERLAYS = [
  {
    id: 'nlsc-city',
    name: '縣市界',
    sub: '直轄市/縣市',
    color: '#F9AB00',
    defaultOn: true,
    url: 'https://wmts.nlsc.gov.tw/wmts/CITY/default/GoogleMapsCompatible/{z}/{y}/{x}'
  },
  {
    id: 'nlsc-town',
    name: '鄉鎮區界',
    sub: '鄉鎮市區',
    color: '#1A73E8',
    defaultOn: false,
    url: 'https://wmts.nlsc.gov.tw/wmts/TOWN/default/GoogleMapsCompatible/{z}/{y}/{x}'
  },
  {
    id: 'nlsc-village',
    name: '村里界',
    sub: '村里邊界',
    color: '#1E8E3E',
    defaultOn: false,
    url: 'https://wmts.nlsc.gov.tw/wmts/Village/default/GoogleMapsCompatible/{z}/{y}/{x}'
  }
];

const PARTY_COLORS = {
  '中國國民黨': '#000095',
  '民主進步黨': '#1B9431',
  '台灣民眾黨': '#28C8C8',
  '中國民眾黨': '#28C8C8',
  '時代力量': '#FBBE01',
  '台灣基進': '#A73F24',
  '新黨': '#E6B800',
  '台灣綠黨': '#66BB6A',
  '親民黨': '#FF6310',
  '台聯黨': '#C68B2C',
  '小民參政歐巴桑聯盟': '#F06292',
  '無': '#5F6368'
};

let manifest = null;
let all = [];
let filtered = [];
let shown = 0;
let activeId = null;
let map = null;
let markerLayer = null;
let activeRingLayer = null;
let tileLayer = null;
let currentBasemap = BASEMAPS.find(b => b.id === 'nlsc-mix') || BASEMAPS[0];
const activeOverlays = new Map();
const candCache = new Map();
const dataStore = new Map();
const dataWaiters = new Map();

window.__VOTE_LOAD__ = (key, payload) => {
  dataStore.set(key, payload);
  const w = dataWaiters.get(key);
  if (w) {
    dataWaiters.delete(key);
    w.resolve(payload);
  }
};

function loadDataScript(key, src) {
  if (dataStore.has(key)) return Promise.resolve(dataStore.get(key));
  if (dataWaiters.has(key)) return dataWaiters.get(key).promise;
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  dataWaiters.set(key, { resolve, reject, promise });
  const el = document.createElement('script');
  el.src = src;
  el.async = true;
  el.onerror = () => {
    dataWaiters.delete(key);
    reject(new Error('Failed to load ' + src));
  };
  document.head.appendChild(el);
  return promise;
}

function markerStyleForZoom(z, isMulti) {
  const t = Math.max(0, Math.min(1, (z - 7) / 7));
  const minR = isMulti ? 2.1 : 1.6;
  const maxR = isMulti ? 7.5 : 6.5;
  return {
    radius: +(minR + (maxR - minR) * t).toFixed(2),
    weight: +(0.4 + 1.6 * t).toFixed(2)
  };
}

function updateMarkerSizes() {
  if (!map || !markerLayer) return;
  const z = map.getZoom();
  markerLayer.eachLayer(m => {
    if (typeof m.setStyle === 'function') m.setStyle(markerStyleForZoom(z, !!m._isMulti));
  });
}

function initMap() {
  if (!window.L) {
    $('#map').innerHTML = '<p class="empty">地圖元件載入失敗，請檢查網路後重新整理。仍可使用左側清單查詢。</p>';
    return;
  }
  map = L.map('map', { zoomControl: false, preferCanvas: true }).setView([23.75, 120.75], 7);
  const bPane = map.createPane('boundaryPane');
  bPane.style.zIndex = 350;
  bPane.style.pointerEvents = 'none';
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  setBasemap('nlsc-mix');
  markerLayer = L.layerGroup().addTo(map);
  activeRingLayer = L.layerGroup().addTo(map);
  map.on('zoomend', updateMarkerSizes);
  buildLayerSwitcher();
  for (const ov of OVERLAYS) {
    if (ov.defaultOn) toggleOverlay(ov.id, true);
  }
}

function updateLayerBadge() {
  const ovNames = OVERLAYS.filter(ov => activeOverlays.has(ov.id)).map(ov => ov.name);
  $('#layer-badge').textContent = ovNames.length ? `${currentBasemap.name} · ${ovNames.join('+')}` : currentBasemap.name;
}

function toggleOverlay(id, forceState) {
  const ov = OVERLAYS.find(o => o.id === id);
  if (!ov || !map) return;
  const shouldOn = forceState !== undefined ? forceState : !activeOverlays.has(id);
  if (shouldOn && !activeOverlays.has(id)) {
    const lyr = L.tileLayer(ov.url, {
      pane: 'boundaryPane',
      minZoom: 0,
      maxNativeZoom: 18,
      maxZoom: 20,
      opacity: 0.92,
      attribution: '&copy; <a href="https://maps.nlsc.gov.tw/" target="_blank" rel="noopener">內政部國土測繪中心</a>'
    }).addTo(map);
    activeOverlays.set(id, lyr);
  } else if (!shouldOn && activeOverlays.has(id)) {
    map.removeLayer(activeOverlays.get(id));
    activeOverlays.delete(id);
  }
  document.querySelectorAll('.overlay-chip').forEach(el => {
    const on = activeOverlays.has(el.dataset.id);
    el.classList.toggle('active', on);
    el.setAttribute('aria-pressed', String(on));
  });
  updateLayerBadge();
}

function setBasemap(id) {
  const bm = BASEMAPS.find(b => b.id === id) || BASEMAPS[0];
  currentBasemap = bm;
  if (tileLayer && map) map.removeLayer(tileLayer);
  if (map) tileLayer = L.tileLayer(bm.url, bm.opts).addTo(map);
  updateLayerBadge();
  const thumb = $('#layers-thumb');
  thumb.className = 'layers-thumb ' + (bm.thumbClass || '');
  document.querySelectorAll('.layer-opt').forEach(el => {
    el.classList.toggle('active', el.dataset.id === bm.id);
  });
}

function buildLayerSwitcher() {
  const grid = $('#layers-grid');
  grid.innerHTML = BASEMAPS.map(bm => `
    <button type="button" class="layer-opt ${bm.id === currentBasemap.id ? 'active' : ''}" data-id="${bm.id}">
      <div class="layer-swatch ${bm.swatch}"></div>
      <strong>${esc(bm.name)}</strong>
      <small>${esc(bm.sub)}</small>
    </button>
  `).join('');

  grid.querySelectorAll('.layer-opt').forEach(btn => {
    btn.onclick = () => {
      setBasemap(btn.dataset.id);
      $('#layers-menu').hidden = true;
      $('#layers-btn').setAttribute('aria-expanded', 'false');
    };
  });

  const ovList = $('#overlays-list');
  ovList.innerHTML = OVERLAYS.map(ov => {
    const on = activeOverlays.has(ov.id) || ov.defaultOn;
    return `
      <button type="button" class="overlay-chip ${on ? 'active' : ''}" data-id="${ov.id}" aria-pressed="${on}">
        <span class="overlay-line" style="background:${ov.color}"></span>
        <span>${esc(ov.name)}</span>
        <small>${esc(ov.sub)}</small>
      </button>
    `;
  }).join('');
  ovList.querySelectorAll('.overlay-chip').forEach(btn => {
    btn.onclick = () => toggleOverlay(btn.dataset.id);
  });

  $('#layers-btn').onclick = e => {
    e.stopPropagation();
    const next = $('#layers-menu').hidden;
    $('#layers-menu').hidden = !next;
    $('#layers-btn').setAttribute('aria-expanded', String(next));
  };
  document.addEventListener('click', e => {
    if (!$('#layers-menu').hidden && !e.target.closest('.layers-wrap')) {
      $('#layers-menu').hidden = true;
      $('#layers-btn').setAttribute('aria-expanded', 'false');
    }
  });
}

async function getCountyCandidates(countyCode) {
  if (candCache.has(countyCode)) return candCache.get(countyCode);
  const meta = manifest?.counties?.find(c => c.code === countyCode);
  const url = meta?.candidateFile || `data/candidates/${countyCode}.js`;
  const data = await loadDataScript(`ca:${countyCode}`, url);
  candCache.set(countyCode, data);
  return data;
}

function matchStationRaces(station, cdata) {
  const races = [];
  const dc = station.deptCode;
  const liSet = new Set(station.liCodes || []);
  const fullLiKeys = new Set([...liSet].map(lc => dc + lc));
  const voterSet = new Set(station.voters || ['01']);

  // 1. County Mayor / Magistrate (C1)
  if (cdata.C1 && cdata.C1.cands?.length) {
    races.push({
      title: cdata.C1.title,
      sub: '全縣市單一選區 · 應選 1 名',
      bulletinUrl: cdata.C1.bulletinUrl || '',
      cands: cdata.C1.cands
    });
  }

  // 2. Councilors (T) - match by voterType + (lis or depts)
  if (Array.isArray(cdata.T)) {
    const matchedT = cdata.T.filter(ar => {
      if (ar.voterType && !voterSet.has(ar.voterType)) return false;
      if (ar.lis?.length) return [...fullLiKeys].some(k => ar.lis.includes(k));
      return ar.depts?.includes(dc);
    });
    for (const ar of matchedT) {
      const vtLabel = ar.voterType ? VOTER_TYPES[ar.voterType] || '' : '';
      races.push({
        title: ar.areaName || '縣市議員',
        sub: `${vtLabel ? vtLabel + ' · ' : ''}應選 ${ar.numberElected || '—'} 名`,
        bulletinUrl: ar.bulletinUrl || '',
        cands: ar.cands || []
      });
    }
  }

  // 3. Township Mayor / Indigenous District Mayor (D1 / D2)
  for (const [key, label] of [['D1', '鄉鎮市長'], ['D2', '直轄市山地原住民區長']]) {
    const list = cdata[key]?.[dc];
    if (list?.length) {
      races.push({
        title: `${station.district}${label}`,
        sub: '全鄉鎮區單一選區 · 應選 1 名',
        bulletinUrl: '',
        cands: list
      });
    }
  }

  // 4. Township / Indigenous District Representatives (R / R3)
  for (const [key, label] of [['R', '鄉鎮市民代表'], ['R3', '原住民區民代表']]) {
    const areas = cdata[key]?.[dc];
    if (!Array.isArray(areas)) continue;
    let matchedR = areas.filter(ar => ar.lis?.some(lc => liSet.has(lc)));
    if (!matchedR.length) matchedR = areas;
    for (const ar of matchedR) {
      races.push({
        title: `${station.district}${label} ${ar.areaName || ''}`.trim(),
        sub: '地方民意代表選區',
        bulletinUrl: '',
        cands: ar.cands || []
      });
    }
  }

  // 5. Village / Neighborhood Chief (V1) - matched by liCodes
  const v1Map = cdata.V1?.[dc];
  if (v1Map) {
    const liNameByCode = new Map();
    for (const sc of station.scopes || []) {
      if (sc.li && !liNameByCode.has(sc.li)) liNameByCode.set(sc.li, sc.village);
    }
    for (const lc of station.liCodes || []) {
      const cands = v1Map[lc];
      if (!cands?.length) continue;
      const liName = liNameByCode.get(lc) || lc;
      races.push({
        title: `${station.district}${liName}長`,
        sub: '村里單一選區 · 應選 1 名',
        bulletinUrl: '',
        cands
      });
    }
  }

  return races;
}

function renderCandidateRows(cands, raceTitle, station, bulletinUrl) {
  return cands.map(c => {
    const color = PARTY_COLORS[c.party] || '#5F6368';
    const q = `${station.county} ${c.name} ${raceTitle} 政見`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    const polHtml = c.politics
      ? `<div class="cand-politics">${formatTxt(c.politics)}</div>`
      : '';
    const linkHref = c.politicsUrl || bulletinUrl || searchUrl;
    const linkLabel = c.politicsUrl ? '政見 ↗' : (bulletinUrl ? '公報 ↗' : '政見搜尋 ↗');
    return `
      <div class="cand-row">
        <span class="cand-no">${esc(c.no ?? '—')}</span>
        <div class="cand-main">
          <div class="cand-name-line">
            <span class="cand-name">${formatTxt(c.name)}</span>
            <span class="party-badge"><span class="party-dot" style="background:${color}"></span>${esc(c.party || '無')}</span>
          </div>
          ${polHtml}
        </div>
        <a class="cand-link" href="${linkHref}" target="_blank" rel="noopener">${linkLabel}</a>
      </div>
    `;
  }).join('');
}

function sourceBadgeClass(src) {
  if (src === '中選會') return 'src-cec';
  if (src && src.includes('Google')) return 'src-gmaps';
  return '';
}

async function showDetail(r) {
  activeId = r.id;
  document.querySelectorAll('.result').forEach(el => el.classList.toggle('active', el.dataset.id === r.id));

  const detailEl = $('#detail');
  detailEl.hidden = false;
  $('#app').classList.add('detail-open');
  if ($('#layers-menu')) {
    $('#layers-menu').hidden = true;
    $('#layers-btn')?.setAttribute('aria-expanded', 'false');
  }
  const infoEl = document.querySelector('.info-popover');
  if (infoEl) infoEl.open = false;
  const gmapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.coordinates ? r.coordinates.join(',') : r.address)}`;
  const srcLabel = r.coordinateSource || '已定位';

  detailEl.innerHTML = `
    <div class="detail-hero">
      <div class="detail-top-row">
        <span class="detail-eyebrow">${esc(r.county)} · ${esc(r.district)} · 第 ${esc(r.no)} 號投開票所</span>
        <button class="detail-close" aria-label="關閉詳細資訊">✕</button>
      </div>
      <h2>${formatTxt(r.name)}</h2>
      <p class="detail-addr">${formatTxt(r.address)}</p>
      <div class="detail-coord-row">
        <span class="pill ${sourceBadgeClass(srcLabel)}">${esc(srcLabel)}</span>
        <span>${r.coordinates ? r.coordinates.join(', ') : '未附座標'}</span>
      </div>
      <div class="detail-actions">
        <a class="btn-gblue" href="${gmapsUrl}" target="_blank" rel="noopener">在 Google 地圖中開啟導航 ↗</a>
        <button type="button" class="btn-outline" id="copy-addr">複製地址</button>
      </div>
    </div>
    <div class="detail-body">
      <div>
        <div class="section-title"><span>服務里鄰與選舉人類型</span><span>${r.scopes.length} 筆</span></div>
        <div class="scope-chips">
          ${r.scopes.map(s => `<span class="scope-chip">${VOTER_TYPES[s.v] || s.v} · ${formatTxt(s.village)} ${s.neighbor === s.village ? '' : esc(s.neighbor) + ' 鄰'}</span>`).join('')}
        </div>
      </div>
      <div>
        <div class="section-title">
          <span>本選區候選人與政見</span>
          <a href="https://info.cec.gov.tw/vote2026/candidate" target="_blank" rel="noopener" style="font-weight:500;font-size:12px">中選會候選人專區 ↗</a>
        </div>
        <div id="cand-container" class="race-list">
          <div class="empty" style="padding:16px">正在載入 ${esc(r.county)} 候選人與選舉公報…</div>
        </div>
      </div>
    </div>
  `;

  detailEl.querySelector('.detail-close').onclick = () => {
    detailEl.hidden = true;
    $('#app').classList.remove('detail-open');
    activeId = null;
    activeRingLayer?.clearLayers();
    document.querySelectorAll('.result.active').forEach(el => el.classList.remove('active'));
  };

  $('#copy-addr').onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.address);
      $('#copy-addr').textContent = '已複製 ✓';
      setTimeout(() => { if ($('#copy-addr')) $('#copy-addr').textContent = '複製地址'; }, 1500);
    } catch {
      $('#copy-addr').textContent = '無法複製';
    }
  };

  if (map && r.coordinates) {
    map.setView(r.coordinates, Math.max(map.getZoom(), 16));
    activeRingLayer.clearLayers();
    L.circleMarker(r.coordinates, {
      radius: 13,
      color: '#1A73E8',
      weight: 3,
      fillColor: '#1A73E8',
      fillOpacity: 0.16,
      interactive: false
    }).addTo(activeRingLayer);
  }

  // Load candidate & bulletin data for this county
  try {
    const cdata = await getCountyCandidates(r.countyCode);
    if (activeId !== r.id) return;
    const races = matchStationRaces(r, cdata);
    const container = $('#cand-container');
    if (!races.length) {
      container.innerHTML = '<div class="empty" style="padding:14px">尚無對應此選區的候選人資料。</div>';
      return;
    }
    container.innerHTML = races.map(race => `
      <div class="race-card">
        <div class="race-head">
          <div>
            <strong>${formatTxt(race.title)}</strong>
            <div class="race-sub">${esc(race.sub)} · 共 ${race.cands.length} 位候選人</div>
          </div>
          <div class="race-links">
            ${race.bulletinUrl ? `<a class="bulletin-btn" href="${race.bulletinUrl}" target="_blank" rel="noopener">📄 115年選舉公報 PDF ↗</a>` : ''}
            <a class="cec-btn" href="${cdata.cecCandidateUrl}" target="_blank" rel="noopener">中選會資料 ↗</a>
          </div>
        </div>
        <div class="cand-list">
          ${renderCandidateRows(race.cands, race.title, r, race.bulletinUrl)}
        </div>
      </div>
    `).join('');
  } catch {
    if ($('#cand-container')) {
      $('#cand-container').innerHTML = '<div class="empty" style="padding:14px">候選人資料載入失敗，請稍後再試或前往 <a href="https://info.cec.gov.tw/vote2026/candidate" target="_blank" rel="noopener">中選會專區</a>。</div>';
    }
  }
}

function renderMore() {
  const end = Math.min(shown + 60, filtered.length);
  const frag = document.createDocumentFragment();
  for (const r of filtered.slice(shown, end)) {
    const b = document.createElement('button');
    b.className = 'result' + (r.id === activeId ? ' active' : '');
    b.dataset.id = r.id;
    const src = r.coordinateSource || '已定位';
    b.innerHTML = `
      <div class="result-top">
        <span class="result-meta">${esc(r.county)} · ${esc(r.district)} · ${esc(r.no)}</span>
        <span class="pill ${sourceBadgeClass(src)}">${esc(src)}</span>
      </div>
      <strong>${formatTxt(r.name)}</strong>
      <p>${formatTxt(r.address)}</p>
    `;
    b.onclick = () => showDetail(r);
    frag.appendChild(b);
  }
  $('#results').appendChild(frag);
  shown = end;
  $('#more').hidden = shown >= filtered.length;
}

function applyFilter() {
  const rawQ = $('#search').value.trim();
  $('#clear-search').hidden = !rawQ;
  const q = rawQ.replaceAll('台', '臺');
  const c = $('#county').value;
  const d = $('#district').value;
  const v = $('#voter').value;

  filtered = all.filter(r =>
    (!c || r.county === c) &&
    (!d || r.district === d) &&
    (!v || r.voters.includes(v)) &&
    (!q || [r.name, r.address, r.no, ...r.scopes.map(s => s.village)].join(' ').replaceAll('台', '臺').includes(q))
  );

  $('#count').textContent = `${filtered.length.toLocaleString()} 所符合條件`;
  $('#results').replaceChildren();
  shown = 0;
  renderMore();

  if (!filtered.length) {
    $('#results').innerHTML = '<p class="empty">找不到符合的地點，請調整關鍵字或篩選條件。</p>';
  }

  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const groups = new Map();
  for (const r of filtered) {
    if (!r.coordinates) continue;
    const k = r.coordinates.join(',');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const z = map.getZoom();
  for (const rs of groups.values()) {
    const isMulti = rs.length > 1;
    const st = markerStyleForZoom(z, isMulti);
    const marker = L.circleMarker(rs[0].coordinates, {
      radius: st.radius,
      color: '#FFFFFF',
      weight: st.weight,
      fillColor: '#EA4335',
      fillOpacity: 0.92
    });
    marker._isMulti = isMulti;
    if (rs.length === 1) {
      marker.on('click', () => showDetail(rs[0]));
      marker.bindTooltip(`${rs[0].no} ${rs[0].name}`, { direction: 'top', offset: [0, -6] });
    } else {
      const box = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = `同地點共 ${rs.length} 個投開票所（點擊查看候選人與詳情）`;
      box.appendChild(title);
      for (const r of rs) {
        const btn = document.createElement('button');
        btn.className = 'place-btn';
        btn.textContent = `${r.no} · ${r.name}`;
        btn.onclick = () => showDetail(r);
        box.appendChild(btn);
      }
      marker.bindPopup(box);
    }
    marker.addTo(markerLayer);
  }
}

function wireControls() {
  $('#county').onchange = () => {
    const c = $('#county').value;
    const meta = manifest?.counties?.find(x => x.code === c || x.name === c);
    const districts = meta ? meta.districts : [...new Set(all.filter(r => r.county === c).map(r => r.district))];
    $('#district').innerHTML = '<option value="">全部行政區</option>' + districts.map(d => `<option>${esc(d)}</option>`).join('');
    applyFilter();
    if (map && meta?.center && c) map.setView(meta.center, 11);
  };
  $('#district').onchange = applyFilter;
  $('#voter').onchange = applyFilter;

  let timer;
  $('#search').oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(applyFilter, 180);
  };
  $('#clear-search').onclick = () => {
    $('#search').value = '';
    applyFilter();
    $('#search').focus();
  };
  $('#more').onclick = renderMore;
  $('#reset').onclick = () => {
    activeRingLayer?.clearLayers();
    map?.setView([23.75, 120.75], 7);
  };

  $('#toggle-sidebar').onclick = () => {
    $('#sidebar').classList.add('collapsed');
    $('#reopen-sidebar').hidden = false;
  };
  $('#reopen-sidebar').onclick = () => {
    $('#sidebar').classList.remove('collapsed');
    $('#reopen-sidebar').hidden = true;
  };

  $('#export').onclick = () => {
    const rows = [
      ['縣市', '行政區', '編號', '名稱', '地址', '緯度', '經度', '座標來源', '選舉人類型', '服務里鄰'],
      ...filtered.map(r => [
        r.county, r.district, r.no, r.name, r.address,
        ...(r.coordinates || ['', '']),
        r.coordinateSource || '',
        r.voters.map(v => VOTER_TYPES[v] || v).join('；'),
        r.scopes.map(s => (VOTER_TYPES[s.v] || s.v) + ':' + s.village + ' ' + s.neighbor).join('；')
      ])
    ];
    const csv = '\ufeff' + rows.map(row => row.map(v => '"' + String(/^[=+@-]/.test(String(v)) ? "'" + v : v ?? '').replaceAll('"', '""') + '"').join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = '2026投開票所.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
}

async function boot() {
  initMap();
  wireControls();
  try {
    manifest = await loadDataScript('index', 'data/index.js');

    $('#total').textContent = manifest.totalStations.toLocaleString();
    $('#mapped').textContent = manifest.mappedStations.toLocaleString();
    $('#county').innerHTML += manifest.counties.map(c => `<option value="${esc(c.name)}">${esc(c.name)} (${c.count.toLocaleString()})</option>`).join('');
    $('#coverage').textContent = `資料快照：${manifest.retrieved}。全臺共 ${manifest.totalStations.toLocaleString()} 所投開票所（100% 完成經緯度定位，涵蓋 22 縣市、共 ${manifest.totalCandidates.toLocaleString()} 位各級候選人）。資料依縣市分割為 JS 模組，本機雙擊即可開啟，亦相容 GitHub Pages。`;

    let loaded = 0;
    const countyArrays = await Promise.all(
      manifest.counties.map(c =>
        loadDataScript(`st:${c.code}`, c.stationFile).then(d => {
          loaded++;
          $('#load-progress').textContent = loaded < manifest.counties.length ? `載入 ${loaded}/${manifest.counties.length}` : '22 縣市已就緒';
          return d.stations || [];
        })
      )
    );
    all = countyArrays.flat();
    applyFilter();
  } catch (err) {
    $('#count').textContent = '資料載入失敗';
    $('#results').innerHTML = '<p class="empty">無法讀取分割資料檔，請確認 data/ 資料夾完整存在於 docs/ 同層目錄。</p>';
  }
}

boot();
