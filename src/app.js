const API_BASE = "https://feefomit-chizhick-deb9.twc1.net"; // backend FastAPI

const $ = (id) => document.getElementById(id);

const POPULAR_CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Нижний Новгород",
  "Ростов-на-Дону",
  "Краснодар",
];

const storage = {
  getCity() {
    try { return JSON.parse(localStorage.getItem("city") || "null"); }
    catch { return null; }
  },
  setCity(city) {
    localStorage.setItem("city", JSON.stringify(city));
  },
};

const state = {
  city: null,          // { id: fias_id(UUID), name }
  tree: null,
  mainCats: [],
  selectedCat: null,
  page: 1,
  mode: "promo",       // promo | category | search
  search: "",
  promoCatId: null,
  loading: false,
};

async function api(path) {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t || r.statusText}`);
  }
  return r.json();
}

function setCityUI() {
  if ($("cityName")) $("cityName").textContent = state.city ? state.city.name : "Выберите город";
  if ($("catHint")) $("catHint").textContent = state.city ? `Категории для: ${state.city.name}` : "Выберите город";
}

function openModal() { if ($("cityModal")) $("cityModal").hidden = false; }
function closeModal() { if ($("cityModal")) $("cityModal").hidden = true; }

function rub(x) {
  if (x == null) return "—";
  return `${Math.round(Number(x))} ₽`;
}

function discountPct(price, oldPrice) {
  if (price == null || oldPrice == null) return null;
  const p = Number(price), o = Number(oldPrice);
  if (!Number.isFinite(p) || !Number.isFinite(o)) return null;
  if (o <= p) return null;
  return Math.round((1 - p / o) * 100);
}

function productImage(p) {
  return p?.images?.length ? (p.images[0]?.image || null) : null;
}

function flattenTree(tree) {
  const out = [];
  const walk = (arr) => {
    (arr || []).forEach((x) => {
      out.push(x);
      if (x.children && x.children.length) walk(x.children);
    });
  };
  walk(tree || []);
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
        <span class="badge">${pct ? `-${pct}%` : (p.is_inout ? "НАДО УСПЕТЬ" : "Акция")}</span>
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
        <div class="card__meta muted">
          ${p.price_piece_unit ? `${p.price_piece_unit} • ` : ""}id: ${p.id}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function filterDiscounts(items) {
  return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
}

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
  if (!state.city) return;
  const tree = await api(`/public/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`);
  state.tree = tree;
  state.mainCats = extractMainCats(tree);
  renderCategories(state.mainCats.slice(0, 24));
}

function findPromoCategoryId(tree) {
  const all = flattenTree(tree);
  const inout = all.find((c) => c.is_inout === true);
  if (inout) return inout.id;

  // Если нет is_inout, берем первую “основную” категорию
  const main = extractMainCats(tree);
  return main.length ? main[0].id : null;
}

async function fetchProducts({ cityId, categoryId, page = 1, search = "" }) {
  const params = new URLSearchParams();
  params.set("city_id", cityId);
  params.set("page", String(page));
  if (categoryId != null) params.set("category_id", String(categoryId));
  if (search) params.set("search", search);
  return api(`/public/catalog/products?${params.toString()}`);
}

async function loadPromo(reset = true) {
  if (!state.city || !state.tree) return;
  state.mode = "promo";
  if (reset) state.page = 1;

  if (!state.promoCatId) state.promoCatId = findPromoCategoryId(state.tree);
  if (!state.promoCatId) {
    $("prodHint").textContent = "Не нашёл категорию для скидок.";
    return;
  }

  $("prodHint").textContent = "Загружаю…";
  const data = await fetchProducts({
    cityId: state.city.id,
    categoryId: state.promoCatId,
    page: state.page,
  });

  const items = data.items || [];
  const discounted = filterDiscounts(items);

  // Если скидки не размечены old_price — показываем просто “акционные”
  const list = discounted.length ? discounted : items;

  renderProducts(list.slice(0, 24), !reset);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;

  $("prodHint").textContent = discounted.length
    ? "Товары со скидками"
    : "Товары (скидки могут быть без old_price)";
}

async function selectCategory(cat) {
  if (!state.city) return;
  state.selectedCat = cat;
  state.mode = "category";
  state.search = "";
  state.page = 1;

  $("prodHint").textContent = `Категория: ${cat.name}`;

  const data = await fetchProducts({
    cityId: state.city.id,
    categoryId: cat.id,
    page: state.page,
  });

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  renderProducts((discounted.length ? discounted : items).slice(0, 24), false);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function doSearch(reset = true) {
  if (!state.city) return;
  const q = ($("q")?.value || "").trim();

  if (!q) {
    state.search = "";
    return loadPromo(true);
  }

  state.mode = "search";
  state.search = q;
  state.selectedCat = null;
  if (reset) state.page = 1;

  $("prodHint").textContent = `Поиск: ${q}`;

  const data = await fetchProducts({
    cityId: state.city.id,
    categoryId: null,
    page: state.page,
    search: q,
  });

  const items = data.items || [];
  const discounted = filterDiscounts(items);
  renderProducts((discounted.length ? discounted : items).slice(0, 24), !reset);

  const more = $("moreBtn");
  if (more) more.hidden = !data.next;
}

async function loadMore() {
  if (state.loading) return;
  state.loading = true;

  try {
    state.page += 1;

    if (state.mode === "promo") {
      await loadPromo(false);
      return;
    }

    if (state.mode === "category" && state.selectedCat) {
      const data = await fetchProducts({
        cityId: state.city.id,
        categoryId: state.selectedCat.id,
        page: state.page,
      });
      const items = data.items || [];
      const discounted = filterDiscounts(items);
      renderProducts((discounted.length ? discounted : items).slice(0, 24), true);
      $("moreBtn").hidden = !data.next;
      return;
    }

    if (state.mode === "search") {
      await doSearch(false);
      return;
    }
  } catch (e) {
    console.error(e);
    $("prodHint").textContent = `Ошибка загрузки: ${e.message || e}`;
  } finally {
    state.loading = false;
  }
}

async function searchCities() {
  const q = ($("cityQuery")?.value || "").trim();
  if (!q) return;

  const data = await api(`/public/geo/cities?search=${encodeURIComponent(q)}&page=1`);
  const items = data.items || [];
  const list = $("cityList");
  list.innerHTML = "";

  items.forEach((c) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = c.name + (c.has_shop ? "" : " (нет магазинов)");
    div.onclick = async () => {
      if (!c.fias_id) return;
      await selectCity({ id: c.fias_id, name: c.name });
      closeModal();
    };
    list.appendChild(div);
  });
}

async function findAndSelectCity(name) {
  const data = await api(`/public/geo/cities?search=${encodeURIComponent(name)}&page=1`);
  const items = data.items || [];
  const best = items.find((x) => x.has_shop) || items[0];
  if (!best?.fias_id) throw new Error("Город не найден");
  await selectCity({ id: best.fias_id, name: best.name });
}

async function selectCity(city) {
  state.city = city;
  state.tree = null;
  state.mainCats = [];
  state.selectedCat = null;
  state.page = 1;
  state.mode = "promo";
  state.search = "";
  state.promoCatId = null;

  storage.setCity(city);
  setCityUI();

  await loadOffersBanner();
  await loadTree();
  await loadPromo(true);
}

function renderPopularChips() {
  const box = $("popularCities");
  box.innerHTML = "";
  POPULAR_CITIES.forEach((name) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = name;
    b.onclick = async () => { await findAndSelectCity(name); closeModal(); };
    box.appendChild(b);
  });
}

function renderCitiesGrid() {
  const box = $("citiesGrid");
  box.innerHTML = "";
  POPULAR_CITIES.forEach((name) => {
    const t = document.createElement("div");
    t.className = "cityTile";
    t.innerHTML = `<div><b>${name}</b></div><div class="muted">Нажмите, чтобы выбрать</div>`;
    t.onclick = async () => {
      await findAndSelectCity(name);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    box.appendChild(t);
  });
}

function wireUI() {
  $("year").textContent = String(new Date().getFullYear());

  $("cityBtn").onclick = openModal;
  $("cityClose").onclick = closeModal;
  $("citySearchBtn").onclick = () => searchCities().catch(console.error);

  $("searchBtn").onclick = () => doSearch(true).catch(console.error);
  $("moreBtn").onclick = () => loadMore().catch(console.error);

  $("cityQuery").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("citySearchBtn").click();
  });

  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("searchBtn").click();
  });
}

async function init() {
  wireUI();
  renderPopularChips();
  renderCitiesGrid();

  const saved = storage.getCity();
  if (saved?.id && saved?.name) {
    await selectCity(saved);
  } else {
    await findAndSelectCity("Москва");
  }
}

init().catch((e) => {
  console.error(e);
  $("prodHint").textContent = "Ошибка загрузки. Проверь API_BASE и доступность /public/*";
});
