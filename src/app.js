/* src/app.js
   Frontend for Cenopad / Chizhik скидки.
   Требует, чтобы в index.html были элементы с id:
   cityBtn, cityName, cityModal, cityClose, cityQuery, citySearchBtn, popularCities, cityList,
   cats, catHint, prodHint, products, moreBtn, q, searchBtn, citiesGrid, year,
   offersBox (если есть) — опционально
*/

const API_BASE = "https://feefomit-chizhick-deb9.twc1.net"; // <-- твой backend (FastAPI)

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
    try {
      return JSON.parse(localStorage.getItem("city") || "null");
    } catch {
      return null;
    }
  },
  setCity(city) {
    localStorage.setItem("city", JSON.stringify(city));
  },
};

const state = {
  city: null,            // { id: fias_id(UUID), name }
  tree: null,            // полный tree
  mainCats: [],          // depth==2
  selectedCat: null,     // { id, name }
  mode: "promo",         // promo | category | search
  search: "",
  page: 1,
  sourceCatId: null,     // откуда грузим скидки (category id)
  loading: false,
};

async function api(path) {
  const r = await fetch(`${API_BASE}${path}`, { method: "GET" });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${txt || r.statusText}`);
  }
  return r.json();
}

function showHint(text) {
  const el = $("prodHint");
  if (el) el.textContent = text || "";
}

function showCatHint(text) {
  const el = $("catHint");
  if (el) el.textContent = text || "";
}

function setCityUI() {
  if ($("cityName")) $("cityName").textContent = state.city ? state.city.name : "Выберите город";
  showCatHint(state.city ? `Категории для: ${state.city.name}` : "Выберите город");
}

function openCityModal() {
  if ($("cityModal")) $("cityModal").hidden = false;
}
function closeCityModal() {
  if ($("cityModal")) $("cityModal").hidden = true;
}

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
  const img = p?.images?.length ? p.images[0]?.image : null;
  return img || null;
}

function pickCatImage(cat) {
  return cat.image || cat.icon || null;
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

function extractMainCategories(tree) {
  // В дереве обычно есть depth=1 ("Основной каталог") с детьми depth=2.
  // Берём все depth=2 в любой ветке.
  const all = flattenTree(tree);
  const main = all.filter((c) => c.depth === 2);
  // Уберём дубли по id (на всякий)
  const seen = new Set();
  return main.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
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
        ${img ? `<img src="${img}" alt="" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">`
             : `<div class="cat__ph">🛒</div>`}
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
        <span class="badge">${pct ? `-${pct}%` : (p.is_inout ? "НАДО УСПЕТЬ" : "Товар")}</span>
        <div class="price">
          <span class="price__new">${rub(p.price)}</span>
          ${p.old_price != null ? `<span class="price__old">${rub(p.old_price)}</span>` : ""}
        </div>
      </div>
      <div class="card__img" style="height:150px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;">
        ${img ? `<img src="${img}" alt="" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">`
             : `<div style="font-size:32px;color:#9ca3af;">🧺</div>`}
      </div>
      <div class="card__body">
        <div class="card__name">${p.title}</div>
        <div class="card__meta muted">id: ${p.id}${p.price_piece_unit ? ` • ${p.price_piece_unit}` : ""}</div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function renderPopularChips() {
  const box = $("popularCities");
  if (!box) return;
  box.innerHTML = "";
  POPULAR_CITIES.forEach((name) => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = name;
    b.onclick = async () => {
      await findAndSelectCity(name);
      closeCityModal();
    };
    box.appendChild(b);
  });
}

function renderCitiesGrid() {
  const box = $("citiesGrid");
  if (!box) return;
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

async function searchCities() {
  const q = $("cityQuery")?.value?.trim();
  if (!q) return;

  const data = await api(`/public/geo/cities?search=${encodeURIComponent(q)}&page=1`);
  const items = data.items || [];
  const list = $("cityList");
  if (!list) return;

  list.innerHTML = "";
  items.forEach((c) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = `${c.name}`;
    div.onclick = async () => {
      // city_id для каталога — это fias_id (UUID)
      await selectCity({ id: c.fias_id, name: c.name });
      closeCityModal();
    };
    list.appendChild(div);
  });
}

