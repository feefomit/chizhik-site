/*  chizhick.ru — category.js */

(() => {
  if (!window.ChizhikAPI || !window.ChizhikAPI.api) {
    console.error("ChizhikAPI не загружен!");
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:20px;text-align:center;">
        <div style="font-size:48px;">⚠️</div>
        <div style="font-weight:900;font-size:24px;">Ошибка загрузки</div>
        <div style="color:#6b7280;">API не инициализирован</div>
        <button onclick="location.reload()" style="border:1px solid #111;background:#111;color:#fff;padding:12px 24px;border-radius:999px;cursor:pointer;font-weight:800;">
          Перезагрузить
        </button>
      </div>
    `;
    return;
  }

  const $ = (id) => document.getElementById(id);
  const API = window.ChizhikAPI;

  const path = window.location.pathname;
  const pathParts = path.split('/').filter(Boolean);
  const params = new URL(location.href).searchParams;
  
  const citySlug = pathParts[0] || '';
  const categorySlug = pathParts[1] || '';
  const catId = params.get('cat_id');

  if (!citySlug || !categorySlug || !catId) {
    location.href = '/';
    return;
  }

  const escapeHtml = API.escapeHtml;
  const rub = API.rub;
  const productImage = API.productImage;
  const discountPct = API.discountPct;
  const pickCatImage = API.pickCatImage;
  const slugify = API.slugify;

  const state = {
    city: API.storage.getCity() || { slug: citySlug, name: "Город" },
    citySlug: citySlug,
    categorySlug: categorySlug,
    catId: catId,
    category: null,
    subcategories: [],
    page: 1,
    hasMore: false,
  };

  function renderSubcategories(subcats) {
    const box = $("subcats");
    if (!box) return;
    
    if (!subcats || !subcats.length) {
      box.style.display = "none";
      return;
    }

    box.style.display = "block";
    const grid = box.querySelector("#subcatsGrid");
    if (!grid) return;

    grid.innerHTML = "";

    subcats.forEach((cat) => {
      const img = pickCatImage(cat);
      const catSlug = cat.slug || slugify(cat.name);

      const tile = document.createElement("div");
      tile.style.cssText = `
        border:1px solid #e5e7eb;border-radius:14px;background:#fff;cursor:pointer;
        display:flex;gap:10px;align-items:center;padding:10px;box-shadow:0 8px 20px rgba(17,24,39,.05);
        transition: transform 0.2s, box-shadow 0.2s;
      `;
      
      tile.onmouseenter = () => {
        tile.style.transform = "translateY(-2px)";
        tile.style.boxShadow = "0 12px 30px rgba(17,24,39,.1)";
      };
      tile.onmouseleave = () => {
        tile.style.transform = "";
        tile.style.boxShadow = "";
      };

      tile.innerHTML = `
        <div style="width:48px;height:48px;border-radius:12px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
          ${img ? `<img src="${img}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : `<div style="font-size:20px;">📦</div>`}
        </div>
        <div style="min-width:0;flex:1;">
          <div style="font-weight:800;font-size:13px;line-height:1.2;">${escapeHtml(cat.name)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">Перейти →</div>
        </div>
      `;

      tile.onclick = () => {
        location.href = `/${citySlug}/${catSlug}/?cat_id=${cat.id}`;
      };
      
      grid.appendChild(tile);
    });
  }

  function renderProducts(items, append = false) {
    const grid = $("products");
    if (!grid) return;
    if (!append) grid.innerHTML = "";

    (items || []).forEach((p) => {
      const img = productImage(p);
      const pct = discountPct(p.price, p.old_price);
      const badgeText = pct ? `-${pct}%` : "Товар";

      const card = document.createElement("div");
      card.style.cssText = `
        border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden;
        box-shadow:0 10px 30px rgba(17,24,39,.06);cursor:pointer;
        display:flex;flex-direction:column;transition:transform 0.2s,box-shadow 0.2s;
      `;

      card.onmouseenter = () => {
        card.style.transform = "translateY(-4px)";
        card.style.boxShadow = "0 20px 50px rgba(17,24,39,.15)";
      };
      card.onmouseleave = () => {
        card.style.transform = "";
        card.style.boxShadow = "";
      };

      card.innerHTML = `
        <div style="padding:10px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <span style="font-size:11px;font-weight:900;padding:6px 10px;border-radius:999px;background:#111827;color:#fff;">
            ${escapeHtml(badgeText)}
          </span>
          <div style="text-align:right;">
            <div style="font-weight:900;font-size:16px;">${escapeHtml(rub(p.price))}</div>
            ${p.old_price ? `<div style="font-size:12px;color:#6b7280;text-decoration:line-through;margin-top:2px;">${escapeHtml(rub(p.old_price))}</div>` : ""}
          </div>
        </div>
        <div style="background:#f9fafb;display:flex;justify-content:center;align-items:center;height:180px;">
          ${img ? `<img src="${img}" alt="" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<div style="font-size:28px;">🧺</div>`}
        </div>
        <div style="padding:10px 12px;">
          <div style="font-weight:900;font-size:13px;line-height:1.25;min-height:34px;">${escapeHtml(p.title)}</div>
        </div>
      `;

      card.onclick = () => {
        location.href = `/${citySlug}/product/${p.id}/`;
      };

      grid.appendChild(card);
    });

    if ((!items || !items.length) && !append) {
      grid.innerHTML = `<div style="color:#6b7280;padding:20px;text-align:center;">Товары не найдены</div>`;
    }
  }

  function renderPromoProducts(items) {
    const grid = $("promoProducts");
    if (!grid) return;

    if (!items || !items.length) {
      $("promoSection").style.display = "none";
      return;
    }

    $("promoSection").style.display = "block";
    grid.innerHTML = "";

    items.slice(0, 12).forEach((p) => {
      const img = productImage(p);
      const pct = discountPct(p.price, p.old_price);
      const badgeText = pct ? `-${pct}%` : "АКЦИЯ";

      const card = document.createElement("div");
      card.style.cssText = `
        border:1px solid #e5e7eb;border-radius:18px;background:#fff;overflow:hidden;
        box-shadow:0 10px 30px rgba(17,24,39,.06);cursor:pointer;
        display:flex;flex-direction:column;transition:transform 0.2s,box-shadow 0.2s;
      `;

      card.onmouseenter = () => {
        card.style.transform = "translateY(-4px)";
        card.style.boxShadow = "0 20px 50px rgba(17,24,39,.15)";
      };
      card.onmouseleave = () => {
        card.style.transform = "";
        card.style.boxShadow = "";
      };

      card.innerHTML = `
        <div style="padding:10px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
          <span style="font-size:11px;font-weight:900;padding:6px 10px;border-radius:999px;background:#dc2626;color:#fff;">
            ${escapeHtml(badgeText)}
          </span>
          <div style="text-align:right;">
            <div style="font-weight:900;font-size:16px;">${escapeHtml(rub(p.price))}</div>
            ${p.old_price ? `<div style="font-size:12px;color:#6b7280;text-decoration:line-through;margin-top:2px;">${escapeHtml(rub(p.old_price))}</div>` : ""}
          </div>
        </div>
        <div style="background:#f9fafb;display:flex;justify-content:center;align-items:center;height:180px;">
          ${img ? `<img src="${img}" alt="" loading="lazy" style="max-width:100%;max-height:100%;object-fit:contain;">` : `<div style="font-size:28px;">🧺</div>`}
        </div>
        <div style="padding:10px 12px;">
          <div style="font-weight:900;font-size:13px;line-height:1.25;min-height:34px;">${escapeHtml(p.title)}</div>
        </div>
      `;

      card.onclick = () => {
        location.href = `/${citySlug}/product/${p.id}/`;
      };

      grid.appendChild(card);
    });
  }

  async function loadPromoProducts() {
    try {
      const tree = API.storage.getCached(`tree:${state.city.id}`, 12 * 60 * 60 * 1000);
      if (!tree) return;

      const all = API.flattenTree(tree);
      const inout = all.find((c) => c.is_inout === true);
      
      let promoCatId = null;
      if (inout?.children?.length) {
        const curWeek = inout.children.find((x) => x.slug === "tovary-tekushchei-nedeli");
        promoCatId = curWeek ? curWeek.id : inout.children[0].id;
      } else if (inout) {
        promoCatId = inout.id;
      }

      if (!promoCatId) return;

      const data = await API.api(`/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${promoCatId}&page=1`);
      const items = data.items || [];
      
      const discounted = API.filterDiscounts(items);
      renderPromoProducts(discounted.length ? discounted : items);
    } catch (e) {
      console.error("Ошибка загрузки промо:", e);
    }
  }

  async function loadCategory() {
    const tree = API.storage.getCached(`tree:${state.city.id}`, 12 * 60 * 60 * 1000);
    if (tree) {
      const all = API.flattenTree(tree);
      state.category = all.find((c) => String(c.id) === String(catId));
      
      if (state.category?.children && state.category.children.length) {
        state.subcategories = state.category.children;
      }
    }

    const catName = state.category?.name || `Категория`;
    
    $("catName") && ($("catName").textContent = catName);
    $("cityName") && ($("cityName").textContent = state.city.name);
    
    document.title = `${catName} - ${state.city.name} - Чижик`;

    const breadcrumbs = $("breadcrumbs");
    if (breadcrumbs) {
      breadcrumbs.innerHTML = `
        <a href="/${citySlug}/" style="color:#6b7280;text-decoration:none;transition:color 0.2s;" onmouseenter="this.style.color='#111827'" onmouseleave="this.style.color='#6b7280'">Главная</a>
        <span style="color:#d1d5db;margin:0 8px;">/</span>
        <span style="color:#111827;font-weight:700;">${escapeHtml(catName)}</span>
      `;
    }

    renderSubcategories(state.subcategories);

    const data = await API.api(`/catalog/products?city_id=${encodeURIComponent(state.city.id)}&category_id=${catId}&page=${state.page}`);

    const items = data.items || [];
    renderProducts(items, state.page > 1);

    state.hasMore = !!data.next;
    const moreBtn = $("moreBtn");
    if (moreBtn) moreBtn.hidden = !state.hasMore;

    $("prodHint") && ($("prodHint").textContent = items.length ? `Товаров: ${items.length}` : "");

    await loadPromoProducts();
  }

  async function init() {
    $("cityBtn")?.addEventListener("click", () => window.ChizhikCity.openCityModal(""));

    $("backBtn")?.addEventListener("click", () => {
      location.href = `/${citySlug}/`;
    });

    $("moreBtn")?.addEventListener("click", async () => {
      state.page++;
      await loadCategory();
    });

    try {
      await loadCategory();
    } catch (e) {
      console.error(e);
      alert("Ошибка загрузки категории");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
