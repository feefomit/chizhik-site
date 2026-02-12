const API_BASE = "https://feefomit-chizhick-deb9.twc1.net";
const API_PREFIX = "/api";

// Москва (UUID)
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

async function api(path, { retries = 12, timeoutMs = 20000 } = {}) {
  const url = `${API_BASE}${API_PREFIX}${path}`;

  for (let i = 1; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const r = await fetch(url, { signal: ctrl.signal });

      clearTimeout(t);

      if (r.ok) return r.json();

      // прогрев / upstream проблемы — ждём и пробуем ещё
      if (r.status === 503) {
        await sleep(1200);
        continue;
      }

      const txt = await r.text().catch(() => "");
      throw new Error(`${r.status} ${txt || r.statusText}`);

    } catch (e) {
      clearTimeout(t);
      // сетевые/таймаут — несколько быстрых повторов
      if (i < 3) { await sleep(600); continue; }
      throw e;
    }
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

function filterDiscounts(items) {
  return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
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
    box.innerHTML = `<div class="muted">Категории пустые. Проверь /api/catalog/tree</div>`;
  }
}

function renderProducts(items, append = false, title = "") {
  const grid = $("products");
  if (!grid) return;

  if (!append) {
    grid.innerHTML = "";
    if (title) setText("prodHint", title);
  }

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
      </div>
    `;

    grid.appendChild(card);
  });

  if ((!items || !items.length) && !append) {
    grid.innerHTML = `<div class="muted">Товары не найдены.</div>`;
  }
}

// ---------- UI: city picker ----------
function ensureCityModal() {
  if ($("cityModal")) return;

  const modal = document.createElement("div");
  modal.id = "cityModal";
  modal.style.cssText = `
    position:fixed;inset:0;display:none;align-items:center;justify-content:center;
    background:rgba(17,24,39,.55);z-index:9999;padding:16px;
  `;

  modal.innerHTML = `
    <div style="width:min(640px,100%);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;">
      <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
        <div style="font-weight:800;">Выбор города</div>
        <button id="cityClose" style="border:0;background:#f3f4f6;border-radius:10px;padding:8px 10px;cursor:pointer;">✕</button>
      </div>
      <div style="padding:14px 16px;">
        <input id="cityInput" placeholder="Начни писать: Москва, Казань..." style="width:100%;padding:12px 12px;border:1px solid #e5e7eb;border-radius:12px;outline:none;">
        <div id="cityHint" class="muted" style="margin-top:10px;">Введите минимум 2 буквы</div>
        <div id="cityList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px;"></div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid #e5e7eb;display:flex;gap:8px;flex-wrap:wrap;">
        ${["Москва","Санкт-Петербург","Казань","Екатеринбург","Новосибирск","Нижний Новгород"].map(n => `
          <button class="cityQuick" data-name="${n}"
            style="border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;">
            ${n}
          </button>
        `).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  $("cityClose").onclick = () => (modal.style.display = "none");

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // quick buttons
  modal.querySelectorAll(".cityQuick").forEach((b) => {
    b.addEventListener("click", async () => {
      const name = b.getAttribute("data-name");
      await findAndSelectCity(name);
    });
  });

  // input
  let timer = null;
  $("cityInput").addEventListener("input", () => {
    clearTimeout(timer);
    const q = $("cityInput").value.trim();
    timer = setTimeout(() => {
      if (q.length < 2) {
        $("cityHint").textContent = "Введите минимум 2 буквы";
        $("cityList").innerHTML = "";
        return;
      }
      findCities(q).catch(console.error);
    }, 250);
  });
}

async function findCities(q) {
  $("cityHint").textContent = "Ищу…";
  const data = await api(`/geo/cities?search=${encodeURIComponent(q)}&page=1`);
  const items = data.items || [];
  const list = $("cityList");
  list.innerHTML = "";

  if (!items.length) {
    $("cityHint").textContent = "Не найдено";
    return;
  }

  $("cityHint").textContent = `Найдено: ${items.length}`;
  items.slice(0, 10).forEach((c) => {
    const btn = document.createElement("button");
    btn.style.cssText = "text-align:left;border:1px solid #e5e7eb;background:#fff;border-radius:12px;padding:10px 12px;cursor:pointer;";
    btn.innerHTML = `<div style="font-weight:700;">${c.name}</div><div class="muted" style="font-size:12px;">${c.slug}</div>`;
    btn.onclick = async () => {
      const city = { id: c.fias_id, name: c.name };
      await applyCity(city);
      $("cityModal").style.display = "none";
    };
    list.appendChild(btn);
  });
}

async function findAndSelectCity(name) {
  $("cityHint").textContent = "Ищу…";
  $("cityInput").value = name;
  const data = await api(`/geo/cities?search=${encodeURIComponent(name)}&page=1`);
  const c = (data.items || [])[0];
  if (!c) {
    $("cityHint").textContent = "Не найдено";
    return;
  }
  await applyCity({ id: c.fias_id, name: c.name });
  $("cityModal").style.display = "none";
}

async function applyCity(city) {
  state.city = city;
  storage.setCity(city);
  $("cityName") && ($("cityName").textContent = city.name);

  // перезагрузка дерева + промо
  state.tree = null;
  state.mainCats = [];
  state.selectedCat = null;
  state.promoCatId = null;
  state.page = 1;

  await loadTree();
  await loadPromo(true);
}

// ---------- state ----------
const state = {
  city: null,
  tree: null,
  mainCats: [],
  selectedCat: null,
  promoCatId: null,
  page: 1,
  mode: "promo",
};

// ---------- data loaders ----------
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
  const tree = await api(`/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`);
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

async function loadProductsByCategoryId(categoryId, page) {
  return api(`/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${categoryId}&page=${page}`);
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
  const data = await loadProductsByCategoryId(state.promoCatId, state.page);

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  const list = discounted.length ? discounted : items;

  const title = discounted.length ? "Товары со скидками" : "Подборка товаров";
  renderProducts(list.slice(0, 24), !reset, title);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function selectCategory(cat) {
  state.selectedCat = cat;
  state.mode = "category";
  state.page = 1;

  setText("prodHint", `Категория: ${cat.name} — загружаю…`);

  // пробуем саму категорию
  let data = await loadProductsByCategoryId(cat.id, state.page);

  // если пусто и есть дети — пробуем первого ребёнка (часто товары лежат на depth=3)
  if ((!data.items || !data.items.length) && cat.children && cat.children.length) {
    data = await loadProductsByCategoryId(cat.children[0].id, state.page);
  }

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  const list = discounted.length ? discounted : items;

  renderProducts(list.slice(0, 24), false, discounted.length ? `Скидки: ${cat.name}` : `Товары: ${cat.name}`);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function loadMore() {
  if (state.mode === "promo") {
    state.page += 1;
    await loadPromo(false);
    return;
  }
  if (state.mode === "category" && state.selectedCat) {
    state.page += 1;
    const cat = state.selectedCat;

    let data = await loadProductsByCategoryId(cat.id, state.page);
    if ((!data.items || !data.items.length) && cat.children && cat.children.length) {
      data = await loadProductsByCategoryId(cat.children[0].id, state.page);
    }

    const items = data.items || [];
    const discounted = filterDiscounts(items);
    renderProducts((discounted.length ? discounted : items).slice(0, 24), true);

    const more = $("moreBtn");
    if (more) more.hidden = !data.next;
  }
}

// ---------- init ----------
async function init() {
  $("year") && ($("year").textContent = String(new Date().getFullYear()));

  // город из localStorage или дефолт
  const saved = storage.getCity();
  if (saved?.id && saved?.name && isUUID(saved.id)) {
    state.city = saved;
  } else {
    storage.clearCity();
    state.city = DEFAULT_CITY;
    storage.setCity(DEFAULT_CITY);
  }

  $("cityName") && ($("cityName").textContent = state.city.name);

  // кнопка смены города (если есть)
  if ($("cityBtn")) {
    ensureCityModal();
    $("cityBtn").onclick = () => {
      $("cityModal").style.display = "flex";
      $("cityInput").focus();
    };
  } else {
    // если нет кнопки — всё равно создадим модалку, вдруг добавишь позже
    ensureCityModal();
  }

  // Кнопка "Показать ещё"
  if ($("moreBtn")) {
    $("moreBtn").onclick = () => loadMore().catch(console.error);
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
