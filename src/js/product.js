/*  chizhick.ru — product.js - СТРАНИЦА ТОВАРА */

(() => {
  if (!window.ChizhikAPI || !window.ChizhikAPI.api) {
    console.error("ChizhikAPI не загружен!");
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:16px;padding:20px;text-align:center;">
        <div style="font-size:48px;">⚠️</div>
        <div style="font-weight:900;font-size:24px;">Ошибка загрузки</div>
        <div style="color:#6b7280;">API не инициализирован. Проверьте подключение app.js</div>
        <button onclick="location.reload()" style="border:1px solid #111;background:#111;color:#fff;padding:12px 24px;border-radius:999px;cursor:pointer;font-weight:800;">
          Перезагрузить страницу
        </button>
      </div>
    `;
    return;
  }

  const $ = (id) => document.getElementById(id);
  const API = window.ChizhikAPI;

  const params = new URL(location.href).searchParams;
  const cityId = params.get("city");
  const productId = params.get("product_id");

  if (!cityId || !productId) {
    location.href = "index.html";
    return;
  }

  const escapeHtml = API.escapeHtml;
  const rub = API.rub;
  const discountPct = API.discountPct;

  const state = {
    city: API.storage.getCity() || { id: cityId, name: "Город" },
    product: null,
  };

  async function loadProduct() {
    try {
      console.log("Загрузка товара:", productId, "город:", cityId);
      
      $("cityName") && ($("cityName").textContent = state.city.name);

      const data = await API.api(`/product/info?product_id=${productId}&city_id=${encodeURIComponent(cityId)}`);
      
      console.log("Товар загружен:", data);
      
      state.product = data;

      const pct = discountPct(data.price, data.old_price);

      // Хлебные крошки
      const breadcrumbs = $("breadcrumbs");
      if (breadcrumbs) {
        breadcrumbs.innerHTML = `
          <a href="index.html?city=${cityId}" style="color:#6b7280;text-decoration:none;transition:color 0.2s;" onmouseenter="this.style.color='#111827'" onmouseleave="this.style.color='#6b7280'">Главная</a>
          <span style="color:#d1d5db;margin:0 8px;">/</span>
          <span style="color:#111827;font-weight:700;">${escapeHtml(data.title || "Товар")}</span>
        `;
      }

      // Галерея
      const gallery = $("gallery");
      if (gallery) {
        gallery.innerHTML = "";
        const images = data.images || [];
        if (images.length) {
          images.forEach((img) => {
            const div = document.createElement("div");
            div.style.cssText = "background:#f9fafb;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:300px;border:1px solid #e5e7eb;";
            div.innerHTML = `<img src="${img.image}" alt="" style="max-width:100%;max-height:500px;object-fit:contain;">`;
            gallery.appendChild(div);
          });
        } else {
          gallery.innerHTML = `<div style="background:#f9fafb;border-radius:16px;height:400px;display:flex;align-items:center;justify-content:center;font-size:64px;border:1px solid #e5e7eb;">🧺</div>`;
        }
      }

      // Заголовок
      $("productTitle") && ($("productTitle").textContent = data.title || "Товар");

      // Цены
      const priceBox = $("priceBox");
      if (priceBox) {
        priceBox.innerHTML = `
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
            <div style="font-weight:900;font-size:36px;line-height:1;">${escapeHtml(rub(data.price))}</div>
            ${data.old_price ? `<div style="font-size:24px;color:#6b7280;text-decoration:line-through;">${escapeHtml(rub(data.old_price))}</div>` : ""}
            ${pct ? `<span style="font-size:16px;font-weight:900;padding:8px 14px;border-radius:999px;background:#dc2626;color:#fff;">-${pct}%</span>` : ""}
          </div>
        `;
      }

      // Описание
      const descBox = $("productDesc");
      if (descBox) {
        if (data.description) {
          descBox.innerHTML = data.description;
        } else {
          descBox.innerHTML = "<p style='color:#6b7280;'>Описание отсутствует.</p>";
        }
      }

      // Характеристики
      const specs = $("specs");
      if (specs) {
        if (data.specifications && data.specifications.length) {
          specs.innerHTML = data.specifications.map((s) =>
            `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5e7eb;">
              <div style="font-weight:700;color:#6b7280;">${escapeHtml(s.name)}</div>
              <div style="text-align:right;">${escapeHtml(s.value)}</div>
            </div>`
          ).join("");
        } else {
          specs.innerHTML = `<div style="color:#6b7280;padding:12px 0;">Характеристики отсутствуют</div>`;
        }
      }

      console.log("Товар успешно отрендерен");
    } catch (e) {
      console.error("Ошибка загрузки товара:", e);
      alert(`Ошибка загрузки товара: ${e.message}`);
      
      const main = document.querySelector("main");
      if (main) {
        main.innerHTML = `
          <div style="text-align:center;padding:48px 20px;">
            <div style="font-size:64px;margin-bottom:16px;">😕</div>
            <h2 style="font-size:24px;font-weight:900;margin-bottom:8px;">Товар не найден</h2>
            <p style="color:#6b7280;margin-bottom:24px;">Не удалось загрузить информацию о товаре</p>
            <button onclick="history.back()" style="border:1px solid #111;background:#111;color:#fff;padding:12px 24px;border-radius:999px;cursor:pointer;font-weight:800;">
              Вернуться назад
            </button>
          </div>
        `;
      }
    }
  }

  async function init() {
    console.log("Инициализация страницы товара");
    
    $("cityBtn")?.addEventListener("click", () => {
      console.log("Клик по кнопке города");
      window.ChizhikCity.openCityModal("");
    });

    $("backBtn")?.addEventListener("click", () => {
      console.log("Клик по кнопке назад");
      history.back();
    });

    await loadProduct();
  }

  document.addEventListener("DOMContentLoaded", () => {
    console.log("DOM загружен, запуск init");
    init().catch(console.error);
  });
})();