async function findAndSelectCity(name) {
  const data = await api(`/public/geo/cities?search=${encodeURIComponent(name)}&page=1`);
  const items = data.items || [];
  const best = items.find((x) => x.has_shop) || items[0];
  if (!best) throw new Error("Город не найден");
  await selectCity({ id: best.fias_id, name: best.name });
}

async function selectCity(city) {
  state.city = city;
  state.tree = null;
  state.mainCats = [];
  state.selectedCat = null;
  state.mode = "promo";
  state.search = "";
  state.page = 1;
  state.sourceCatId = null;

  storage.setCity(city);
  setCityUI();

  await loadOffers();       // баннер "НАДО УСПЕТЬ"
  await loadTree();         // категории
  await loadPromoProducts(true); // товары со скидками (по умолчанию)
}

async function loadOffers() {
  // опционально: если у тебя в HTML есть блок offersBox (для баннера)
  const box = $("offersBox");
  try {
    const offers = await api(`/public/offers/active`);
    if (box) {
      const bg = offers.background || "";
      const img = offers.image || "";
      const logo = offers.logo || "";
      const title = offers.title || "Акции";
      const desc = offers.description || "";
      box.innerHTML = `
        <div style="border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(17,24,39,.08);">
          <div style="padding:14px;background-image:url('${bg}');background-size:cover;background-position:center;">
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              ${logo ? `<img src="${logo}" alt="" style="height:36px">` : ""}
              <div style="font-weight:900;font-size:18px;color:${offers.title_color || "#111827"}">${title}</div>
            </div>
            <div style="margin-top:6px;color:${offers.text_color || "#111827"};white-space:pre-line;">${desc.replaceAll("\r\n", "\n")}</div>
          </div>
          ${img ? `<div style="background:#fff;padding:10px;display:flex;justify-content:center;">
                    <img src="${img}" alt="" style="max-height:180px;max-width:100%;object-fit:contain;">
                  </div>` : ""}
        </div>
      `;
    }
  } catch (e) {
    // баннер не критичен
    if (box) box.innerHTML = "";
  }
}

async function loadTree() {
  if (!state.city) return;
  showCatHint("Загружаю категории…");

  const tree = await api(`/public/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`);
  state.tree = tree;
  state.mainCats = extractMainCategories(tree);

  // Для плиток — ограничим топом, как в Едадиле
  renderCategories(state.mainCats.slice(0, 24));

  showCatHint(`Категории для: ${state.city.name}`);
}

