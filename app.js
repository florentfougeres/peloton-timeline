(async function () {
  const DATA = await (await fetch('data.json')).json();

  const years = DATA.years;
  const maxYear = Math.max(...years);
  const minYear = Math.min(...years);

  document.getElementById('yearRange').textContent = `${minYear}–${maxYear}`;
  document.getElementById('axisMin').textContent = minYear;
  document.getElementById('axisMax').textContent = maxYear;
  document.getElementById('footerMinYear').textContent = minYear;

  // L'UCI a renommé ses divisions au fil du temps, et le même nom a parfois
  // désigné des niveaux différents : "UCI ProTeam" était la 1ère division
  // jusqu'en 2014, puis désigne la 2e division depuis 2020. On garde donc
  // deux couleurs fixes (monde/pro = niveau 1/niveau 2) mais l'intitulé
  // affiché dépend de l'année du segment.
  const DIVISION_BOUNDARIES = { world: [2005, 2015], pro: [2005, 2020] };

  function divisionName(cat, year) {
    if (cat === 'world') return year < 2005 ? 'Groupe Sportif I' : year <= 2014 ? 'UCI ProTeam' : 'UCI WorldTeam';
    if (cat === 'pro') return year < 2005 ? 'Groupe Sportif II' : year <= 2019 ? 'Continentale Pro' : 'UCI ProTeam';
    return null;
  }

  // Découpe un segment en périodes ayant chacune un intitulé de division
  // stable (nécessaire quand un même sponsor traverse un changement de
  // nomenclature UCI, ex. AG2R La Mondiale 2008-2020).
  function divisionPeriods(seg) {
    const boundaries = DIVISION_BOUNDARIES[seg.cat];
    if (!boundaries) return [];
    const cuts = boundaries.filter((b) => b > seg.start && b <= seg.end);
    const points = [seg.start, ...cuts, seg.end + 1];
    const periods = [];
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i];
      const end = points[i + 1] - 1;
      periods.push({ start, end, label: divisionName(seg.cat, start) });
    }
    return periods;
  }

  // Noms français des pays de licence UCI présents dans data.json, pour l'info-bulle du drapeau.
  const COUNTRY_NAME = {
    AE: 'Émirats arabes unis', AU: 'Australie', BE: 'Belgique', BH: 'Bahreïn',
    CH: 'Suisse', DE: 'Allemagne', DK: 'Danemark', ES: 'Espagne', FR: 'France',
    GB: 'Royaume-Uni', IL: 'Israël', IT: 'Italie', KZ: 'Kazakhstan', LU: 'Luxembourg',
    NL: 'Pays-Bas', NO: 'Norvège', PL: 'Pologne', RU: 'Russie', US: 'États-Unis',
    ZA: 'Afrique du Sud',
  };

  const FLAG_CDN = 'https://cdn.jsdelivr.net/npm/circle-flags@2/flags/';

  function flagImg(code, title, extraClass) {
    const src = `${FLAG_CDN}${code.toLowerCase()}.svg`;
    const cls = extraClass ? `ti-flag ${extraClass}` : 'ti-flag';
    return `<img class="${cls}" src="${src}" width="15" height="15" alt="${escapeHtml(title)}" title="${escapeHtml(title)}" loading="lazy" />`;
  }

  function flagTitle(code) {
    return `Licence UCI : ${COUNTRY_NAME[code] || code}`;
  }

  // Pays de la licence la plus récente d'un segment (dernière période si elle a changé en cours de route).
  function latestCountryCode(seg) {
    if (seg.countryPeriods) return seg.countryPeriods[seg.countryPeriods.length - 1].country;
    return seg.country || null;
  }

  function normalize(str) {
    return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // ---------- Theme ----------

  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('peloton-theme', next);
  });

  // ---------- Enrich lineages ----------

  const lineages = DATA.lineages.map((lineage) => {
    const segs = lineage.segments;
    const last = segs[segs.length - 1];
    const isSpecialEnd = last.cat === 'special';
    const realSegs = segs.filter((s) => s.cat !== 'special');
    const lastReal = realSegs[realSegs.length - 1] || last;
    const activeNow = lineage.lastYear === maxYear && !isSpecialEnd;
    const status = activeNow ? last.cat : 'gone';
    const seasons = lineage.lastYear - lineage.firstYear + 1;
    const searchBlob = normalize(segs.map((s) => s.name).join(' | '));

    return {
      ...lineage,
      segs,
      lastSeg: last,
      lastReal,
      isSpecialEnd,
      activeNow,
      status, // 'world' | 'pro' | 'gone'
      seasons,
      searchBlob,
      displayName: lastReal.name,
    };
  });

  // ---------- Filtering / sorting state ----------

  const state = {
    search: '',
    statusSet: new Set(['world', 'pro', 'gone']),
    sort: 'status',
  };

  function applyFilters() {
    let list = lineages.filter((l) => state.statusSet.has(l.status));
    if (state.search) {
      list = list.filter((l) => l.searchBlob.includes(state.search));
    }
    return list;
  }

  function sortList(list) {
    const byName = (a, b) => a.displayName.localeCompare(b.displayName, 'fr');
    const arr = [...list];
    switch (state.sort) {
      case 'alpha':
        arr.sort(byName);
        break;
      case 'oldest':
        arr.sort((a, b) => a.firstYear - b.firstYear || byName(a, b));
        break;
      case 'longevity':
        arr.sort((a, b) => b.seasons - a.seasons || byName(a, b));
        break;
      case 'status':
      default: {
        const rank = { world: 0, pro: 1, gone: 2 };
        arr.sort((a, b) => rank[a.status] - rank[b.status] || byName(a, b));
      }
    }
    return arr;
  }

  // ---------- Rendering ----------

  const teamList = document.getElementById('teamList');

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderBar(l) {
    const leadSpace = l.firstYear - minYear;
    const trailSpace = maxYear - l.lastYear;
    let html = '';
    if (leadSpace > 0) html += `<div class="bar-spacer" style="flex-grow:${leadSpace}"></div>`;
    l.segs.forEach((seg, idx) => {
      const duration = seg.end - seg.start + 1;
      const name = escapeHtml(seg.name);
      html += `<div class="bar-seg seg-${seg.cat}" style="flex-grow:${duration}" data-idx="${idx}" title="${name} (${seg.start}–${seg.end})"><span class="bar-seg-label">${name}</span></div>`;
    });
    if (trailSpace > 0) html += `<div class="bar-spacer" style="flex-grow:${trailSpace}"></div>`;
    return html;
  }

  function render() {
    const filtered = applyFilters();
    const list = sortList(filtered);

    document.getElementById('emptyState').hidden = list.length !== 0;
    teamList.hidden = list.length === 0;

    updatePillCounts();

    teamList.innerHTML = list
      .map((l) => {
        const dotClass = l.status === 'world' ? 'dot-world' : l.status === 'pro' ? 'dot-pro' : 'dot-gone';
        const badgeClass = l.status === 'world' ? 'badge-world' : l.status === 'pro' ? 'badge-pro' : 'badge-gone';
        const badgeLabel = l.status === 'gone' ? 'Disparue' : divisionName(l.status, maxYear);
        const meta = l.activeNow
          ? `Depuis ${l.firstYear} · ${l.seasons} saisons`
          : l.isSpecialEnd
          ? `${l.lastSeg.name} · ${l.lastSeg.start}`
          : `Dernière saison : ${l.lastYear}`;

        const countryCode = latestCountryCode(l.lastReal);
        const cardFlag = countryCode ? flagImg(countryCode, flagTitle(countryCode), 'card-flag') : '';

        return `
        <article class="card" data-id="${l.id}">
          <div class="card-head">
            <div class="card-head-left">
              <span class="dot ${dotClass}"></span>
              <div class="card-title">
                <div class="card-name">${cardFlag}${escapeHtml(l.displayName)}</div>
                <div class="card-meta">${escapeHtml(meta)}</div>
              </div>
            </div>
            <span class="card-badge ${badgeClass}">${badgeLabel}</span>
          </div>
          <div class="bar">
            ${renderBar(l)}
          </div>
        </article>`;
      })
      .join('');

    teamList.querySelectorAll('.card').forEach((card) => {
      const l = lineages.find((x) => x.id === Number(card.dataset.id));
      if (!l) return;

      card.addEventListener('click', () => openModal(l));

      card.querySelectorAll('.bar-seg').forEach((segEl) => {
        segEl.addEventListener('click', (e) => {
          e.stopPropagation();
          openModal(l, Number(segEl.dataset.idx));
        });
      });
    });
  }

  // ---------- Modal ----------

  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalContent = document.getElementById('modalContent');

  function openModal(l, focusIdx) {
    const subtitle = l.activeNow
      ? `Active en ${maxYear} · ${divisionName(l.status, maxYear)} · ${l.seasons} saisons depuis ${l.firstYear}`
      : `Inactive depuis ${l.lastYear} · ${l.seasons} saisons entre ${l.firstYear} et ${l.lastYear}`;

    function renderFlags(seg) {
      if (seg.countryPeriods) {
        return seg.countryPeriods
          .map((p) => {
            const py = p.start === p.end ? `${p.start}` : `${p.start}–${p.end}`;
            return flagImg(p.country, `${flagTitle(p.country)} (${py})`);
          })
          .join('');
      }
      return seg.country ? flagImg(seg.country, flagTitle(seg.country)) : '';
    }

    function renderBadges(seg) {
      const periods = divisionPeriods(seg);
      if (periods.length === 0) return '';
      const spans = periods
        .map((p) => {
          const py = p.start === p.end ? `${p.start}` : `${p.start}–${p.end}`;
          const withYears = p.start !== seg.start || p.end !== seg.end;
          return `<span class="ti-badge cat-${seg.cat}">${p.label}${withYears ? ` · ${py}` : ''}</span>`;
        })
        .join('');
      return `<div class="ti-badges">${spans}</div>`;
    }

    const items = l.segs
      .map((seg, idx) => {
        const yrs = seg.start === seg.end ? `${seg.start}` : `${seg.start}–${seg.end}`;
        const badge = renderBadges(seg);
        return `
        <div class="timeline-item cat-${seg.cat}" data-idx="${idx}">
          <div class="ti-years">${yrs}</div>
          <div class="ti-name"><span class="ti-flags">${renderFlags(seg)}</span>${escapeHtml(seg.name)}</div>
          ${badge}
        </div>`;
      })
      .join('');

    modalContent.innerHTML = `
      <h2>${escapeHtml(l.displayName)}</h2>
      <p class="modal-sub">${subtitle}</p>
      <div class="timeline-list">${items}</div>
    `;
    modalBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';

    if (focusIdx != null) {
      const target = modalContent.querySelector(`.timeline-item[data-idx="${focusIdx}"]`);
      if (target) {
        target.classList.add('is-focused');
        requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
      }
    }
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
    document.body.style.overflow = '';
  }

  document.getElementById('modalClose').addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ---------- Controls ----------

  const searchInput = document.getElementById('search');
  const clearBtn = document.getElementById('clearSearch');

  searchInput.addEventListener('input', () => {
    state.search = normalize(searchInput.value.trim());
    clearBtn.hidden = searchInput.value.length === 0;
    render();
  });
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.search = '';
    clearBtn.hidden = true;
    render();
    searchInput.focus();
  });

  document.getElementById('sortSelect').addEventListener('change', (e) => {
    state.sort = e.target.value;
    render();
  });

  const pills = document.querySelectorAll('.pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const f = pill.dataset.filter;
      state.statusSet = f === 'all' ? new Set(['world', 'pro', 'gone']) : new Set([f]);
      syncPillUI();
      render();
    });
  });

  function syncPillUI() {
    const presets = { all: ['world', 'pro', 'gone'], world: ['world'], pro: ['pro'], gone: ['gone'] };
    pills.forEach((pill) => {
      const preset = presets[pill.dataset.filter];
      const match = preset.length === state.statusSet.size && preset.every((c) => state.statusSet.has(c));
      pill.classList.toggle('is-active', match);
    });
  }

  function updatePillCounts() {
    const counts = { world: 0, pro: 0, gone: 0 };
    lineages.forEach((l) => counts[l.status]++);
    document.getElementById('count-all').textContent = lineages.length;
    document.getElementById('count-world').textContent = counts.world;
    document.getElementById('count-pro').textContent = counts.pro;
    document.getElementById('count-gone').textContent = counts.gone;
  }

  // ---------- Init ----------

  render();
})();
