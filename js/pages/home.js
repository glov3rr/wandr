import { $, $$, plural } from "../lib/dom.js";
import { setupChips, chipsHTML, toast } from "../lib/ui.js";
import { slug } from "../lib/data.js";
import { getUser } from "../lib/store.js";
import { placeCard } from "../components/cards.js";

const ACCRA = { x: 64.5, y: 84.6 };

function greet() {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const user = getUser();
  $("[data-greeting]").textContent = `Good ${part}${user ? `, ${user.name.split(" ")[0]}` : ""}`;
}

export default function home(data) {
  greet();
  window.addEventListener("wandr:change", greet);

  const distance = (place) => Math.hypot(place.map.x - ACCRA.x, place.map.y - ACCRA.y);
  const nearby = [...data.places].sort((a, b) => distance(a) - distance(b)).slice(0, 6);

  $('[data-list="featured"]').innerHTML = data.places.filter((place) => place.featured).map((place) => placeCard(place)).join("");
  $('[data-list="nearby"]').innerHTML = nearby.map((place) => placeCard(place, { row: true })).join("");

  const chips = $("[data-chips]");
  chips.innerHTML = chipsHTML([["all", "All"], ...data.categories.map((category) => [slug(category), category])]);

  const lists = $$("[data-list]");
  const input = $(".search__input");
  let category = "all";
  let query = "";

  function update() {
    lists.forEach((list) => {
      let shown = 0;
      $$(":scope > li", list).forEach((item) => {
        const match = (category === "all" || item.dataset.category === category) && item.dataset.search.includes(query);
        item.hidden = !match;
        if (match) shown++;
      });
      list.nextElementSibling.hidden = shown > 0;
    });
  }

  setupChips(chips, (value) => { category = value; update(); });

  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    update();
  });

  $(".search__form").addEventListener("submit", (event) => {
    event.preventDefault();
    update();
    const count = $$("[data-list] > li:not([hidden])").length;
    if (query) toast(`${plural(count, "result")} for "${input.value.trim()}"`);
  });
}
