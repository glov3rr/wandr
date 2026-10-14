import { $, $$, escapeHTML, cedis, formatDate, nightsBetween, plural, todayISO } from "../lib/dom.js";
import { openDialog, toast, promptSignIn, whileBusy } from "../lib/ui.js";
import { placeUrl, regionLabel } from "../lib/data.js";
import { getUser, trips, bookings } from "../lib/store.js";

const STATUS = { draft: "Draft", planned: "Planned", booked: "Booked" };

const tagsHTML = (ids, data) => ids
  .map((id) => data.place(id))
  .filter(Boolean)
  .map((place) => `<li class="tag">${escapeHTML(place.name)}</li>`)
  .join("");

function mainRegion(trip, data) {
  const regions = trip.stops.map((id) => data.place(id)?.region).filter(Boolean);
  if (!regions.length) return "";
  const counts = regions.reduce((all, region) => ({ ...all, [region]: (all[region] || 0) + 1 }), {});
  return regionLabel(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
}

function datesText(trip, data) {
  const region = mainRegion(trip, data);
  const dates = !trip.start ? "Dates not set"
    : trip.start === trip.end ? formatDate(trip.start)
    : `${formatDate(trip.start)} – ${formatDate(trip.end)}`;
  return region ? `${dates} · ${region}` : dates;
}

function tripHTML(trip, data) {
  const days = trip.start && trip.end ? nightsBetween(trip.start, trip.end) + 1 : "—";
  return `
    <li>
      <article class="trip" data-trip-id="${trip.id}" data-stops="${trip.stops.join(",")}">
        <div class="trip__head">
          <h3 class="trip__name"><button class="link-btn" type="button" data-trip-details>${escapeHTML(trip.name)}</button></h3>
          <p class="trip__status trip__status--${trip.status}">${STATUS[trip.status] || "Planned"}</p>
        </div>
        <p class="trip__dates">${datesText(trip, data)}</p>
        <dl class="trip__stats">
          <div><dt>Days</dt><dd>${days}</dd></div>
          <div><dt>Stops</dt><dd>${trip.stops.length}</dd></div>
          <div><dt>Travellers</dt><dd>${trip.travellers}</dd></div>
          <div><dt>Total</dt><dd>${trip.budget ? cedis(trip.budget) : "—"}</dd></div>
        </dl>
        <ul class="tags">${tagsHTML(trip.stops, data)}</ul>
      </article>
    </li>`;
}

function bookingHTML(booking, data) {
  const hotel = data.hotel(booking.hotelId);
  const nights = nightsBetween(booking.checkIn, booking.checkOut);
  return `
    <li class="booking-item" data-booking-id="${booking.id}">
      <div>
        <p class="booking-item__name">${escapeHTML(hotel ? hotel.name : booking.hotelId)}</p>
        <p class="booking-item__meta">${formatDate(booking.checkIn)} – ${formatDate(booking.checkOut)}
          · ${plural(nights, "night")} · ${plural(booking.guests, "guest")} · Request sent</p>
      </div>
      <div class="booking-item__side">
        <span class="booking-item__total">${hotel ? cedis(hotel.price * nights) : ""}</span>
        <button class="btn btn--danger" type="button" data-cancel-booking>Cancel</button>
      </div>
    </li>`;
}

export default function tripsPage(data) {
  const form = $("[data-trip-form]");
  const tripList = $("[data-trip-list]");
  const note = $("[data-trips-note]");
  let myTrips = [];
  let myBookings = [];

  $("[data-attraction-options]").innerHTML = data.places.map((place) => `
    <label class="check"><input type="checkbox" name="attractions" value="${place.id}"> ${escapeHTML(place.name)}</label>`).join("");

  function countText() {
    const upcoming = myTrips.filter((trip) => trip.start && trip.end >= todayISO()).length;
    $("[data-trip-count]").textContent = `${myTrips.length} saved, ${upcoming} upcoming`;
  }

  function renderTrips() {
    tripList.innerHTML = myTrips.length
      ? myTrips.map((trip) => tripHTML(trip, data)).join("")
      : `<li class="trip-list__empty">No trips yet. Pick a package below or plan your own.</li>`;
    countText();
  }

  function renderBookings() {
    $("[data-bookings]").hidden = myBookings.length === 0;
    $("[data-booking-list]").innerHTML = myBookings.map((booking) => bookingHTML(booking, data)).join("");
  }

  async function loadMine() {
    if (!getUser()) {
      note.hidden = false;
      note.innerHTML = `These are example trips. <a href="signin.html?next=trips.html">Sign in</a> to save your own.`;
      $$("[data-stop-tags]").forEach((list) => {
        list.innerHTML = tagsHTML(list.closest("[data-stops]").dataset.stops.split(","), data);
      });
      $("[data-trip-count]").textContent = "Example trips";
      $("[data-bookings]").hidden = true;
      return;
    }
    note.hidden = true;
    tripList.innerHTML = `<li class="loading">Loading your trips…</li>`;
    try {
      [myTrips, myBookings] = await Promise.all([trips.list(), bookings.list()]);
      renderTrips();
      renderBookings();
    } catch (error) {
      tripList.innerHTML = `<li class="trip-list__empty">${escapeHTML(error.message)}</li>`;
    }
  }

  tripList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trip-details]");
    if (!button) return;
    const card = button.closest(".trip");
    const stops = card.dataset.stops.split(",").map((id) => data.place(id)).filter(Boolean);
    const stats = $$(".trip__stats > div", card)
      .map((pair) => `<div><span>${$("dt", pair).textContent}</span><strong>${$("dd", pair).textContent}</strong></div>`)
      .join("");
    const id = card.dataset.tripId;

    const dialog = openDialog({
      title: escapeHTML(button.textContent),
      body: `
        <p>${$(".trip__dates", card).textContent}</p>
        <div class="summary">${stats}</div>
        <ol class="stop-list">
          ${stops.map((place, index) => `<li>${index + 1}. <a href="${placeUrl(place)}">${escapeHTML(place.name)}</a></li>`).join("")}
        </ol>
        ${id ? `<div class="trip__actions"><button class="btn btn--danger" type="button" data-delete-trip>Delete trip</button></div>` : ""}`,
    });

    $("[data-delete-trip]", dialog)?.addEventListener("click", async (click) => {
      try {
        await whileBusy(click.currentTarget, "Deleting…", () => trips.remove(id));
        myTrips = myTrips.filter((trip) => trip.id !== id);
        renderTrips();
        dialog.close();
        toast("Trip deleted.");
      } catch (error) {
        toast(error.message);
      }
    });
  });

  $("[data-booking-list]").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-cancel-booking]");
    if (!button) return;
    const id = button.closest("[data-booking-id]").dataset.bookingId;
    try {
      await whileBusy(button, "Cancelling…", () => bookings.remove(id));
      myBookings = myBookings.filter((booking) => booking.id !== id);
      renderBookings();
      toast("Booking request cancelled.");
    } catch (error) {
      toast(error.message);
    }
  });

  $$("[data-package]").forEach((button) => {
    button.addEventListener("click", () => {
      const stops = button.dataset.stops.split(",");
      form.elements["trip-name"].value = button.dataset.package;
      $$('input[name="attractions"]', form).forEach((box) => { box.checked = stops.includes(box.value); });
      $("#plan").scrollIntoView({ behavior: "smooth" });
      form.elements.start.focus({ preventScroll: true });
      toast(`${button.dataset.package} added to your plan. Pick your dates to save it.`);
    });
  });

  form.elements.start.addEventListener("change", () => {
    form.elements.end.min = form.elements.start.value;
  });

  const error = document.createElement("p");
  error.className = "form__error";
  error.hidden = true;
  error.textContent = "Tick at least one attraction.";
  $("[data-attraction-options]").closest("fieldset").append(error);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const ticked = $$('input[name="attractions"]:checked', form).map((box) => box.value);
    error.hidden = ticked.length > 0;
    if (!form.reportValidity() || ticked.length === 0) return;
    if (!getUser()) {
      promptSignIn("Sign in to save trips", "Sign in and Wandr keeps your trips, so you can open them on any device.");
      return;
    }

    const name = form.elements["trip-name"].value.trim();
    try {
      const trip = await whileBusy($('button[type="submit"]', form), "Saving…", () => trips.add({
        name,
        start: form.elements.start.value,
        end: form.elements.end.value,
        travellers: Number(form.elements.travellers.value) || 1,
        budget: Number(form.elements.budget.value) || null,
        stops: ticked,
      }));
      myTrips = [trip, ...myTrips];
      renderTrips();
      form.reset();
      const card = $(`[data-trip-id="${trip.id}"]`, tripList);
      card.classList.add("is-new");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => card.classList.remove("is-new"), 3000);
      toast(`"${name}" saved to your trips.`);
    } catch (saveError) {
      toast(saveError.message);
    }
  });

  form.addEventListener("reset", () => { error.hidden = true; });

  loadMine();
  window.addEventListener("wandr:change", loadMine);
}
