const API_BASE = "https://feefomit-chizhick-deb9.twc1.net";

async function api(path) {
  const r = await fetch(`${API_BASE}${path}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

(async () => {
  const cities = await api("/public/geo/cities?search=моск&page=1");
  document.getElementById("app").innerHTML =
    `<pre>${JSON.stringify(cities.items?.slice(0, 5) || cities, null, 2)}</pre>`;
})().catch(err => {
  document.getElementById("app").textContent = "Ошибка: " + err.message;
});
