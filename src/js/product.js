/*  chizhick.ru — product.js */

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
  
  const citySlug = pathParts[0] || '';
  const productId = pathParts[2] || '';

  if (!citySlug || pathParts[1] !== 'product' || !productId) {
    location.href = '/';
    return;
  }

  const escapeHtml = API.escapeHtml;
  const rub = API.rub;
  const discountPct = API.discountPct;

  const state = {
    city: API.storage.getCity() || { slug: citySlug, name: "Город" },
    citySlug: citySlug,
    product: null,
    currentImageIndex: 0,
  };

  function renderGallery(images) {
    const gallery = $("gallery");
    if (!gallery) return;

    if (!images || !images.length) {
      gallery.innerHTML = `<div style="background:#f9fafb;border-radius:16px;height:400px;display:flex;align-items:center;justify-content:center;font-size:64px;border:1px solid #e5e7eb;">🧺</div>`;
      return;
    }

    if (images.length === 1) {
      gallery.innerHTML = `
        <div style="background:#f9fafb;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:400px;border:1px solid #e5e7eb;">
          <img src="${images[0].image}" alt="" style="max-width:100%;max-height:600px;object-fit:contain;">
        </div>
      `;
      return;
    }

    gallery.innerHTML = `
      <div id="mainImage" style="background:#f9fafb;border-radius:16px;overflow:hidden;display:flex;align-items:center;justify-content:center;min-height:400px;border:1px solid #e5e7eb;position:relative;">
        <img src="${images[0].image}" alt="" style="max-width:100%;max-height:600px;object-fit:contain;">
        
        <button id="prevBtn" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;cursor:pointer;font-size:18px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          ←
        </button>
        <button id="nextBtn" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.9);border:1px solid #e5e7eb;cursor:pointer;font-size:18px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          →
        </button>
        
        <div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.7);color:#fff;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700;">
          <span id="imageCounter">1</span> / ${images.length}
        </div>
      </div>
      
      <div id="thumbnails" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-top:12px;">
      </div>
    `;

    const thumbnails = $("thumbnails");
    images.forEach((img, index) => {
      const thumb = document.createElement("div");
      thumb.style.cssText = `
        background:#f9fafb;border-radius:12px;overflow:hidden;cursor:pointer;
        border:2px solid ${index === 0 ? '#111827' : '#e5e7eb'};
        height:80px;display:flex;align-items:center;justify-content:center;
        transition:all 0.2s;
      `;
      thumb.innerHTML = `<img src="${img.image}" alt="" style="max-width:100%;max-height:100%;object-fit:contain;">`;
      
      thumb.onclick = () => showImage(index);
      thumb.onmouseenter = () => {
        if (state.currentImageIndex !== index) {
          thumb.style.borderColor = "#6b7280";
        }
      };
      thumb.onmouseleave = () => {
        if (state.currentImageIndex !== index) {
          thumb.style.borderColor = "#e5e7eb";
        }
      };
      
      thumbnails.appendChild(thumb);
    });

    function showImage(index) {
      state.currentImageIndex = index;
      const mainImg = document.querySelector("#mainImage img");
      if (mainImg) mainImg.src = images[index].image;
      
      const counter = $("imageCounter");
      if (counter) counter.textContent = index + 1;
      
      const thumbs = thumbnails.children;
      Array.from(thumbs).forEach((thumb, i) => {
        thumb.style.borderColor = i === index ? "#111827" : "#e5e7eb";
      });
    }

    $("prevBtn")?.addEventListener("click", () => {
      const newIndex = state.currentImageIndex === 0 ? images.length - 1 : state.currentImageIndex - 1;
      showImage(newIndex);
    });

    $("nextBtn")?.addEventListener("click", () => {
      const newIndex = (state.currentImageIndex + 1) % images.length;
      showImage(newIndex);
    });

    const handleKeyboard = (e) => {
      if (e.key === "ArrowLeft") {
        $("prevBtn")?.click();
      } else if (e.key === "ArrowRight") {
        $("nextBtn")?.click();
      }
    };
    
    document.addEventListener("keydown", handleKeyboard);
    
    window.addEventListener("beforeunload", () => {
      document.removeEventListener("keydown", handleKeyboard);
    });
  }

  function addStructuredData(product) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify({
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.title,
      "image": product.images?.[0]?.image || "",
      "description": product.description || product.title,
      "offers": {
        "@type": "Offer",
        "url": window.location.href,
        "priceCurrency": "RUB",
        "price": product.price,
        "availability": "https://schema.org/InStock"
      }
    });
    document.head.appendChild(script);
  }

  async function loadProduct() {
    try {
      console.log("Загрузка товара:", productId, "город:", citySlug);
      
      $("cityName") && ($("cityName").textContent = state.city.name);

      const data = await API.api(`/product/info?product_id=${productId}&city_id=${encodeURIComponent(state.city.id)}`);
      
      console.log("Товар загружен:", data);
      
      state.product = data;

      const pct = discountPct(data.price, data.old_price);

      document.title = `${data.title} - ${state.city.name} - Чижик`;

      const breadcrumbs = $("breadcrumbs");
      if (breadcrumbs) {
        const title = (data.title || "Товар").substring(0, 50) + (data.title?.length > 50 ? "..." : "");
        breadcrumbs.innerHTML = `
          <a href="/${citySlug}/" style="color:#6b7280;text-decoration:none;transition:color 0.2s;" onmouseenter="this.style.color='#111827'" onmouseleave="this.style.color='#6b7280'">Главная</a>
          <span style="color:#d1d5db;margin:0 8px;">/</span>
          <span style="color:#111827;font-weight:700;">${escapeHtml(title)}</span>
        `;
      }

      renderGallery(data.images);

      $("productTitle") && ($("productTitle").textContent = data.title || "Товар");

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

      const descBox = $("productDesc");
      const descSection = $("descSection");
      if (descBox && descSection) {
        if (data.description && data.description.trim()) {
          descBox.innerHTML = data.description;
          descSection.style.display = "block";
        } else {
          descSection.style.display = "none";
        }
      }

      const specs = $("specs");
      const specsSection = $("specsSection");
      if (specs && specsSection) {
        if (data.specifications && data.specifications.length) {
          specs.innerHTML = data.specifications.map((s) =>
            `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #e5e7eb;">
              <div style="font-weight:700;color:#6b7280;padding-right:16px;">${escapeHtml(s.name)}</div>
              <div style="text-align:right;flex-shrink:0;">${escapeHtml(s.value)}</div>
            </div>`
          ).join("");
          specsSection.style.display = "block";
        } else {
          specsSection.style.display = "none";
        }
      }

      addStructuredData(data);

      console.log("Товар успешно отрендерен");
    } catch (e) {
      console.error("Ошибка загрузки товара:", e);
      
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
      window.ChizhikCity.openCityModal("");
    });

    $("backBtn")?.addEventListener("click", () => {
      history.back();
    });

    await loadProduct();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch(console.error);
  });
})();
