/* =========================
   CONFIG
========================= */

const API_BASE = "https://feefomit-chizhick-deb9.twc1.net";
const API_PREFIX = "/api";

// Москва (UUID из твоих запросов)
const DEFAULT_CITY = {
  id: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
  name: "Москва",
};

// Популярные города (для быстрых кнопок)
const POPULAR_CITIES = ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск", "Нижний Новгород"];

/* =========================
   UTILS
========================= */

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function isUUID(v) {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function rub(x) {
  if (x == null) return "—";
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)} ₽`;
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

// Основные категории (как на едадиле — плитки верхнего уровня)
// В ответах Чижика обычно depth=2 — это “крупные разделы”
function extractMainCats(tree) {
  const all = flattenTree(tree);
  const main = all.filter((c) => c && c.depth === 2);
  const seen = new Set();
  return main.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

function pickCatImage(cat) {
  return cat?.image || cat?.icon || null;
}

function filterDiscounts(items) {
  return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
}

/* =========================
   LOCAL STORAGE
========================= */

const storage = {
  getCity() {
    try { return JSON.parse(localStorage.getItem("city") || "null"); } catch { return null; }
  },
  setCity(city) {
    localStorage.setItem("city", JSON.stringify(city));
  },
  clearCity() {
    localStorage.removeItem("city");
  },

  // простейший кэш дерева на фронте (чтобы не дергать API лишний раз)
  getTree(cityId) {
    try {
      const raw = localStorage.getItem(`tree:${cityId}`);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || !obj.data) return null;
      // 12 часов
      if (Date.now() - obj.ts > 12 * 60 * 60 * 1000) return null;
      return obj.data;
    } catch { return null; }
  },
  setTree(cityId, data) {
    try {
      localStorage.setItem(`tree:${cityId}`, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  },
};

/* =========================
   API
========================= */

async function api(path, { retries = 25, timeoutMs = 12000 } = {}) {
  const url = `${API_BASE}${API_PREFIX}${path}`;

  for (let i = 1; i <= retries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const r = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);

      // ok
      if (r.ok) {
        // иногда прокси может вернуть html/js — на всякий случай проверим
        const ct = (r.headers.get("content-type") || "").toLowerCase();
        if (!ct.includes("application/json")) {
          const txt = await r.text().catch(() => "");
          throw new Error(`Неверный ответ от API (ожидался JSON). content-type=${ct}. Начало: ${txt.slice(0, 80)}`);
        }
        return r.json();
      }

      // warming / background fill
      if (r.status === 503) {
        await sleep(1200);
        continue;
      }

      const t = await r.text().catch(() => "");
      throw new Error(`${r.status} ${t || r.statusText}`);
    } catch (e) {
      clearTimeout(timer);
      // сети/abort — чуть подождем и повторим
      await sleep(i < 5 ? 600 : 1200);
    }
  }

  throw new Error("API слишком долго не отвечает (таймаут/прогрев)");
}

/* =========================
   RENDER
========================= */

function renderPopularCities() {
  const box = $("cities");
  if (!box) return;

  box.innerHTML = "";
  POPULAR_CITIES.forEach((name) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = name;
    b.onclick = () => findAndSelectCity(name);
    box.appendChild(b);
  });
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
    box.innerHTML = `<div class="muted">Категории пустые (API вернул дерево без depth=2). Можно поправить фильтр.</div>`;
  }
}

function renderProducts(items, append = false) {
  const grid = $("products");
  if (!grid) return;
  if (!append) grid.innerHTML = "";

  (items || []).forEach((p) => {
    const img = productImage(p);
    const pct = discountPct(p.price, p.old_price);
    const badgeText = pct ? `-${pct}%` : (p.is_inout ? "НАДО УСПЕТЬ" : "Товар");

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card__top">
        <span class="badge">${badgeText}</span>
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
      </div>
    `;
    grid.appendChild(card);
  });

  if ((!items || !items.length) && !append) {
    grid.innerHTML = `<div class="muted">Товары не найдены.</div>`;
  }
}

/* =========================
   STATE
========================= */

const state = {
  city: null,
  tree: null,
  mainCats: [],
  selectedCat: null,
  promoCatId: null,
  page: 1,
  mode: "promo", // promo | category
};

/* =========================
   LOADERS
========================= */

