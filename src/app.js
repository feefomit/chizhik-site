const API_BASE = "https://feefomit-chizhick-deb9.twc1.net";

// Москва (UUID из твоих запросов)
const DEFAULT_CITY = {
  id: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
  name: "Москва",
};

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const storage = {
  getCity() {
    try { return JSON.parse(localStorage.getItem("city") || "null"); } catch { return null; }
  },
  setCity(city) { localStorage.setItem("city", JSON.stringify(city)); },
  clearCity() { localStorage.removeItem("city"); },
};

function isUUID(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

async function api(path, { retries = 15 } = {}) {
  const url = `${API_BASE}${path}`;
  for (let i = 1; i <= retries; i++) {
    let r;
    try {
      r = await fetch(url);
    } catch (e) {
      if (i < 3) { await sleep(500); continue; }
      throw e;
    }

    if (r.ok) return r.json();

    // если бекенд прогревает браузер/источник — он может отдавать 503
    if (r.status === 503) {
      await sleep(1200);
      continue;
    }

    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t || r.statusText}`);
  }
  throw new Error("API not ready (503 too long)");
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function rub(x) {
  if (x == null) return "—";
  return `${Math.round(Number(x))} ₽`;
}

function productImage(p) {
  return p?.images?.length ? (p.images[0]?.image || null) : null;
}

function discountPct(price, oldPrice) {
  if (price == null || oldPrice == null) return null;
  const p = Number(price), o = Number(oldPrice);
  if (!Number.isFinite(p) || !Number.isFinite(o) || o <= p) return null;
  return Math.round((1 - p / o) * 100);
}

function flattenTree(tree) {
  const out = [];
  const walk = (arr) => {
    (arr || []).forEach((x) => {
      out.push(x);
      if (x.children && x.children.length) walk(x.children);
    });
  };
  if (Array.isArray(tree)) walk(tree);
  return out;
}

function extractMainCats(tree) {
  const all = flattenTree(tree);
  const main = all.filter((c) => c.depth === 2);
  const seen = new Set();
  return main.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

function pickCatImage(cat) {
  return cat.image || cat.icon || null;
}

function renderCategories(cats) {
  const box = $("cats");
  if (!box) return;
  box.innerHTML = "";

  (cats || []).forEach((cat) => {
    const img = pickCatImage(cat);
    const tile = document.createElement("div");
    tile.className = "cat";
    tile.innerHTML = `
      <div class="cat__img">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="cat__ph">🛒</div>`}
      </div>
      <div class="cat__body">
        <div class="cat__name">${cat.name}</div>
        <div class="cat__sub">Открыть</div>
      </div>
    `;
    tile.onclick = () => selectCategory(cat);
    box.appendChild(tile);
  });

  if (!cats || !cats.length) {
    box.innerHTML = `<div class="muted">Категории пустые. Проверь ответ /public/catalog/tree</div>`;
  }
}

