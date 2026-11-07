const path = require('path');
const express = require('express');
const { EpicFreeGames } = require('epic-free-games');

const PORT = process.env.PORT || 3000;
const COUNTRY = process.env.COUNTRY || 'BR';
const LOCALE = process.env.LOCALE || 'pt-BR';
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000;

const epic = new EpicFreeGames({ country: COUNTRY, locale: LOCALE, includeAll: false });
const app = express();

let cache = { data: null, fetchedAt: 0 };
let inflight = null;

function promoWindow(game) {
  const current = game.promotions?.promotionalOffers ?? [];
  const upcoming = game.promotions?.upcomingPromotionalOffers ?? [];
  const window = [...current, ...upcoming]
    .flatMap(group => group.promotionalOffers ?? [])
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0];
  return window
    ? { startDate: window.startDate, endDate: window.endDate }
    : { startDate: game.effectiveDate ?? null, endDate: null };
}

function pickImage(game, type) {
  const byType = game.keyImages?.find(img => img.type === type)?.url;
  return byType || game.keyImages?.[0]?.url || null;
}

function storeUrl(game) {
  const slug =
    game.catalogNs?.mappings?.[0]?.pageSlug ||
    game.offerMappings?.[0]?.pageSlug ||
    game.productSlug ||
    game.urlSlug;
  if (!slug) return 'https://store.epicgames.com/';
  return `https://store.epicgames.com/${LOCALE}/p/${slug}`;
}

function normalize(game) {
  const { startDate, endDate } = promoWindow(game);
  const total = game.price?.totalPrice ?? {};
  return {
    id: game.id,
    title: game.title,
    description: game.description || '',
    image: pickImage(game, 'OfferImageWide') || pickImage(game, 'OfferImageTall'),
    thumb: pickImage(game, 'Thumbnail') || pickImage(game, 'OfferImageTall'),
    url: storeUrl(game),
    startDate,
    endDate,
    originalPrice: total.fmtPrice?.originalPrice || null,
    seller: game.seller?.name || null,
    offerType: game.offerType,
  };
}

async function fetchGames(force = false) {
  if (!force && cache.data && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return { ...cache.data, cached: true, fetchedAt: cache.fetchedAt };
  }
  if (inflight) return inflight.then(data => ({ ...data, cached: true, fetchedAt: cache.fetchedAt }));

  inflight = epic.getGames();
  try {
    const res = await inflight;
    cache = {
      data: {
        currentGames: res.currentGames.map(normalize),
        nextGames: res.nextGames.map(normalize),
      },
      fetchedAt: Date.now(),
    };
    return { ...cache.data, cached: false, fetchedAt: cache.fetchedAt };
  } finally {
    inflight = null;
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/games', async (req, res) => {
  try {
    const data = await fetchGames(req.query.refresh === '1');
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, country: COUNTRY, locale: LOCALE, ...data });
  } catch (err) {
    console.error('[api/games]', err.message);
    if (cache.data) {
      return res.json({ ok: true, stale: true, country: COUNTRY, locale: LOCALE, ...cache.data, cached: true, fetchedAt: cache.fetchedAt });
    }
    res.status(502).json({ ok: false, error: 'Falha ao consultar a Epic Games Store.' });
  }
});

app.listen(PORT, () => {
  console.log(`Epic Free Games rodando em http://localhost:${PORT} (${COUNTRY}/${LOCALE})`);
});