async function loadOffersBanner() {
  const box = $("offersBox");
  if (!box) return;

  try {
    const offers = await api("/offers/active");
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

  // пробуем кэш фронта
  const cached = storage.getTree(state.city.id);
  if (cached) {
    state.tree = cached;
    state.mainCats = extractMainCats(cached);
    renderCategories(state.mainCats.slice(0, 24));
    setText("catHint", `Категории для: ${state.city.name} (получено: ${state.mainCats.length})`);
    return;
  }

  const tree = await api(`/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`);
  state.tree = tree;
  storage.setTree(state.city.id, tree);

  state.mainCats = extractMainCats(tree);
  renderCategories(state.mainCats.slice(0, 24));
  setText("catHint", `Категории для: ${state.city.name} (получено: ${state.mainCats.length})`);
}

function findPromoCategoryId(tree) {
  const all = flattenTree(tree);
  const inout = all.find((c) => c && c.is_inout === true);
  if (inout) return inout.id;
  const main = extractMainCats(tree);
  return main.length ? main[0].id : null;
}

async function loadPromo(reset = true) {
  if (!state.tree) return;
  if (reset) state.page = 1;
  state.mode = "promo";

  if (!state.promoCatId) state.promoCatId = findPromoCategoryId(state.tree);
  if (!state.promoCatId) {
    setText("prodHint", "Не удалось выбрать категорию для товаров.");
    return;
  }

  setText("prodHint", "Загружаю товары…");
  const data = await api(
    `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${state.promoCatId}&page=${state.page}`
  );

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  const list = (discounted.length ? discounted : items).slice(0, 24);

  renderProducts(list, !reset);
  setText("prodHint", list.length ? `Товары со скидками: ${list.length}` : "Пока нет товаров.");

  const more = $("moreBtn");
  if (more) {
    more.hidden = !data.next;
    more.onclick = async () => {
      state.page += 1;
      await loadPromo(false);
    };
  }
}

async function selectCategory(cat) {
  state.selectedCat = cat;
  state.mode = "category";
  state.page = 1;

  setText("prodHint", `Категория: ${cat.name} — загружаю…`);
  const data = await api(
    `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${cat.id}&page=${state.page}`
  );

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  const list = (discounted.length ? discounted : items).slice(0, 24);

  renderProducts(list, false);
  setText("prodHint", list.length ? `Товары: ${list.length}` : "В этой категории пока пусто.");

  const more = $("moreBtn");
  if (more) {
    more.hidden = !data.next;
    more.onclick = async () => {
      state.page += 1;
      const data2 = await api(
        `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${cat.id}&page=${state.page}`
      );
      const items2 = data2.items || [];
      const discounted2 = filterDiscounts(items2);
      const list2 = (discounted2.length ? discounted2 : items2).slice(0, 24);
      renderProducts(list2, true);
      more.hidden = !data2.next;
    };
  }
}

/* =========================
   CITY SELECT
========================= */

async function findAndSelectCity(name) {
  try {
    setText("citiesHint", "Ищу город…");
    const r = await api(`/geo/cities?search=${encodeURIComponent(name)}&page=1`, { retries: 10, timeoutMs: 8000 });
    const items = r.items || r || [];
    const best = (items || []).find((x) => x.has_shop) || (items || [])[0];

    if (!best) {
      setText("citiesHint", "Город не найден.");
      return;
    }

    const city = { id: best.fias_id, name: best.name };
    if (!isUUID(city.id)) {
      setText("citiesHint", "Найденный город без UUID (ошибка данных).");
      return;
    }

    state.city = city;
    storage.setCity(city);
    $("cityName") && ($("cityName").textContent = city.name);

    // сброс
    state.tree = null;
    state.mainCats = [];
    state.selectedCat = null;
    state.promoCatId = null;
    state.page = 1;

    // загрузка
    await loadTree();
    await loadPromo(true);

    setText("citiesHint", "");
  } catch (e) {
    console.error(e);
    setText("citiesHint", `Ошибка выбора города: ${e.message || e}`);
  }
}

/* =========================
   INIT
========================= */

async function init() {
  $("year") && ($("year").textContent = String(new Date().getFullYear()));

  // город из localStorage или Москва
  const saved = storage.getCity();
  if (saved?.id && saved?.name && isUUID(saved.id)) {
    state.city = saved;
  } else {
    storage.clearCity();
    state.city = DEFAULT_CITY;
    storage.setCity(DEFAULT_CITY);
  }

  $("cityName") && ($("cityName").textContent = state.city.name);

  // кнопки городов (если есть контейнер)
  renderPopularCities();

  // поиск города (если есть элементы)
  const cityInput = $("cityInput");
  const cityBtn = $("cityBtn");
  if (cityInput && cityBtn) {
    cityBtn.onclick = () => {
      const v = (cityInput.value || "").trim();
      if (v) findAndSelectCity(v);
    };
    cityInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") cityBtn.click();
    });
  }

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
    setText("prodHint", "Ошибка загрузки. Проверь API_BASE и /api/*");
  });
});
