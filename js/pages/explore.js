import { $, $$, escapeHTML, plural } from "../lib/dom.js";
import { setupChips, chipsHTML } from "../lib/ui.js";
import { placeUrl, regionLabel, slug, imageSrc } from "../lib/data.js";

export default function explore(data) {
  $("[data-explore-summary]").textContent =
    `${plural(data.places.length, "place")} across ${plural(data.regions.length, "region")}`;

  $("[data-chips]").innerHTML = chipsHTML([["all", "All"], ...data.categories.map((category) => [slug(category), category])]);

  $("[data-legend]").innerHTML = data.categories.map((category) => `
    <li><span class="legend__dot legend__dot--${slug(category)}"></span>${category}</li>`).join("");

  $("[data-pins]").innerHTML = data.places.map((place) => `
    <a class="map__pin map__pin--${slug(place.category)}" href="${placeUrl(place)}" data-id="${place.id}"
       style="--x: ${place.map.x}%; --y: ${place.map.y}%">
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

  setupPinCards(data);

  const rows = $$(".place");
  const input = $(".search__input");
  let category = "all";
  let query = "";

  function update() {
    let shown = 0;
    rows.forEach((row) => {
      const match = (category === "all" || row.dataset.category === category) && row.dataset.search.includes(query);
      row.hidden = !match;
      $(`.map__pin[data-id="${row.id}"]`).hidden = !match;
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

function teaser(place) {
  const first = place.about[0].split(/(?<=\.)\s/)[0];
  if (first.length <= 120) return first;
  const cut = first.slice(0, 120);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:]$/, "") + "…";
}

function setupPinCards(data) {
  const map = $(".map");
  const card = document.createElement("div");
  card.className = "map-card";
  card.hidden = true;
  map.append(card);

  let current = null;
  let hideTimer;

  function show(pin, touch = false) {
    clearTimeout(hideTimer);
    card.classList.toggle("map-card--passive", !touch);
    if (current === pin) return;
    const place = data.place(pin.dataset.id);
    current = pin;
    card.innerHTML = `
      <img class="map-card__img" src="${imageSrc(place.image)}" alt="">
      <div class="map-card__body">
        <p class="map-card__tag map-card__tag--${slug(place.category)}">${place.category}</p>
        <h3 class="map-card__name">${escapeHTML(place.name)}</h3>
        <p class="map-card__meta">${regionLabel(place.region)} · ★ ${place.rating.toFixed(1)}</p>
        <p class="map-card__text">${escapeHTML(teaser(place))}</p>
        <a class="map-card__link" href="${placeUrl(place)}">View place ›</a>
        <p class="map-card__hint">Click the pin to open</p>
      </div>`;
    card.hidden = false;
    positionCard(pin);
    $$(".map__pin.is-active").forEach((other) => other.classList.remove("is-active"));
    pin.classList.add("is-active");
  }

  function positionCard(pin) {
    const gap = 10;
    const area = pin.parentElement;
    const pinX = (parseFloat(pin.style.getPropertyValue("--x")) / 100) * area.clientWidth;
    const pinY = (parseFloat(pin.style.getPropertyValue("--y")) / 100) * area.clientHeight;
    const left = Math.min(Math.max(pinX - card.offsetWidth / 2, gap), map.clientWidth - card.offsetWidth - gap);
    const above = pinY - 26 - card.offsetHeight;
    const top = above >= gap ? above : Math.min(pinY + 10, map.clientHeight - card.offsetHeight - gap);
    card.style.left = left + "px";
    card.style.top = top + "px";
  }

  function hide() {
    hideTimer = setTimeout(() => {
      card.hidden = true;
      current?.classList.remove("is-active");
      current = null;
    }, 180);
  }

  $$(".map__pin", map).forEach((pin) => {
    pin.addEventListener("pointerenter", (event) => {
      if (event.pointerType === "mouse") show(pin);
    });
    pin.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse") hide();
    });
    pin.addEventListener("focus", () => {
      if (pin.matches(":focus-visible")) show(pin);
    });
    pin.addEventListener("blur", hide);
    pin.addEventListener("click", (event) => {
      if (current !== pin) {
        event.preventDefault();
        show(pin, true);
      }
    });
  });

  card.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  card.addEventListener("pointerleave", hide);
  card.addEventListener("focusin", () => clearTimeout(hideTimer));
  card.addEventListener("focusout", hide);

  document.addEventListener("pointerdown", (event) => {
    if (!card.hidden && !card.contains(event.target) && !event.target.closest(".map__pin")) {
      card.hidden = true;
      current?.classList.remove("is-active");
      current = null;
    }
  });

  window.addEventListener("resize", () => {
    if (current) positionCard(current);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !card.hidden) {
      card.hidden = true;
      current?.classList.remove("is-active");
      current = null;
    }
  });
}