function findPromoCategoryId(tree) {
  // 1) Категория с is_inout=true
  const all = flattenTree(tree);
  const inout = all.find((c) => c.is_inout === true);
  if (inout) return inout.id;

  // 2) По названию "НАДО УСПЕТЬ" (из offers)
  // (в оффере title у тебя "НАДО УСПЕТЬ")
  const t = "надо успеть";
  const byName = all.find((c) => (c.name || "").toLowerCase() === t) ||
                 all.find((c) => (c.name || "").toLowerCase().includes(t));
  if (byName) return byName.id;

  // 3) Иначе — просто первая основная категория
  const main = extractMainCategories(tree);
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

function filterDiscounts(items) {
  return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
}

async function loadPromoProducts(reset) {
  if (!state.city) return;
  if (!state.tree) return;

  state.mode = "promo";
  if (reset) state.page = 1;

  if (!state.sourceCatId) {
    state.sourceCatId = findPromoCategoryId(state.tree);
  }

  if (!state.sourceCatId) {
    showHint("Не нашёл категорию для скидок.");
    $("moreBtn") && ($("moreBtn").hidden = true);
    return;
  }

  showHint("Загружаю товары со скидками…");

  const data = await fetchProducts({
    cityId: state.city.id,
    categoryId: state.sourceCatId,
    page: state.page,
    search: "",
  });

  const items = data.items || [];
  const discounted = filterDiscounts(items);

  // Если в выбранной категории нет old_price — покажем просто товары (чтобы блок не пустовал)
  const toRender = discounted.length ? discounted : items;

  renderProducts(toRender.slice(0, 24), !reset);

  const more = $("moreBtn");
  if (more) more.hidden = !(data.next);
  showHint(discounted.length ? "Товары со скидками" : "Товары (скидки не отмечены old_price)");
}

async function selectCategory(cat) {
  if (!state.city) return;

  state.selectedCat = cat;
  state.mode = "category";
  state.search = "";
  state.page = 1;

  showHint(`Категория: ${cat.name}`);
  const data = await fetchProducts({
    cityId: state.city.id,
    categoryId: cat.id,
    page: state.page,
    search: "",
  });

  const items = data.items || [];
  // Для “категории” тоже логично сначала показать скидки, если есть:
  const discounted = filterDiscounts(items);
  renderProducts((discounted.length ? discounted : items).slice(0, 24), false);

  const more = $("moreBtn");
  if (more) more.hidden = !(data.next);
}

async function doSearch(reset) {
  if (!state.city) return;
  const q = $("q")?.value?.trim() || "";
  state.search = q;
  state.mode = "search";
  state.selectedCat = null;

  if (reset) state.page = 1;

  if (!q) {
    // если пусто — вернёмся к промо
    state.mode = "promo";
    state.page = 1;
    return loadPromoProducts(true);
  }

  showHint(`Поиск: ${q}`);

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
  if (more) more.hidden = !(data.next);
}

async function loadMore() {
  if (state.loading) return;
  if (!state.city) return;

  state.loading = true;
  try {
    state.page += 1;

    if (state.mode === "promo") {
      const data = await fetchProducts({
        cityId: state.city.id,
        categoryId: state.sourceCatId,
        page: state.page,
        search: "",
      });
      const items = data.items || [];
      const discounted = filterDiscounts(items);
      renderProducts((discounted.length ? discounted : items).slice(0, 24), true);

      const more = $("moreBtn");
      if (more) more.hidden = !(data.next);

    } else if (state.mode === "category" && state.selectedCat) {
      const data = await fetchProducts({
        cityId: state.city.id,
        categoryId: state.selectedCat.id,
        page: state.page,
        search: "",
      });
      const items = data.items || [];
      const discounted = filterDiscounts(items);
      renderProducts((discounted.length ? discounted : items).slice(0, 24), true);

      const more = $("moreBtn");
      if (more) more.hidden = !(data.next);

    } else if (state.mode === "search") {
      const data = await fetchProducts({
        cityId: state.city.id,
        categoryId: null,
        page: state.page,
        search: state.search,
      });
      const items = data.items || [];
      const discounted = filterDiscounts(items);
      renderProducts((discounted.length ? discounted : items).slice(0, 24), true);

      const more = $("moreBtn");
      if (more) more.hidden = !(data.next);
    }
  } catch (e) {
    console.error(e);
    showHint(`Ошибка загрузки: ${e.message || e}`);
  } finally {
    state.loading = false;
  }
}

function wireUI() {
  $("year") && ($("year").textContent = String(new Date().getFullYear()));

  $("cityBtn") && ($("cityBtn").onclick = openCityModal);
  $("cityClose") && ($("cityClose").onclick = closeCityModal);
  $("citySearchBtn") && ($("citySearchBtn").onclick = () => searchCities().catch(console.error));

  $("searchBtn") && ($("searchBtn").onclick = () => doSearch(true).catch(console.error));
  $("moreBtn") && ($("moreBtn").onclick = () => loadMore().catch(console.error));

  // Enter для поиска города
  $("cityQuery")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("citySearchBtn")?.click();
  });

  // Enter для поиска товара
  $("q")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("searchBtn")?.click();
  });
}

async function init() {
  wireUI();
  renderPopularChips();
  renderCitiesGrid();

  // старт: сохранённый город или СПб
  const saved = storage.getCity();
  if (saved?.id && saved?.name) {
    await selectCity(saved);
  } else {
    // быстрый дефолт
    await findAndSelectCity("Санкт-Петербург");
  }

  setCityUI();
}

init().catch((e) => {
  console.error(e);
  showHint("Ошибка загрузки данных. Проверь API_BASE и /public/... на бэкенде.");
});