function renderProducts(items, append = false) {
  const grid = $("products");
  if (!grid) return;
  if (!append) grid.innerHTML = "";

  (items || []).forEach((p) => {
    const img = productImage(p);
    const pct = discountPct(p.price, p.old_price);
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card__top">
        <span class="badge">${pct ? `-${pct}%` : (p.is_inout ? "НАДО УСПЕТЬ" : "Товар")}</span>
        <div class="price">
          <span class="price__new">${rub(p.price)}</span>
          ${p.old_price != null ? `<span class="price__old">${rub(p.old_price)}</span>` : ""}
        </div>
      </div>
      <div class="card__img">
        ${img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="imgph">🧺</div>`}
      </div>
      <div class="card__body">
        <div class="card__name">${p.title}</div>
        <div class="card__meta muted">id: ${p.id}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  if ((!items || !items.length) && !append) {
    grid.innerHTML = `<div class="muted">Товары не найдены.</div>`;
  }
}

const state = {
  city: null,
  tree: null,
  mainCats: [],
  selectedCat: null,
  promoCatId: null,
  page: 1,
  mode: "promo",
};

async function loadOffersBanner() {
  const box = $("offersBox");
  if (!box) return;
  try {
    const offers = await api("/public/offers/active");
    const bg = offers.background || "";
    const img = offers.image || "";
    const logo = offers.logo || "";
    const title = offers.title || "Акции";
    const desc = (offers.description || "").replaceAll("\r\n", "\n");
    const titleColor = offers.title_color || "#111827";

    box.innerHTML = `
      <div style="border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(17,24,39,.08);">
        <div style="padding:14px;background-image:url('${bg}');background-size:cover;background-position:center;">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            ${logo ? `<img src="${logo}" alt="" style="height:34px">` : ""}
            <div style="font-weight:900;font-size:18px;color:${titleColor}">${title}</div>
          </div>
          <div style="margin-top:6px;white-space:pre-line;color:${titleColor};opacity:.9">${desc}</div>
        </div>
        ${img ? `<div style="background:#fff;padding:10px;display:flex;justify-content:center;">
                  <img src="${img}" alt="" style="max-height:190px;max-width:100%;object-fit:contain;">
                </div>` : ""}
      </div>
    `;
  } catch {
    box.innerHTML = "";
  }
}

async function loadTree() {
  setText("catHint", "Загружаю категории…");
  const tree = await api(`/public/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`);
  state.tree = tree;
  state.mainCats = extractMainCats(tree);
  renderCategories(state.mainCats.slice(0, 24));
  setText("catHint", `Категории для: ${state.city.name} (получено: ${state.mainCats.length})`);
}

function findPromoCategoryId(tree) {
  const all = flattenTree(tree);
  const inout = all.find((c) => c.is_inout === true);
  if (inout) return inout.id;
  const main = extractMainCats(tree);
  return main.length ? main[0].id : null;
}

function filterDiscounts(items) {
  return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
}

async function loadPromo(reset = true) {
  if (!state.tree) return;
  if (reset) state.page = 1;
  state.mode = "promo";

  if (!state.promoCatId) state.promoCatId = findPromoCategoryId(state.tree);
  if (!state.promoCatId) {
    setText("prodHint", "Не нашёл категорию для товаров.");
    return;
  }

  setText("prodHint", "Загружаю товары…");
  const data = await api(
    `/public/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${state.promoCatId}&page=${state.page}`
  );

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  const list = discounted.length ? discounted : items;

  renderProducts(list.slice(0, 24), !reset);
  setText("prodHint", `Товары: ${list.length ? "загружено" : "пусто"} (страница ${state.page})`);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function selectCategory(cat) {
  state.selectedCat = cat;
  state.mode = "category";
  state.page = 1;

  setText("prodHint", `Категория: ${cat.name}`);
  const data = await api(
    `/public/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${cat.id}&page=${state.page}`
  );

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  renderProducts((discounted.length ? discounted : items).slice(0, 24), false);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function init() {
  $("year") && ($("year").textContent = String(new Date().getFullYear()));

  // если сохранён старый slug — очищаем
  const saved = storage.getCity();
  if (saved?.id && saved?.name && isUUID(saved.id)) {
    state.city = saved;
  } else {
    storage.clearCity();
    state.city = DEFAULT_CITY;
    storage.setCity(DEFAULT_CITY);
  }

  $("cityName") && ($("cityName").textContent = state.city.name);

  // Важно: сразу грузим дерево и товары, без geo/cities
  try {
    await loadOffersBanner();
    await loadTree();
    await loadPromo(true);
  } catch (e) {
    console.error(e);
    setText("catHint", `Ошибка категорий: ${e.message || e}`);
    setText("prodHint", `Ошибка товаров: ${e.message || e}`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((e) => {
    console.error(e);
    setText("catHint", "Ошибка инициализации");
    setText("prodHint", "Ошибка загрузки. Проверь API_BASE и /public/*");
  });
});
