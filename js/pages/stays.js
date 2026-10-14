import { $, $$, escapeHTML, cedis, formatDate, nightsBetween, plural, todayISO } from "../lib/dom.js";
import { openDialog, toast, promptSignIn } from "../lib/ui.js";
import { getUser, bookings } from "../lib/store.js";
import { regionLabel } from "../lib/data.js";
import { hotelCard } from "../components/cards.js";

function openBooking(hotel) {
  const today = todayISO();
  openDialog({
    title: escapeHTML(hotel.name),
    submitLabel: "Request booking",
    body: `
      <p class="modal__note">${escapeHTML(hotel.area)} · ${cedis(hotel.price)} a night</p>
      <div class="modal__row">
        <p class="field">
          <label class="field__label" for="bk-in">Check in</label>
          <input class="field__input" id="bk-in" name="checkin" type="date" min="${today}" required>
        </p>
        <p class="field">
          <label class="field__label" for="bk-out">Check out</label>
          <input class="field__input" id="bk-out" name="checkout" type="date" min="${today}" required>
        </p>
      </div>
      <p class="field">
        <label class="field__label" for="bk-guests">Guests</label>
        <input class="field__input" id="bk-guests" name="guests" type="number" min="1" max="6" value="2" required>
      </p>
      <div class="summary" data-summary>
        <div><span>Pick your dates to see the total.</span></div>
      </div>`,
    onOpen(dialog) {
      const form = $("form", dialog);
      form.addEventListener("input", () => {
        const { checkin, checkout } = form.elements;
        if (checkin.value) checkout.min = checkin.value;
        const nights = checkin.value && checkout.value ? nightsBetween(checkin.value, checkout.value) : 0;
        $("[data-summary]", dialog).innerHTML = nights > 0
          ? `<div><span>${cedis(hotel.price)} × ${plural(nights, "night")}</span><span>${cedis(hotel.price * nights)}</span></div>
             <div class="summary__total"><span>Total</span><span>${cedis(hotel.price * nights)}</span></div>`
          : `<div><span>Pick your dates to see the total.</span></div>`;
      });
    },
    onSubmit(form) {
      const { checkin, checkout } = form.elements;
      const nights = nightsBetween(checkin.value, checkout.value);
      if (nights < 1) {
        checkout.setCustomValidity("Check out has to be after check in.");
        checkout.reportValidity();
        checkout.addEventListener("input", () => checkout.setCustomValidity(""), { once: true });
        return false;
      }
      if (!getUser()) {
        promptSignIn("Sign in to book", "Sign in and Wandr keeps your booking requests together on your trips page.");
        return;
      }
      bookings.add({
        hotelId: hotel.id,
        checkIn: checkin.value,
        checkOut: checkout.value,
        guests: Number(form.elements.guests.value),
      })
        .then(() => toast(`Booking request saved: ${hotel.name}, ${plural(nights, "night")} from ${formatDate(checkin.value)}. See it on your trips page.`))
        .catch((error) => toast(error.message));
    },
  });
}

export default function stays(data) {
  const form = $("[data-stay-filters]");
  const list = $("[data-stay-list]");
  const price = form.elements.price;
  const readout = $(".field__readout", form);
  const regions = [...new Set(data.hotels.map((hotel) => hotel.region))].sort();
  const highest = Math.ceil(Math.max(...data.hotels.map((hotel) => hotel.price)) / 500) * 500;

  $("[data-hotel-summary]").textContent =
    `${plural(data.hotels.length, "property", "properties")} across ${plural(regions.length, "region")} · prices are examples, not live rates`;

  form.elements.region.insertAdjacentHTML("beforeend",
    regions.map((region) => `<option value="${escapeHTML(region)}">${regionLabel(region)}</option>`).join(""));

  $("[data-amenity-options]").innerHTML = Object.entries(data.amenities).map(([key, label]) => `
    <label class="check"><input type="checkbox" name="amenities" value="${key}"> ${label}</label>`).join("");

  price.max = highest;
  price.value = highest;
  price.defaultValue = highest;

  list.innerHTML = data.hotels.map((hotel) => hotelCard(hotel, data.amenities)).join("");
  const items = $$(":scope > li", list);
  const original = [...items];

  function showPrice() {
    readout.textContent = cedis(Number(price.value)) + (Number(price.value) >= Number(price.max) ? "+" : "");
  }

  function applyFilters() {
    showPrice();
    const region = form.elements.region.value;
    const maxPrice = Number(price.value);
    const minRating = form.elements.rating.value === "any" ? 0 : Number(form.elements.rating.value);
    const wanted = $$('input[name="amenities"]:checked', form).map((box) => box.value);

    let shown = 0;
    items.forEach((item) => {
      const has = item.dataset.amenities.split(" ");
      const match =
        (!region || item.dataset.region === region) &&
        Number(item.dataset.price) <= maxPrice &&
        Number(item.dataset.rating) >= minRating &&
        wanted.every((amenity) => has.includes(amenity));
      item.hidden = !match;
      if (match) shown++;
    });

    $("[data-result-count]").textContent = plural(shown, "property", "properties");
    list.nextElementSibling.hidden = shown > 0;
    return shown;
  }

  form.addEventListener("input", applyFilters);
  form.addEventListener("reset", () => setTimeout(applyFilters));

  const toggle = $(".filters__toggle");
  function setFiltersOpen(open) {
    $(".filters").classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", open);
    toggle.textContent = open ? "Hide filters" : "Show filters";
  }
  toggle.addEventListener("click", () => setFiltersOpen(!$(".filters").classList.contains("is-open")));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const shown = applyFilters();
    setFiltersOpen(false);
    toast(`Showing ${plural(shown, "stay")}.`);
  });

  $("#sort").addEventListener("change", (event) => {
    const by = event.target.value;
    const sorted = [...items].sort((a, b) => {
      if (by === "price-low") return a.dataset.price - b.dataset.price;
      if (by === "price-high") return b.dataset.price - a.dataset.price;
      if (by === "rating") return b.dataset.rating - a.dataset.rating;
      return original.indexOf(a) - original.indexOf(b);
    });
    list.append(...sorted);
  });

  list.addEventListener("click", (event) => {
    if (!event.target.closest("[data-book]")) return;
    openBooking(data.hotel(event.target.closest("li").dataset.hotel));
  });

  applyFilters();

  const requested = data.hotel(new URLSearchParams(location.search).get("book"));
  if (requested) {
    $(`[data-hotel="${requested.id}"]`, list).scrollIntoView({ block: "center" });
    openBooking(requested);
  }
}
