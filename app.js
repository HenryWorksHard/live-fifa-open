/* ============================================================
   Live FIFA Open — pack opener
   ============================================================ */
const $  = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');

const RARITY_ORDER = ['bronze', 'silver', 'gold', 'rare_gold', 'hero', 'icon'];
const SPECIAL_RARITIES = new Set(['rare_gold', 'hero', 'icon']);

/* FIFA 3-letter nation codes -> ISO 3166-1 alpha-2 (or gb-eng / gb-sct for UK subdivisions).
   Used for https://flagcdn.com/w80/<iso>.png flag images. */
const NATION_TO_ISO = {
  ARG:'ar', FRA:'fr', NOR:'no', ENG:'gb-eng', BRA:'br', ESP:'es', GER:'de',
  BEL:'be', NED:'nl', SUI:'ch', KOR:'kr', CRO:'hr', USA:'us', CAN:'ca',
  MEX:'mx', POL:'pl', EGY:'eg', SEN:'sn', ITA:'it', POR:'pt', URU:'uy',
  COL:'co', JPN:'jp', AUS:'au', IRN:'ir', MAR:'ma', NGA:'ng', GHA:'gh',
  CIV:'ci', CMR:'cm', DEN:'dk', SWE:'se', SRB:'rs', TUR:'tr', SCO:'gb-sct',
  HUN:'hu', CRC:'cr'
};
const flagUrl = (code) => {
  const iso = NATION_TO_ISO[code];
  return iso ? `https://flagcdn.com/w80/${iso}.png` : null;
};

/* Session stats — persist across pack openings until user resets */
const session = { packsOpened: 0, totalCards: 0, bestCard: null };

const SETS = {
  'group-stage': {
    name: 'Group Stage',
    sub:  '8 cards · 1+ rare',
    size: 8,
    guarantee: 'rare_gold',
    weights: { gold: 70, rare_gold: 22, hero: 6, icon: 2 }
  },
  'knockout': {
    name: 'Knockout',
    sub:  '8 cards · 1+ hero',
    size: 8,
    guarantee: 'hero',
    weights: { gold: 55, rare_gold: 30, hero: 12, icon: 3 }
  },
  'legends': {
    name: 'Legends',
    sub:  '5 cards · 1 icon',
    size: 5,
    guarantee: 'icon',
    weights: { gold: 30, rare_gold: 40, hero: 20, icon: 10 }
  }
};

let allCards = [];
let currentSet = null;
let currentPool = [];

/* ------------------------------------------------------------ */
async function init() {
  const data = await fetch('data/cards.json').then(r => r.json());
  allCards = data.cards;
  wireUI();
}

function wireUI() {
  $$('.pack-card').forEach(el => el.addEventListener('click', () => choosePack(el.dataset.set)));
  $$('[data-action="reset"]').forEach(el => el.addEventListener('click', resetToPicker));
  $('#open-btn').addEventListener('click', openPack);
  $('#hero-pack').addEventListener('click', openPack);
  $('#open-another-btn').addEventListener('click', resetToPicker);
  $('#reset-stats').addEventListener('click', resetSession);
  $('#another-pack').addEventListener('click', resetToPicker);
  wireCaButton();
  renderSessionStats();
}

function wireCaButton() {
  const btn = $('#copy-ca-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const addr = btn.dataset.address?.trim();
    const original = 'CA';
    if (!addr) {
      btn.textContent = 'TBA';
      setTimeout(() => { btn.textContent = original; }, 1200);
      return;
    }
    try {
      await navigator.clipboard.writeText(addr);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = addr.slice(0, 6) + '…';
    }
    setTimeout(() => { btn.textContent = original; }, 1500);
  });
}

function resetSession() {
  session.packsOpened = 0;
  session.totalCards = 0;
  session.bestCard = null;
  renderSessionStats();
}

function renderSessionStats() {
  $('#stat-packs').textContent = session.packsOpened;
  $('#stat-total').textContent = session.totalCards;
  $('#stat-best').textContent = session.bestCard
    ? `${session.bestCard.rating} ${session.bestCard.name}`
    : '—';
  $('#another-pack').hidden = session.packsOpened === 0;
}

function resetToPicker() {
  goScreen('picker');
  delete app.dataset.state;
  const stage = $('#reveal-stage');
  stage.innerHTML = '';
  stage.classList.remove('all-revealed');
  const row = $('.reveal-row');
  if (row) row.remove();
  $('#reveal-hint').textContent = 'Tap to reveal';
  $('#open-another-btn').hidden = true;
}

function goScreen(name) {
  app.dataset.screen = name;
}

function choosePack(setKey) {
  currentSet = setKey;
  const cfg = SETS[setKey];
  $('#hero-pack-name').textContent = cfg.name;
  $('#hero-pack-sub').textContent  = cfg.sub;
  goScreen('pack');
}

/* ------------------------------------------------------------
   Card selection
   ------------------------------------------------------------ */
function pickRarity(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    if ((r -= w) <= 0) return k;
  }
  return Object.keys(weights)[0];
}

