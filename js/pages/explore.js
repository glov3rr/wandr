import { $, $$, escapeHTML, plural } from "../lib/dom.js";
import { setupChips, chipsHTML } from "../lib/ui.js";
import { placeUrl, regionLabel, slug } from "../lib/data.js";

export default function explore(data) {
  $("[data-explore-summary]").textContent =
    `${plural(data.places.length, "place")} across ${plural(data.regions.length, "region")}`;

  $("[data-chips]").innerHTML = chipsHTML([["all", "All"], ...data.categories.map((category) => [slug(category), category])]);

  $("[data-legend]").innerHTML = data.categories.map((category) => `
    <li><span class="legend__dot legend__dot--${slug(category)}"></span>${category}</li>`).join("");

  $("[data-pins]").innerHTML = data.places.map((place) => `
    <a class="map__pin map__pin--${slug(place.category)}" href="#${place.id}"
       style="--x: ${place.map.x}%; --y: ${place.map.y}%" title="${escapeHTML(place.name)}">
      <span class="visually-hidden">${escapeHTML(place.name)}</span>
    </a>`).join("");

  $("[data-place-list]").innerHTML = data.places.map((place) => `
    <li id="${place.id}" class="place" data-category="${slug(place.category)}"
        data-search="${escapeHTML(`${place.name} ${place.region} ${place.category}`.toLowerCase())}">
      <span class="place__dot place__dot--${slug(place.category)}"></span>
      <div>
        <h3 class="place__name"><a href="${placeUrl(place)}">${escapeHTML(place.name)}</a></h3>
        <p class="place__meta">${regionLabel(place.region)} · ★ ${place.rating.toFixed(1)}</p>
      </div>
    </li>`).join("");

  const rows = $$(".place");
  const input = $(".search__input");
  let category = "all";
  let query = "";

  function update() {
    let shown = 0;
    rows.forEach((row) => {
      const match = (category === "all" || row.dataset.category === category) && row.dataset.search.includes(query);
      row.hidden = !match;
      $(`.map__pin[href="#${row.id}"]`).hidden = !match;
      if (match) shown++;
    });
    $(".places .empty").hidden = shown > 0;
  }

  setupChips($("[data-chips]"), (value) => { category = value; update(); });

  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    update();
  });

  $(".search__form").addEventListener("submit", (event) => {
    event.preventDefault();
    const first = rows.find((row) => !row.hidden);
    if (query && first) location.hash = first.id;
  });

  if (location.hash) {
    const target = location.hash;
    history.replaceState(null, "", location.pathname);
    location.hash = target;
  }
}
