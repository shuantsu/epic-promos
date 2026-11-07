const els = {
  current: document.getElementById('current-games'),
  next: document.getElementById('next-games'),
  currentCount: document.getElementById('current-count'),
  nextCount: document.getElementById('next-count'),
  meta: document.getElementById('meta'),
  region: document.getElementById('region'),
  error: document.getElementById('error'),
  refresh: document.getElementById('refresh'),
};

const tpl = document.getElementById('card-template');
const countdowns = [];

function skeleton(container, n = 3) {
  container.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const div = document.createElement('div');
    div.className = 'skeleton';
    container.appendChild(div);
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return 'encerrado';
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function relativeUpdated(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'atualizado agora';
  if (min < 60) return `atualizado há ${min} min`;
  const h = Math.round(min / 60);
  return `atualizado há ${h}h`;
}

function renderCard(game, kind) {
  const node = tpl.content.cloneNode(true);
  const card = node.querySelector('.card');
  const img = node.querySelector('.thumb');
  const badge = node.querySelector('.badge');
  const title = node.querySelector('.title');
  const desc = node.querySelector('.desc');
  const price = node.querySelector('.price');
  const countdown = node.querySelector('.countdown');
  const cta = node.querySelector('.cta');

  img.src = game.image || game.thumb || '';
  img.alt = game.title;
  img.addEventListener('error', () => {
    if (game.thumb && img.src !== game.thumb) img.src = game.thumb;
  });

  badge.textContent = kind === 'current' ? 'grátis' : 'em breve';
  if (kind !== 'current') badge.classList.add('next');

  title.textContent = game.title;
  desc.textContent = game.description || 'Sem descrição disponível.';

  const free = !game.originalPrice || /^(0|R\$ 0,00)$/.test(game.originalPrice);
  price.textContent = free ? 'Grátis' : game.originalPrice;
  price.style.textDecoration = free ? 'none' : 'line-through';
  if (free) price.style.color = 'var(--ok)';

  cta.href = game.url;
  card.dataset.end = game.endDate || '';
  card.dataset.start = game.startDate || '';
  return node;
}

function renderGames(container, games, kind, label) {
  container.innerHTML = '';
  if (!games.length) {
    container.innerHTML = '<p class="empty">Nenhum jogo encontrado no momento.</p>';
  } else {
    games.forEach(g => container.appendChild(renderCard(g, kind)));
  }
  return `${label} · ${games.length}`;
}

function tickCountdowns() {
  document.querySelectorAll('.card[data-end]').forEach(card => {
    const el = card.querySelector('.countdown');
    const start = card.dataset.start ? new Date(card.dataset.start).getTime() : 0;
    const end = card.dataset.end ? new Date(card.dataset.end).getTime() : 0;
    const now = Date.now();

    if (start && now < start) {
      el.textContent = `começa em ${formatCountdown(start - now)}`;
      el.classList.remove('done');
    } else if (end) {
      const left = end - now;
      el.textContent = left > 0 ? `${formatCountdown(left)} restantes` : 'encerrado';
      el.classList.toggle('done', left <= 0);
    } else {
      el.textContent = 'esta semana';
      el.classList.add('done');
    }
  });
}

async function load(force = false) {
  els.refresh.disabled = true;
  els.error.hidden = true;
  skeleton(els.current, 3);
  skeleton(els.next, 3);
  els.meta.textContent = 'carregando...';

  try {
    const res = await fetch(`/api/games${force ? '?refresh=1' : ''}`);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'erro na API');

    els.currentCount.textContent = renderGames(els.current, data.currentGames, 'current', 'agora');
    els.nextCount.textContent = renderGames(els.next, data.nextGames, 'next', 'próximos');
    els.region.textContent = `${data.country}/${data.locale}`;
    els.meta.textContent = `${relativeUpdated(new Date(data.fetchedAt).toISOString())}${data.stale ? ' · dados de reserva' : ''}`;
    tickCountdowns();
  } catch (err) {
    els.current.innerHTML = '';
    els.next.innerHTML = '';
    els.error.textContent = `Não foi possível carregar os jogos: ${err.message}`;
    els.error.hidden = false;
    els.meta.textContent = 'falha ao atualizar';
  } finally {
    els.refresh.disabled = false;
  }
}

els.refresh.addEventListener('click', () => load(true));
setInterval(tickCountdowns, 1000);
setInterval(() => load(false), 10 * 60 * 1000);
load();