function pickCards(setKey) {
  const cfg = SETS[setKey];
  const used = new Set();
  const result = [];

  for (let i = 0; i < cfg.size; i++) {
    let rarity = pickRarity(cfg.weights);
    let pool = allCards.filter(c => c.rarity === rarity && !used.has(c.id));
    if (!pool.length) pool = allCards.filter(c => c.rarity === 'gold' && !used.has(c.id));
    if (!pool.length) pool = allCards.filter(c => !used.has(c.id));
    const pick = pool[Math.floor(Math.random() * pool.length)];
    used.add(pick.id);
    result.push(pick);
  }

  // enforce guarantee: replace lowest-rarity slot with required tier if absent
  if (cfg.guarantee) {
    const reqIdx = RARITY_ORDER.indexOf(cfg.guarantee);
    if (!result.some(c => RARITY_ORDER.indexOf(c.rarity) >= reqIdx)) {
      const pool = allCards.filter(c => c.rarity === cfg.guarantee && !used.has(c.id));
      if (pool.length) {
        // replace the lowest-rated card in the result
        let worstAt = 0;
        for (let i = 1; i < result.length; i++) {
          if (RARITY_ORDER.indexOf(result[i].rarity) < RARITY_ORDER.indexOf(result[worstAt].rarity)) worstAt = i;
        }
        result[worstAt] = pool[Math.floor(Math.random() * pool.length)];
      }
    }
  }

  // sort: bury the best one for last for drama
  result.sort((a, b) =>
    RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity) ||
    a.rating - b.rating
  );
  return result;
}

/* ------------------------------------------------------------
   Open pack
   ------------------------------------------------------------ */
async function openPack() {
  if (!currentSet) return;
  currentPool = pickCards(currentSet);
  session.packsOpened++;
  session.totalCards += currentPool.length;
  renderSessionStats();
  app.dataset.state = 'opening';
  await wait(1450);
  goScreen('reveal');
  app.dataset.state = 'revealing';
  buildRevealStage();
}

/* ------------------------------------------------------------
   Reveal stage
   ------------------------------------------------------------ */
function buildRevealStage() {
  const stage = $('#reveal-stage');
  stage.innerHTML = '';

  const stack = document.createElement('div');
  stack.className = 'card-stack';
  stack.style.position = 'relative';
  stack.style.width = '240px';
  stack.style.height = '340px';
  stage.appendChild(stack);

  const revealScreen = $('.screen[data-screen-id="reveal"]');
  let row = $('.reveal-row');
  if (!row) {
    row = document.createElement('div');
    row.className = 'reveal-row';
    revealScreen.insertBefore(row, $('#reveal-hint'));
  } else {
    row.innerHTML = '';
  }

  // place all cards face-down, stacked
  const stackedEls = [];
  currentPool.forEach((card, i) => {
    const el = makeCardElement(card);
    el.classList.add('stacked');
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.zIndex = String(currentPool.length - i);
    const offset = i * 1.5;
    const rot = (i % 2 ? 1 : -1) * (i * 0.5);
    el.style.transform = `translate(${offset}px, ${offset}px) rotate(${rot}deg)`;
    el.style.transition = 'transform 600ms cubic-bezier(.2,.7,.2,1), opacity 400ms ease';
    stack.appendChild(el);
    stackedEls.push(el);
  });

  // stagger fade-in for the stack
  stackedEls.forEach((el, i) => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.opacity = '1'; }, 60 + i * 50);
  });

  let idx = 0;
  let isFlipping = false;
  const flipNext = () => {
    if (isFlipping || idx >= currentPool.length) return;
    // Always reveal the top of the stack (first DOM child = highest z-index).
    // Cards were sorted lowest-rarity-first, so the best card is at the bottom
    // of the stack and reveals last for drama.
    const el = stack.children[0];
    if (!el) return;
    const card = currentPool[idx];
    const isSpecial = SPECIAL_RARITIES.has(card.rarity);
    isFlipping = true;

    // clear the stack-jitter inline transform on the outer .card (which only handles
    // position/jitter); the actual flip animation runs on .card-inner.
    el.style.transition = 'none';
    el.style.transform = '';
    el.style.zIndex = '999';
    if (isSpecial) {
      el.classList.add('is-special');
      stage.classList.add('flash-special');
    }
    void el.offsetWidth;
    el.classList.add('is-spinning');

    const duration = isSpecial ? 1300 : 1000;

    // best-pull tracking: update mid-flip so the stats bar updates as the card reveals
    if (!session.bestCard || card.rating > session.bestCard.rating) {
      session.bestCard = card;
      renderSessionStats();
    }

    setTimeout(() => {
      // Lock the spin animation's final state into inline styles BEFORE removing
      // the classes. Without this, removing `is-special` causes the non-special
      // animation rule (which starts from rotateY(0)) to restart the spin from
      // scratch, leaving the card mid-rotation when the user looks at it.
      const inner = el.querySelector('.card-inner');
      inner.style.animation = 'none';
      inner.style.transform = 'rotateY(0deg) scale(1)';
      inner.style.filter = 'none';
      el.querySelector('.card-back').style.opacity = '0';
      el.querySelector('.card-face').style.opacity = '1';

      el.classList.remove('is-spinning', 'is-special');
      stage.classList.remove('flash-special');
      el.style.zIndex = '';

      // detach from stack, append to row inside a slot
      const slot = document.createElement('div');
      slot.className = 'card-slot';
      slot.style.position = 'relative';
      el.style.position = 'absolute';
      el.style.inset = '0';
      slot.appendChild(el);
      row.appendChild(slot);

      idx++;
      isFlipping = false;
      if (idx >= currentPool.length) {
        $('#reveal-hint').textContent = 'Drop complete';
        $('#open-another-btn').hidden = false;
        // Collapse the empty stack area so the revealed row hugs the top
        stage.classList.add('all-revealed');
      } else {
        $('#reveal-hint').textContent = `${currentPool.length - idx} left — tap to reveal`;
      }
    }, duration);
  };

  const onTap = () => {
    if (idx >= currentPool.length) return;
    flipNext();
  };
  stage.addEventListener('click', onTap);

  $('#reveal-hint').textContent = `${currentPool.length} cards — tap to reveal`;
  $('#open-another-btn').hidden = true;
}

