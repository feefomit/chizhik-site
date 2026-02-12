/*  chizhick.ru — app.js (vanilla)
    Требуемые (желательные) элементы в HTML:
    - #offersBox
    - #cats, #catHint
    - #products, #prodHint, #moreBtn
    - #cityBtn, #cityName
    - #year (опционально)

    Этот файл сам создаст модалку выбора города, если её нет в HTML.
*/

(() => {
  // =========================
  // CONFIG
  // =========================
  const API_BASE =
    window.__API_BASE__ ||
    document.querySelector('meta[name="api-base"]')?.content ||
    "https://feefomit-chizhick-deb9.twc1.net";

  const API_PREFIX =
    window.__API_PREFIX__ ||
    document.querySelector('meta[name="api-prefix"]')?.content ||
    "/api";

  // Москва (UUID)
  const DEFAULT_CITY = {
    id: "0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
    name: "Москва",
  };

  const TREE_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
  const OFFERS_CACHE_TTL_MS = 10 * 60 * 1000;    // 10 минут

  // сколько пытаться при 202/503
  const API_RETRIES = 20;

  // =========================
  // HELPERS
  // =========================
  const $ = (id) => document.getElementById(id);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const escapeHtml = (s) =>
    String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  function cleanBase(u) {
    return String(u || "").replace(/\/+$/, "");
  }

  function isUUID(v) {
    return (
      typeof v === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    );
  }

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
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

  function extractMainCats(tree) {
    const all = flattenTree(tree);
    // Главные категории (как в витрине): depth 2, без взрослых, без промо "НАДО УСПЕТЬ"
    const main = all.filter((c) => c.depth === 2 && !c.is_adults && !c.is_inout);
    const seen = new Set();
    return main.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }

  function pickCatImage(cat) {
    return cat.image || cat.icon || null;
  }

  function filterDiscounts(items) {
    return (items || []).filter((p) => p.old_price != null && Number(p.old_price) > Number(p.price));
  }

  // =========================
  // LOCAL STORAGE CACHE
  // =========================
  const storage = {
    getCity() {
      try {
        const v = JSON.parse(localStorage.getItem("city") || "null");
        if (v?.id && v?.name && isUUID(v.id)) return v;
        return null;
      } catch {
        return null;
      }
    },
    setCity(city) {
      localStorage.setItem("city", JSON.stringify(city));
    },
    clearCity() {
      localStorage.removeItem("city");
    },

    _getCache(key) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || typeof obj !== "object") return null;
        return obj;
      } catch {
        return null;
      }
    },
    _setCache(key, obj) {
      try {
        localStorage.setItem(key, JSON.stringify(obj));
      } catch {
        // ignore (quota)
      }
    },
    getCached(key, ttlMs) {
      const obj = this._getCache(key);
      if (!obj?.t || obj?.d == null) return null;
      if (Date.now() - obj.t > ttlMs) return null;
      return obj.d;
    },
    setCached(key, data) {
      this._setCache(key, { t: Date.now(), d: data });
    },
    del(key) {
      localStorage.removeItem(key);
    },
  };

  // =========================
  // ROUTING (query params)
  // =========================
  function getParams() {
    const u = new URL(location.href);
    return u.searchParams;
  }
  function setParam(k, v) {
    const u = new URL(location.href);
    if (v == null || v === "") u.searchParams.delete(k);
    else u.searchParams.set(k, String(v));
    history.pushState({}, "", u.toString());
  }

  // =========================
  // API
  // =========================
  async function api(path, { retries = API_RETRIES, timeoutMs = 25000 } = {}) {
    const base = cleanBase(API_BASE);
    const url = `${base}${API_PREFIX}${path}`;

    let lastErr;
    for (let i = 1; i <= retries; i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const r = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        if (r.ok) return r.json();

        // backend может отдавать:
        // 503: прогрев/упал браузер/таймаут апстрима
        // 202: дерево строится в фоне (наш режим)
        if (r.status === 503 || r.status === 202 || r.status === 502 || r.status === 504) {
          await sleep(Math.min(2500, 800 + i * 100));
          continue;
        }

        const t = await r.text().catch(() => "");
        throw new Error(`${r.status} ${t || r.statusText}`);
      } catch (e) {
        clearTimeout(timer);
        lastErr = e;

        // на сетевых ошибках чуть подождём и повторим
        await sleep(Math.min(2500, 500 + i * 120));
      }
    }
    throw lastErr || new Error("API error");
  }

  // =========================
  // UI: City modal (auto-create)
  // =========================
  function ensureCityModal() {
    if ($("cityModal")) return;

    const modal = document.createElement("div");
    modal.id = "cityModal";
    modal.style.cssText = `
      position:fixed;inset:0;display:none;align-items:center;justify-content:center;
      background:rgba(0,0,0,.45);z-index:9999;padding:16px;
    `;

    modal.innerHTML = `
      <div style="width:min(720px,100%);background:#fff;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid #eee;">
          <div style="font-weight:900;font-size:16px;">Выбор города</div>
          <button id="cityClose" style="border:0;background:transparent;font-size:22px;line-height:1;cursor:pointer;">×</button>
        </div>
        <div style="padding:14px 16px;">
          <input id="citySearch" placeholder="Начни вводить город (например: Москва)" 
                 style="width:100%;padding:12px 12px;border:1px solid #e5e7eb;border-radius:12px;outline:none;">
          <div id="cityResults" style="margin-top:12px;display:grid;gap:8px;"></div>
          <div style="margin-top:12px;color:#6b7280;font-size:12px;">
            Подсказка: можно искать по названию, затем выбрать из списка.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeCityModal();
    });

    $("cityClose")?.addEventListener("click", closeCityModal);

    let t = null;
    $("citySearch")?.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const q = $("citySearch").value.trim();
        if (q.length < 2) {
          $("cityResults").innerHTML = `<div style="color:#6b7280;">Введите хотя бы 2 буквы…</div>`;
          return;
        }
        searchCity(q).catch(console.error);
      }, 250);
    });
  }

  function openCityModal(prefill = "") {
    ensureCityModal();
    const m = $("cityModal");
    if (!m) return;
    m.style.display = "flex";
    const inp = $("citySearch");
    if (inp) {
      inp.value = prefill;
      inp.focus();
      inp.dispatchEvent(new Event("input"));
    }
  }

  function closeCityModal() {
    const m = $("cityModal");
    if (m) m.style.display = "none";
  }

  async function searchCity(query) {
    const box = $("cityResults");
    if (!box) return;
    box.innerHTML = `<div style="color:#6b7280;">Ищу…</div>`;

    const data = await api(`/geo/cities?search=${encodeURIComponent(query)}&page=1`);
    const items = data?.items || [];

    if (!items.length) {
      box.innerHTML = `<div style="color:#6b7280;">Ничего не найдено.</div>`;
      return;
    }

    box.innerHTML = "";
    items.slice(0, 20).forEach((c) => {
      const id = c.fias_id;
      const name = c.name;
      const b = document.createElement("button");
      b.type = "button";
      b.style.cssText = `
        text-align:left;border:1px solid #eee;background:#fff;border-radius:12px;padding:10px 12px;
        cursor:pointer;display:flex;justify-content:space-between;gap:12px;align-items:center;
      `;
      b.innerHTML = `
        <div>
          <div style="font-weight:800;">${escapeHtml(name)}</div>
          <div style="font-size:12px;color:#6b7280;">${escapeHtml(c.slug || "")}</div>
        </div>
        <div style="font-size:12px;color:#6b7280;">выбрать</div>
      `;
      b.onclick = () => {
        selectCity({ id, name });
        closeCityModal();
      };
      box.appendChild(b);
    });
  }

  async function findAndSelectCity(name) {
    const data = await api(`/geo/cities?search=${encodeURIComponent(name)}&page=1`);
    const items = data?.items || [];
    if (!items.length) throw new Error("city not found");
    const norm = name.trim().toLowerCase();
    const best =
      items.find((c) => String(c.name || "").trim().toLowerCase() === norm) || items[0];
    selectCity({ id: best.fias_id, name: best.name });
  }

  // =========================
  // RENDER
  // =========================
  function renderCategories(cats) {
    const box = $("cats");
    if (!box) return;
    box.innerHTML = "";

    (cats || []).slice(0, 24).forEach((cat) => {
      const img = pickCatImage(cat);

      const tile = document.createElement("div");
      tile.className = "cat"; // стили в CSS (если есть)
      tile.style.cssText = `
        border:1px solid #e5e7eb;border-radius:16px;background:#fff;cursor:pointer;
        display:flex;gap:12px;align-items:center;padding:12px;box-shadow:0 10px 30px rgba(17,24,39,.06);
      `;

      tile.innerHTML = `
        <div style="width:56px;height:56px;border-radius:14px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;overflow:hidden;">
          ${img ? `<img src="${img}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`
              : `<div style="font-size:22px;">🛒</div>`}
        </div>
        <div style="min-width:0;">
          <div style="font-weight:900;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(cat.name)}
          </div>
          <div style="font-size:12px;color:#6b7280;margin-top:2px;">Открыть</div>
        </div>
      `;

      tile.onclick = () => selectCategory(cat);
      box.appendChild(tile);
    });

    if (!cats || !cats.length) {
      box.innerHTML = `<div style="color:#6b7280;">Категории пустые.</div>`;
    }
  }

  function renderProducts(items, { append = false } = {}) {
    const grid = $("products");
    if (!grid) return;
    if (!append) grid.innerHTML = "";

    (items || []).forEach((p) => {
      const img = productImage(p);
      const pct = discountPct(p.price, p.old_price);
      const badgeText =
        pct ? `-${pct}%` : (p.is_inout ? "НАДО УСПЕТЬ" : "Товар");

      const card = document.createElement("div");
      card.className = "card";
      card.style.cssText = `
        border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden;
        box-shadow:0 10px 30px rgba(17,24,39,.06);
        display:flex;flex-direction:column;
      `;

      card.innerHTML = `
        <div style="padding:10px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <span style="font-size:11px;font-weight:900;padding:6px 10px;border-radius:999px;background:#111827;color:#fff;white-space:nowrap;">
            ${escapeHtml(badgeText)}
          </span>
          <div style="text-align:right;">
            <div style="font-weight:900;font-size:16px;line-height:1;">${escapeHtml(rub(p.price))}</div>
            ${p.old_price != null ? `<div style="font-size:12px;color:#6b7280;text-decoration:line-through;margin-top:2px;">${escapeHtml(rub(p.old_price))}</div>` : ""}
          </div>
        </div>

        <div style="background:#f9fafb;display:flex;justify-content:center;align-items:center;height:180px;">
          ${img ? `<img src="${img}" alt="" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">`
              : `<div style="font-size:28px;">🧺</div>`}
        </div>

        <div style="padding:10px 12px;">
          <div style="font-weight:900;font-size:13px;line-height:1.25;min-height:34px;">
            ${escapeHtml(p.title)}
          </div>
          <div style="margin-top:6px;font-size:12px;color:#6b7280;">
            id: ${escapeHtml(p.id)}
          </div>
        </div>
      `;

      // карточку можно будет позже вести на страницу товара
      // card.onclick = () => openProduct(p.id);

      grid.appendChild(card);
    });

    if ((!items || !items.length) && !append) {
      grid.innerHTML = `<div style="color:#6b7280;">Товары не найдены.</div>`;
    }
  }

  async function renderOffersBanner() {
    const box = $("offersBox");
    if (!box) return;

    // local cache
    const cached = storage.getCached("offers:active", OFFERS_CACHE_TTL_MS);
    if (cached) {
      drawOffers(box, cached);
      return;
    }

    try {
      const offers = await api("/offers/active");
      storage.setCached("offers:active", offers);
      drawOffers(box, offers);
    } catch {
      box.innerHTML = "";
    }
  }

  function drawOffers(box, offers) {
    const bg = offers.background || "";
    const img = offers.image || "";
    const logo = offers.logo || "";
    const title = offers.title || "Акции";
    const desc = (offers.description || "").replaceAll("\r\n", "\n");
    const titleColor = offers.title_color || "#111827";

    box.innerHTML = `
      <div style="border-radius:18px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 10px 30px rgba(17,24,39,.08);">
        <div style="padding:14px;background-image:url('${bg}');background-size:cover;background-position:center;">
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            ${logo ? `<img src="${logo}" alt="" style="height:34px">` : ""}
            <div style="font-weight:900;font-size:18px;color:${titleColor}">${escapeHtml(title)}</div>
          </div>
          <div style="margin-top:6px;white-space:pre-line;color:${titleColor};opacity:.92">${escapeHtml(desc)}</div>
        </div>
        ${img ? `<div style="background:#fff;padding:10px;display:flex;justify-content:center;">
                  <img src="${img}" alt="" style="max-height:190px;max-width:100%;object-fit:contain;">
                </div>` : ""}
      </div>
    `;
  }

  // =========================
  // STATE
  // =========================
  const state = {
    city: null,
    tree: null,
    mainCats: [],
    selectedCat: null,
    promoCatId: null,
    page: 1,
    mode: "promo", // promo | category
    lastProductsResponse: null,
  };

  function selectCity(city) {
    if (!city?.id || !isUUID(city.id)) return;

    state.city = { id: city.id, name: city.name || "Город" };
    storage.setCity(state.city);
    setParam("city", state.city.id);

    const cityName = $("cityName");
    if (cityName) cityName.textContent = state.city.name;

    // сброс состояния
    state.tree = null;
    state.mainCats = [];
    state.selectedCat = null;
    state.promoCatId = null;
    state.page = 1;
    state.mode = "promo";

    // перезагрузка данных
    initData().catch((e) => {
      console.error(e);
      setText("catHint", "Ошибка загрузки категорий");
      setText("prodHint", "Ошибка загрузки товаров");
    });
  }

  function findPromoCategoryId(tree) {
    const all = flattenTree(tree);
    const inout = all.find((c) => c.is_inout === true); // "НАДО УСПЕТЬ" (id 149)
    if (inout?.children?.length) {
      // приоритет: "Товары текущей недели" (slug)
      const curWeek = inout.children.find((x) => x.slug === "tovary-tekushchei-nedeli");
      if (curWeek) return curWeek.id;
      return inout.children[0].id;
    }
    if (inout) return inout.id;

    const main = extractMainCats(tree);
    return main.length ? main[0].id : null;
  }

  async function loadTree() {
    setText("catHint", "Загружаю категории…");

    const cacheKey = `tree:${state.city.id}`;
    const cached = storage.getCached(cacheKey, TREE_CACHE_TTL_MS);
    if (cached) {
      state.tree = cached;
      state.mainCats = extractMainCats(cached);
      renderCategories(state.mainCats);
      setText("catHint", `Категории: ${state.city.name} (из кэша, ${state.mainCats.length})`);
      return;
    }

    // Если бекенд вернёт 202 — api() сам ретраит
    const tree = await api(`/catalog/tree?city_id=${encodeURIComponent(state.city.id)}`, {
      retries: API_RETRIES,
      timeoutMs: 30000,
    });

    state.tree = tree;
    storage.setCached(cacheKey, tree);

    state.mainCats = extractMainCats(tree);
    renderCategories(state.mainCats);

    setText("catHint", `Категории: ${state.city.name} (получено: ${state.mainCats.length})`);
  }

  async function loadPromo(reset = true) {
    if (!state.tree) return;

    if (reset) state.page = 1;
    state.mode = "promo";
    state.selectedCat = null;

    if (!state.promoCatId) state.promoCatId = findPromoCategoryId(state.tree);
    if (!state.promoCatId) {
      setText("prodHint", "Не нашёл категорию промо-товаров.");
      return;
    }

    setText("prodHint", "Загружаю товары…");

    const data = await api(
      `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${state.promoCatId}&page=${state.page}`,
      { retries: API_RETRIES, timeoutMs: 30000 }
    );

    state.lastProductsResponse = data;

    const items = data.items || [];
    // если есть реальные скидки — показываем их; иначе показываем просто промо витрину
    const discounted = filterDiscounts(items);
    const list = discounted.length ? discounted : items;

    renderProducts(list.slice(0, 24), { append: !reset });
    setText("prodHint", discounted.length
      ? `Скидки: показано ${Math.min(24, discounted.length)} (стр. ${state.page})`
      : `Промо: показано ${Math.min(24, list.length)} (стр. ${state.page})`
    );

    const more = $("moreBtn");
    if (more) more.hidden = !data.next;
  }

  async function selectCategory(cat) {
    state.selectedCat = cat;
    state.mode = "category";
    state.page = 1;

    setParam("cat", cat.id);
    setText("prodHint", `Категория: ${cat.name} — загружаю…`);

    const data = await api(
      `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${cat.id}&page=${state.page}`,
      { retries: API_RETRIES, timeoutMs: 30000 }
    );

    state.lastProductsResponse = data;

    const items = data.items || [];
    const discounted = filterDiscounts(items);
    const list = discounted.length ? discounted : items;

    renderProducts(list.slice(0, 24), { append: false });
    setText("prodHint", `Категория: ${cat.name} (стр. ${state.page})`);

    const more = $("moreBtn");
    if (more) more.hidden = !data.next;
  }

  async function loadMore() {
    if (!state.city) return;

    state.page += 1;

    if (state.mode === "category" && state.selectedCat) {
      const cat = state.selectedCat;
      setText("prodHint", `Категория: ${cat.name} — загружаю ещё…`);

      const data = await api(
        `/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${cat.id}&page=${state.page}`,
        { retries: API_RETRIES, timeoutMs: 30000 }
      );

      state.lastProductsResponse = data;

      const items = data.items || [];
      const discounted = filterDiscounts(items);
      const list = discounted.length ? discounted : items;

      renderProducts(list.slice(0, 24), { append: true });
      setText("prodHint", `Категория: ${cat.name} (стр. ${state.page})`);

      const more = $("moreBtn");
      if (more) more.hidden = !data.next;

      return;
    }

    // promo
    await loadPromo(false);
  }

  // =========================
  // INIT
  // =========================
  async function initData() {
    await renderOffersBanner();
    await loadTree();

    // если в URL есть cat — открываем его
    const params = getParams();
    const catId = params.get("cat");
    if (catId && /^\d+$/.test(catId) && state.tree) {
      const all = flattenTree(state.tree);
      const cat = all.find((c) => String(c.id) === String(catId));
      if (cat) {
        await selectCategory(cat);
        return;
      }
    }

    // иначе — промо
    await loadPromo(true);
  }

  async function init() {
    $("year") && ($("year").textContent = String(new Date().getFullYear()));

    // city from URL or storage
    const params = getParams();
    const cityFromUrl = params.get("city");

    const saved = storage.getCity();
    if (cityFromUrl && isUUID(cityFromUrl)) {
      // если в URL только uuid — имя узнаем по поиску (лениво)
      state.city = { id: cityFromUrl, name: saved?.id === cityFromUrl ? saved.name : "Город" };
      storage.setCity(state.city);
      if (state.city.name === "Город") {
        // мягко пытаемся подобрать имя
        api(`/geo/cities?search=${encodeURIComponent("моск")}&page=1`).catch(() => {});
      }
    } else if (saved) {
      state.city = saved;
    } else {
      state.city = DEFAULT_CITY;
      storage.setCity(DEFAULT_CITY);
      setParam("city", DEFAULT_CITY.id);
    }

    $("cityName") && ($("cityName").textContent = state.city.name);

    // button handlers
    $("cityBtn")?.addEventListener("click", () => openCityModal(""));

    $("moreBtn")?.addEventListener("click", () => loadMore().catch(console.error));

    // Быстрые города (если есть контейнер #citiesQuick)
    const quick = $("citiesQuick");
    if (quick) {
      const popular = ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург", "Новосибирск", "Нижний Новгород"];
      quick.innerHTML = popular.map((n) =>
        `<button type="button" data-city="${escapeHtml(n)}"
          style="border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:800;">
          ${escapeHtml(n)}
        </button>`
      ).join(" ");

      quick.querySelectorAll("button[data-city]").forEach((b) => {
        b.addEventListener("click", async () => {
          const name = b.getAttribute("data-city");
          try {
            setText("catHint", "Меняю город…");
            setText("prodHint", "Меняю город…");
            await findAndSelectCity(name);
          } catch (e) {
            console.error(e);
            openCityModal(name);
          }
        });
      });
    }

    // Запуск
    try {
      await initData();
    } catch (e) {
      console.error(e);
      setText("catHint", `Ошибка категорий: ${e?.message || e}`);
      setText("prodHint", `Ошибка товаров: ${e?.message || e}`);
    }
  }

  window.addEventListener("popstate", () => {
    // при back/forward просто перезапускаем логику отображения
    init().catch(console.error);
  });

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setText("catHint", "Ошибка инициализации");
      setText("prodHint", "Ошибка загрузки. Проверь API_BASE и /api/*");
    });
  });
})();