/* ------------------------------------------------------------
   Card factory
   ------------------------------------------------------------ */
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h * 31) + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function skillProfile(card) {
  const h = hashId(card.id);
  const stars = Math.max(1, Math.min(5, Math.round(card.rating / 18) - 1));
  return { foot: (h % 2 === 0) ? 'L' : 'R', stars };
}

const EMBLEM_SVG = `<svg class="face-emblem" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L14.3 8.7 L21.5 8.7 L15.6 13.1 L17.9 19.8 L12 15.5 L6.1 19.8 L8.4 13.1 L2.5 8.7 L9.7 8.7 Z"/></svg>`;

function makeCardElement(card) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.rarity = card.rarity;
  el.dataset.id = card.id;
  const { foot, stars } = skillProfile(card);
  const flag = flagUrl(card.nationCode);
  const flagImg = flag
    ? `<img class="meta-flag" src="${flag}" alt="${escapeHTML(card.nation)}" loading="lazy">`
    : `<span class="meta-flag" title="${escapeHTML(card.nation)}" style="display:grid;place-items:center;font-size:8px;font-weight:800;letter-spacing:0.5px;">${card.nationCode}</span>`;

  el.innerHTML = `
    <div class="card-inner">
      <div class="card-back">
        <span class="card-back-logo">P</span>
      </div>
      <div class="card-face">
        <div class="card-photo">${
        card.faceUrl
          ? `<img class="portrait-img" src="${card.faceUrl}" alt="${escapeHTML(card.name)}" loading="lazy" referrerpolicy="no-referrer">`
          : `<svg class="silhouette-svg" viewBox="0 0 100 120" preserveAspectRatio="xMidYMid meet"><use href="#silhouette"/></svg>`
        }</div>
        ${EMBLEM_SVG}
        <div class="card-rating-block">
          <span class="card-rating">${card.rating}</span>
          <span class="card-position">${escapeHTML(card.position)}</span>
          <div class="card-skills">
            <span class="skill-foot">${foot}</span>
            <span class="skill-stars">${stars}★</span>
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-name">${escapeHTML(card.name)}</div>
          <div class="card-stats">
            <div class="card-stat"><span>PAC</span><b>${card.stats.PAC}</b></div>
            <div class="card-stat"><span>SHO</span><b>${card.stats.SHO}</b></div>
            <div class="card-stat"><span>PAS</span><b>${card.stats.PAS}</b></div>
            <div class="card-stat"><span>DRI</span><b>${card.stats.DRI}</b></div>
            <div class="card-stat"><span>DEF</span><b>${card.stats.DEF}</b></div>
            <div class="card-stat"><span>PHY</span><b>${card.stats.PHY}</b></div>
          </div>
          <div class="card-meta">
            ${flagImg}
            <span class="meta-crest" aria-hidden="true"></span>
          </div>
        </div>
      </div>
    </div>
  `;
  if (SPECIAL_RARITIES.has(card.rarity)) attachHoloTilt(el);
  return el;
}

function attachHoloTilt(el) {
  const face = el.querySelector('.card-face');
  let raf = null;
  el.addEventListener('pointermove', (e) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      face.style.setProperty('--holo-angle', `${px * 360}deg`);
      // Subtle tilt only — no rotateY (used to flip the card under the old
      // 3D-flip structure; with the opacity-crossfade pattern the face is
      // already at local identity and any rotateY here would flip it on hover).
      face.style.setProperty('transform', `rotateX(${(0.5 - py) * 6}deg) rotateY(${(px - 0.5) * 6}deg)`);
    });
  });
  el.addEventListener('pointerleave', () => {
    face.style.transform = '';
  });
}

/* ------------------------------------------------------------
   Utils
   ------------------------------------------------------------ */
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

init();
