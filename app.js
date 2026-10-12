/* ==========================================================================
   WANDR — app.js
   One script for every page. Each section starts by looking for the
   elements it needs. If they aren't on the current page, that section
   stops straight away and does nothing — so the Stays code never runs on
   the Home page, and so on.

   Nothing here talks to a server yet. Buttons show a short message (a
   "toast") instead of saving anything; when there's a backend, those are
   the spots where a fetch() call would go.

   Order:
     1. Helpers           — small tools the rest of the file uses
     2. Every page        — phone menu, footer dialogs, dates
     3. Home              — greeting, search, category chips
     4. Explore           — search and chips for the map and the list
     5. Trips             — saved trip details, packages, the plan form
     6. Stays             — filters, sorting, booking a hotel
     7. Attraction pages  — plan-a-visit panel, photo viewer
     8. Community         — switching rooms, sending messages
     9. Sign in           — tabs, checking each field, the done message
   ========================================================================== */

document.documentElement.classList.add("js");   // lets the CSS know JS is running


/* --------------------------------------------------------------------------
   1. HELPERS
   -------------------------------------------------------------------------- */

// Shorthand for the two ways we find things on the page.
// $ returns the first match; $$ returns every match as a real array.
const $  = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Anything a visitor types must be escaped before it goes into innerHTML,
// otherwise typing "<b>" into the chat box would turn into real HTML.
function escapeHTML(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "2027-02-14" -> "Sun 14 Feb 2027"
function formatDate(isoDate) {
  return new Date(isoDate + "T00:00").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// 2640 -> "GHS 2,640"
const cedis = (amount) => "GHS " + amount.toLocaleString("en-GB");

// Today's date as "YYYY-MM-DD", the format date inputs use.
function todayISO() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

// Whole nights between two "YYYY-MM-DD" dates.
function nightsBetween(start, end) {
  const ms = new Date(end + "T00:00") - new Date(start + "T00:00");
  return Math.round(ms / 86400000);
}

// Every attraction, keyed by the short id used in forms and on the map.
const PLACES = {
  "kakum":      { name: "Kakum National Park",         page: "kakum.html" },
  "cape-coast": { name: "Cape Coast Castle",           page: "cape-coast-castle.html" },
  "elmina":     { name: "Elmina Castle",               page: "elmina-castle.html" },
  "nkrumah":    { name: "Kwame Nkrumah Memorial Park", page: "kwame-nkrumah.html" },
  "mole":       { name: "Mole National Park",          page: "mole.html" },
  "aburi":      { name: "Aburi Botanical Gardens",     page: "aburi.html" },
  "wli":        { name: "Wli Waterfalls",              page: "wli-waterfalls.html" },
  "shai":       { name: "Shai Hills Resource Reserve", page: "shai-hills.html" },
  "labadi":     { name: "Labadi Beach",                page: "labadi-beach.html" },
  "afadjato":   { name: "Mount Afadja",                page: "afadjato.html" },
  "lake-volta": { name: "Lake Volta",                  page: "lake-volta.html" },
};


/* --- TOAST ---------------------------------------------------------------
   toast("Trip saved") slides a message up from the bottom for 3.5 seconds.
   There's one toast element for the whole page, made the first time it's
   needed. role="status" makes screen readers read it out.               */
let toastTimer;

function toast(message) {
  let box = $(".toast");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.textContent = message;
  box.classList.add("is-visible");
  clearTimeout(toastTimer);                       // restart the clock if one is already showing
  toastTimer = setTimeout(() => box.classList.remove("is-visible"), 3500);
}


/* --- DIALOG ----------------------------------------------------------------
   openDialog({ title, body, submitLabel, onSubmit }) opens a pop-up.

   - body is HTML for the inside.
   - If submitLabel is given, the body is wrapped in a <form> with a submit
     button. When it's submitted (and the browser's own checks pass),
     onSubmit(form) runs. If onSubmit returns false, the dialog stays open.
   - onOpen(dialog) runs after it's on screen — for live updates inside it.

   It uses the built-in <dialog> element: showModal() darkens the page,
   keeps Tab inside the dialog, and closes on Escape without any extra code. */
function openDialog({ title, body, submitLabel, cancelLabel = "Cancel", onSubmit, onOpen, className = "" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "modal " + className;

  const actions = submitLabel
    ? `<div class="modal__actions">
         <button class="btn" type="button" data-close>${cancelLabel}</button>
         <button class="btn btn--solid" type="submit">${submitLabel}</button>
       </div>`
    : "";

  const inner = submitLabel
    ? `<form class="modal__body" novalidate>${body}${actions}</form>`
    : `<div class="modal__body">${body}</div>`;

  dialog.innerHTML = `
    <div class="modal__head">
      <h2 class="modal__title">${title}</h2>
      <button class="modal__close" type="button" data-close aria-label="Close">×</button>
    </div>
    ${inner}`;

  document.body.append(dialog);
  dialog.showModal();

  // Any element marked data-close closes the dialog.
  $$("[data-close]", dialog).forEach((btn) =>
    btn.addEventListener("click", () => dialog.close()));

  // Clicking the dark area outside the box closes it too. A click on the
  // backdrop reports the <dialog> itself as its target.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // Remove it from the page once closed, so dialogs don't pile up.
  dialog.addEventListener("close", () => dialog.remove());

  const form = $("form", dialog);
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();                     // stop the page reloading
      if (!form.reportValidity()) return;         // shows the browser's own "please fill in" bubbles
      if (onSubmit(form) !== false) dialog.close();
    });
  }

  if (onOpen) onOpen(dialog);
  return dialog;
}


/* --- CHIP GROUP --------------------------------------------------------------
   Makes a row of filter chips behave like radio buttons: clicking one turns
   it on and the others off, then calls onChange with its data-filter value. */
function setupChips(container, onChange) {
  const chips = $$("[data-filter]", container);

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((c) => {
        const on = c === chip;
        c.classList.toggle("chip--active", on);
        c.setAttribute("aria-pressed", on);
      });
      onChange(chip.dataset.filter);
    });
  });
}


/* --------------------------------------------------------------------------
   2. EVERY PAGE
   -------------------------------------------------------------------------- */

// --- Phone menu: the three-line button opens and closes the nav. ---
(function setupMenu() {
  const header = $(".site-header");
  const toggle = $(".menu-toggle");
  if (!header || !toggle) return;

  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");   // toggle returns the new state
    toggle.setAttribute("aria-expanded", open);
  });
})();


// --- About, Contact, Privacy: any button with data-dialog. ---
const DIALOGS = {
  about: () => openDialog({
    title: "About Wandr",
    body: `
      <p>Wandr helps you plan travel in Ghana in one place: find attractions,
         build a trip, book somewhere to stay and ask other travellers.</p>
      <p>It started as a mobile app concept for a university project and is
         being rebuilt as a website, one page at a time.</p>`,
  }),

  contact: () => openDialog({
    title: "Contact us",
    submitLabel: "Send message",
    body: `
      <p class="field">
        <label class="field__label" for="ct-email">Your email</label>
        <input class="field__input" id="ct-email" name="email" type="email" required>
      </p>
      <p class="field">
        <label class="field__label" for="ct-message">Message</label>
        <textarea class="field__input" id="ct-message" name="message" rows="4" required></textarea>
      </p>`,
    onSubmit() { toast("Message sent. We'll reply by email."); },
  }),

  privacy: () => openDialog({
    title: "Privacy",
    body: `
      <p>Wandr doesn't have accounts or a database yet. Nothing you type into
         a form is sent anywhere or saved: it disappears when you leave or
         reload the page.</p>
      <p>The only outside request the site makes is for its font, from Google Fonts.</p>`,
  }),
};

$$("[data-dialog]").forEach((button) => {
  button.addEventListener("click", () => DIALOGS[button.dataset.dialog]());
});


// --- No date input on the site should accept a day in the past. ---
$$('input[type="date"]').forEach((input) => { input.min = todayISO(); });


/* --------------------------------------------------------------------------
   3. HOME — greeting, search box and category chips
   -------------------------------------------------------------------------- */
(function setupHome() {
  const lists = $$("[data-filter-list]");
  if (!lists.length) return;

  // Greeting changes with the time of day.
  const greeting = $("[data-greeting]");
  if (greeting) {
    const hour = new Date().getHours();
    const part = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    greeting.textContent = `Good ${part}, Kofi`;
  }

  let category = "all";
  let query = "";

  // Show a card only if it matches BOTH the chip and the search box.
  function update() {
    lists.forEach((list) => {
      let shown = 0;
      $$(":scope > li", list).forEach((item) => {
        const tag = $(".card__tag", item).textContent.trim().toLowerCase();
        const text = item.textContent.toLowerCase();
        const match = (category === "all" || tag === category) && text.includes(query);
        item.hidden = !match;
        if (match) shown++;
      });
      // The "No places match" message sits right after each list.
      list.nextElementSibling.hidden = shown > 0;
    });
  }

  setupChips($(".chips"), (value) => { category = value; update(); });

  // Filter as you type ("input" fires on every keystroke)...
  const form = $(".search__form");
  const input = $(".search__input");
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    update();
  });

  // ...and pressing Search just stops the page from reloading.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    update();
    const count = $$("[data-filter-list] > li:not([hidden])").length;
    if (query) toast(`${count} result${count === 1 ? "" : "s"} for "${input.value.trim()}"`);
  });
})();


/* --------------------------------------------------------------------------
   4. EXPLORE — the same search + chips, applied to map pins and the list
   -------------------------------------------------------------------------- */
(function setupExplore() {
  const rows = $$(".place");
  if (!rows.length) return;

  let category = "all";
  let query = "";

  function update() {
    let shown = 0;
    rows.forEach((row) => {
      const match = (category === "all" || row.dataset.category === category)
                    && row.textContent.toLowerCase().includes(query);
      row.hidden = !match;
      // Each pin's href is "#" + the row's id, which is how we find it.
      $(`.map__pin[href="#${row.id}"]`).hidden = !match;
      if (match) shown++;
    });
    $(".places .empty").hidden = shown > 0;
  }

  setupChips($(".chips"), (value) => { category = value; update(); });

  const input = $(".search__input");
  input.addEventListener("input", () => {
    query = input.value.trim().toLowerCase();
    update();
  });

  $(".search__form").addEventListener("submit", (event) => {
    event.preventDefault();
    const first = rows.find((row) => !row.hidden);
    if (query && first) location.hash = first.id;   // jump to and highlight the first match
  });
})();


/* --------------------------------------------------------------------------
   5. TRIPS
   -------------------------------------------------------------------------- */
(function setupTrips() {
  const form = $("[data-trip-form]");
  if (!form) return;

  const tripList = $("[data-trip-list]");

  // --- Clicking a saved trip's name shows its details. ---
  // Uses "event delegation": one listener on the whole list, instead of one
  // per trip. That way trips added later by the form work too.
  tripList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trip-details]");
    if (!button) return;

    const trip = button.closest(".trip");
    const stops = trip.dataset.stops.split(",").filter(Boolean);
    const stats = $$(".trip__stats > div", trip)
      .map((pair) => `<div><span>${$("dt", pair).textContent}</span><strong>${$("dd", pair).textContent}</strong></div>`)
      .join("");

    openDialog({
      title: escapeHTML(button.textContent),
      body: `
        <p>${$(".trip__dates", trip).textContent}</p>
        <div class="summary">${stats}</div>
        <ol class="stop-list">
          ${stops.map((id, i) => `<li>${i + 1}. <a href="${PLACES[id].page}">${PLACES[id].name}</a></li>`).join("")}
        </ol>`,
    });
  });

  // --- "Book this package" fills in the form below for you. ---
  $$("[data-package]").forEach((button) => {
    button.addEventListener("click", () => {
      const stops = button.dataset.stops.split(",");
      form.elements["trip-name"].value = button.dataset.package;
      $$('input[name="attractions"]', form).forEach((box) => {
        box.checked = stops.includes(box.value);
      });
      $("#plan").scrollIntoView({ behavior: "smooth" });
      form.elements.start.focus({ preventScroll: true });
      toast(`${button.dataset.package} added to your plan. Pick your dates to save it.`);
    });
  });

  // --- The plan form ---
  // The end date can't come before the start date: whenever the start
  // changes, move the end date's minimum along with it.
  form.elements.start.addEventListener("change", () => {
    form.elements.end.min = form.elements.start.value;
  });

  // An error line under the Attractions box, made once and reused.
  const attractionsBox = $(".check-grid", form).closest("fieldset");
  const error = document.createElement("p");
  error.className = "form__error";
  error.hidden = true;
  error.textContent = "Tick at least one attraction.";
  attractionsBox.append(error);

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const ticked = $$('input[name="attractions"]:checked', form).map((box) => box.value);
    error.hidden = ticked.length > 0;

    // reportValidity() checks the required fields, dates and numbers and
    // shows the browser's message on the first one that's wrong.
    if (!form.reportValidity() || ticked.length === 0) return;

    const name = form.elements["trip-name"].value.trim();
    const start = form.elements.start.value;
    const end = form.elements.end.value;
    const travellers = form.elements.travellers.value;
    const budget = Number(form.elements.budget.value);
    const days = nightsBetween(start, end) + 1;

    // Build a new trip card with exactly the same markup as the saved ones.
    const item = document.createElement("li");
    item.innerHTML = `
      <article class="trip is-new" data-stops="${ticked.join(",")}">
        <div class="trip__head">
          <h3 class="trip__name"><button class="link-btn" type="button" data-trip-details>${escapeHTML(name)}</button></h3>
          <p class="trip__status trip__status--planned">Planned</p>
        </div>
        <p class="trip__dates">${formatDate(start)} – ${formatDate(end)}</p>
        <dl class="trip__stats">
          <div><dt>Days</dt><dd>${days}</dd></div>
          <div><dt>Stops</dt><dd>${ticked.length}</dd></div>
          <div><dt>Travellers</dt><dd>${travellers}</dd></div>
          <div><dt>Total</dt><dd>${budget ? cedis(budget) : "—"}</dd></div>
        </dl>
        <ul class="tags">
          ${ticked.map((id) => `<li class="tag">${PLACES[id].name}</li>`).join("")}
        </ul>
      </article>`;
    tripList.prepend(item);                     // newest trip first

    const count = $$(".trip", tripList).length;
    $("[data-trip-count]").textContent = `${count} saved, 1 upcoming`;

    form.reset();
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => $(".trip", item).classList.remove("is-new"), 3000);
    toast(`"${name}" saved to your trips.`);
  });

  form.addEventListener("reset", () => { error.hidden = true; });
})();


/* --------------------------------------------------------------------------
   6. STAYS
   -------------------------------------------------------------------------- */
(function setupStays() {
  const form = $("[data-stay-filters]");
  if (!form) return;

  const list = $("[data-stay-list]");
  const hotels = $$(":scope > li", list);
  const price = form.elements.price;
  const readout = $(".field__readout", form);

  // The number under the slider follows it as it moves.
  function showPrice() {
    readout.textContent = Number(price.value) >= Number(price.max)
      ? cedis(Number(price.value)) + "+"
      : cedis(Number(price.value));
  }

  // Hide every hotel that fails any of the four filters.
  function applyFilters() {
    showPrice();
    const region = form.elements.region.value;
    const maxPrice = Number(price.value);
    const minRating = form.elements.rating.value === "any" ? 0 : Number(form.elements.rating.value);
    const wanted = $$('input[name="amenities"]:checked', form).map((box) => box.value);

    let shown = 0;
    hotels.forEach((hotel) => {
      const has = hotel.dataset.amenities.split(" ");
      const match =
        (!region || hotel.dataset.region === region) &&
        Number(hotel.dataset.price) <= maxPrice &&
        Number(hotel.dataset.rating) >= minRating &&
        wanted.every((amenity) => has.includes(amenity));   // must have ALL ticked ones
      hotel.hidden = !match;
      if (match) shown++;
    });

    $("[data-result-count]").textContent = `${shown} ${shown === 1 ? "property" : "properties"}`;
    list.nextElementSibling.hidden = shown > 0;
    return shown;
  }

  // Filters apply the moment anything changes...
  form.addEventListener("input", applyFilters);

  // ...so Apply mainly matters on phones, where it also folds the filters away.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const shown = applyFilters();
    $(".filters").classList.remove("is-open");
    $(".filters__toggle").setAttribute("aria-expanded", false);
    $(".filters__toggle").textContent = "Show filters";
    toast(`Showing ${shown} ${shown === 1 ? "stay" : "stays"}.`);
  });

  // The reset event fires BEFORE the fields are cleared, so wait one tick.
  form.addEventListener("reset", () => setTimeout(applyFilters));

  // Sorting: re-append the <li>s in the new order. append() on an element
  // that's already in the list moves it rather than copying it.
  const original = [...hotels];
  $("#sort").addEventListener("change", (event) => {
    const by = event.target.value;
    const sorted = [...hotels].sort((a, b) => {
      if (by === "price-low")  return a.dataset.price - b.dataset.price;
      if (by === "price-high") return b.dataset.price - a.dataset.price;
      if (by === "rating")     return b.dataset.rating - a.dataset.rating;
      return original.indexOf(a) - original.indexOf(b);       // "Recommended" = the starting order
    });
    list.append(...sorted);
  });

  // Phone-only "Show filters" button.
  const toggle = $(".filters__toggle");
  toggle.addEventListener("click", () => {
    const open = $(".filters").classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
    toggle.textContent = open ? "Hide filters" : "Show filters";
  });

  // --- Booking: the hotel name and the Book button both open this. ---
  list.addEventListener("click", (event) => {
    if (!event.target.closest("[data-book]")) return;
    const hotel = event.target.closest("li");
    openBooking({
      name: $(".stay__name", hotel).textContent.trim(),
      where: $(".stay__where", hotel).textContent.trim(),
      nightly: Number(hotel.dataset.price),
    });
  });

  function openBooking({ name, where, nightly }) {
    const today = todayISO();
    openDialog({
      title: escapeHTML(name),
      submitLabel: "Request booking",
      body: `
        <p class="modal__note">${escapeHTML(where)} · ${cedis(nightly)} a night</p>
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

      // Recalculate the total whenever a date changes.
      onOpen(dialog) {
        const form = $("form", dialog);
        form.addEventListener("input", () => {
          const { checkin, checkout } = form.elements;
          if (checkin.value) checkout.min = checkin.value;
          const nights = checkin.value && checkout.value ? nightsBetween(checkin.value, checkout.value) : 0;
          $("[data-summary]", dialog).innerHTML = nights > 0
            ? `<div><span>${cedis(nightly)} × ${nights} night${nights === 1 ? "" : "s"}</span><span>${cedis(nightly * nights)}</span></div>
               <div class="summary__total"><span>Total</span><span>${cedis(nightly * nights)}</span></div>`
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
          return false;                        // keep the dialog open
        }
        toast(`Booking request sent: ${name}, ${nights} night${nights === 1 ? "" : "s"} from ${formatDate(checkin.value)}.`);
      },
    });
  }
})();


/* --------------------------------------------------------------------------
   7. ATTRACTION PAGES
   -------------------------------------------------------------------------- */
(function setupAttraction() {
  const panel = $(".booking");
  if (!panel) return;

  const placeName = $(".hero__title").textContent.trim();
  const form = $("form", panel);

  // --- Add to trip ---
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const adults = Number(form.elements.adults.value);
    const students = Number(form.elements.students.value);
    let people = `${adults} adult${adults === 1 ? "" : "s"}`;
    if (students) people += `, ${students} student${students === 1 ? "" : "s"}`;

    toast(`${placeName} added to your trip for ${formatDate(form.elements["visit-date"].value)} · ${people}.`);
  });

  // --- Save for later: a button that stays pressed ---
  const save = $("[data-save]", panel);
  save.addEventListener("click", () => {
    const saved = save.getAttribute("aria-pressed") !== "true";
    save.setAttribute("aria-pressed", saved);
    save.textContent = saved ? "Saved ✓" : "Save for later";
    toast(saved ? `${placeName} saved for later.` : `${placeName} removed from your saved places.`);
  });

  // --- Photo viewer ---
  const photos = $$(".gallery img");
  $$(".gallery__btn").forEach((button, index) => {
    button.addEventListener("click", () => openViewer(index));
  });

  function openViewer(startIndex) {
    let index = startIndex;

    const dialog = openDialog({
      title: escapeHTML(placeName),
      className: "modal--photo",
      body: `
        <img class="photo__img" alt="">
        <div class="photo__bar">
          <button class="btn" type="button" data-step="-1">‹ Previous</button>
          <span data-counter></span>
          <button class="btn" type="button" data-step="1">Next ›</button>
        </div>`,
    });
    $(".modal__body", dialog).style.padding = "0";

    function show() {
      const photo = photos[index];
      const big = $(".photo__img", dialog);
      big.src = photo.src;
      big.alt = photo.alt;
      $("[data-counter]", dialog).textContent = `${index + 1} / ${photos.length}`;
    }

    // % wraps around: after the last photo comes the first again.
    function step(by) {
      index = (index + by + photos.length) % photos.length;
      show();
    }

    $$("[data-step]", dialog).forEach((btn) =>
      btn.addEventListener("click", () => step(Number(btn.dataset.step))));

    dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    });

    show();
  }
})();


/* --------------------------------------------------------------------------
   8. COMMUNITY
   -------------------------------------------------------------------------- */
(function setupCommunity() {
  const roomList = $("[data-rooms]");
  if (!roomList) return;

  // Every room's conversation. The Kakum one matches what's already in the
  // HTML; the others only exist here. mine: true marks your own messages.
  const ROOMS = {
    kakum: { name: "Kakum & Cape Coast", initials: "KC", members: 218, online: 12, joined: true, messages: [
      { who: "Kwabena", initials: "KA", colour: "volta", time: "08:41", text: "Has anyone visited Elmina Castle recently? Wondering how busy it gets." },
      { who: "Ama", initials: "AD", colour: "accra", time: "08:47", text: "Went two weeks ago. Tours start on the hour and the 9am one was almost empty." },
      { who: "Ama", initials: "AD", colour: "accra", time: "08:48", text: "Go on a weekday if you can. Saturdays are rough." },
      { mine: true, time: "09:02", text: "Good to know. Is it walkable from Cape Coast Castle or should I get a taxi?" },
      { who: "Yaw", initials: "YO", colour: "mole", time: "09:09", text: "Taxi. It is about 15km along the coast road, roughly GHS 40." },
      { mine: true, time: "09:11", text: "Perfect, thanks both." },
      { who: "Ama", initials: "AD", colour: "accra", time: "09:14", text: "Do Kakum the same trip. It is 40 minutes inland and the canopy walk opens at 8." },
    ]},
    volta: { name: "Volta Region", initials: "VR", members: 164, online: 5, joined: false, messages: [
      { who: "Selasi", initials: "SA", colour: "kakum", time: "07:30", text: "Wli was full of water last weekend. The lower falls trail was muddy but fine." },
      { who: "Kojo", initials: "KB", colour: "north", time: "08:02", text: "Afadjato in the rainy season?" },
    ]},
    accra: { name: "Accra Weekenders", initials: "AW", members: 402, online: 31, joined: true, messages: [
      { who: "Esi", initials: "EM", colour: "solo", time: "20:15", text: "Anyone know a quiet spot near Labadi for Sunday?" },
      { who: "Naa", initials: "NO", colour: "kakum", time: "21:40", text: "Labadi was packed on Sunday" },
    ]},
    mole: { name: "Mole Safari", initials: "MS", members: 97, online: 3, joined: false, messages: [
      { who: "Fuseini", initials: "FA", colour: "volta", time: "16:50", text: "The 6:30 walking safari is the one to book." },
      { who: "Yaw", initials: "YO", colour: "mole", time: "17:22", text: "Saw elephants at the waterhole" },
    ]},
    solo: { name: "Solo travellers Ghana", initials: "SG", members: 251, online: 9, joined: true, messages: [
      { who: "Kweku", initials: "KM", colour: "accra", time: "13:40", text: "The STC bus to Tamale was comfortable, about 12 hours." },
      { who: "Efua", initials: "EA", colour: "north", time: "14:05", text: "Anyone heading north in October?" },
    ]},
    north: { name: "Northern Ghana", initials: "NG", members: 108, online: 4, joined: false, messages: [
      { who: "Abena", initials: "AK", colour: "solo", time: "10:58", text: "Is the road from Tamale to Damongo paved now?" },
      { who: "Musah", initials: "MI", colour: "kakum", time: "11:30", text: "Tamale to Mole is about 2 hours" },
    ]},
  };

  const messageList = $(".messages");
  const composer = $("[data-composer]");
  const input = $(".composer__input");
  const leave = $("[data-leave]");
  let current = "kakum";

  // One message -> the same <li> markup used in community.html.
  function messageHTML(msg) {
    if (msg.mine) {
      return `
        <li class="msg msg--mine">
          <div class="msg__body">
            <p class="msg__who"><time>${msg.time}</time> · You</p>
            <p class="msg__bubble">${escapeHTML(msg.text)}</p>
          </div>
        </li>`;
    }
    return `
      <li class="msg">
        <span class="avatar avatar--sm avatar--${msg.colour}" aria-hidden="true">${msg.initials}</span>
        <div class="msg__body">
          <p class="msg__who">${msg.who} · <time>${msg.time}</time></p>
          <p class="msg__bubble">${escapeHTML(msg.text)}</p>
        </div>
      </li>`;
  }

  // Redraw the whole chat panel for the current room.
  function render() {
    const room = ROOMS[current];

    const avatar = $(".chat__head .avatar");
    avatar.className = `avatar avatar--${current}`;
    avatar.textContent = room.initials;
    $(".chat__name").textContent = room.name;
    $(".chat__count").textContent = `${room.members} members · ${room.online} online`;

    messageList.innerHTML = room.messages.map(messageHTML).join("")
      + (room.joined ? "" : `<li class="messages__note">Join this room to send messages.</li>`);
    messageList.scrollTop = messageList.scrollHeight;   // start at the newest message

    leave.textContent = room.joined ? "Leave room" : "Join room";
    input.disabled = !room.joined;
    $(".btn", composer).disabled = !room.joined;
    input.placeholder = room.joined ? "Message the room..." : "Join the room to send messages";
  }

  // --- Opening a room ---
  roomList.addEventListener("click", (event) => {
    const row = event.target.closest(".room");
    if (!row) return;

    $$(".room", roomList).forEach((r) => r.classList.toggle("room--open", r === row));
    $(".badge", row)?.remove();          // ?. means "only if there is one" — opening a room reads it
    current = row.dataset.room;
    render();

    // On a phone the chat sits below the list, so bring it into view.
    if (window.matchMedia("(max-width: 900px)").matches) {
      $("#chat").scrollIntoView({ behavior: "smooth" });
    }
  });

  // --- Chips: All / Joined / Regions / Trip buddies ---
  let group = "all";

  function filterRooms() {
    $$(".room", roomList).forEach((row) => {
      row.hidden = group !== "all" && !row.dataset.groups.split(" ").includes(group);
    });
  }

  setupChips($(".chips"), (value) => { group = value; filterRooms(); });

  // --- Sending a message ---
  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    ROOMS[current].messages.push({ mine: true, time, text });
    render();

    // Update the preview line and time in the room list too.
    const row = $(`.room[data-room="${current}"]`, roomList);
    $(".room__last", row).textContent = `You: ${text}`;
    $(".room__meta time", row).textContent = time;

    input.value = "";
    input.focus();
  });

  // --- Leave / join ---
  leave.addEventListener("click", () => {
    const room = ROOMS[current];
    room.joined = !room.joined;
    const groups = $(`.room[data-room="${current}"]`, roomList).dataset;
    const list = groups.groups.split(" ").filter((g) => g !== "joined");
    if (room.joined) list.push("joined");
    groups.groups = list.join(" ");
    render();
    filterRooms();          // so the room drops out of "Joined" straight away
    toast(room.joined ? `You joined ${room.name}.` : `You left ${room.name}.`);
  });

  render();
})();


/* --------------------------------------------------------------------------
   9. SIGN IN PAGE
   The pattern for each form is the same:
     on submit → check every field → if any is wrong, show its message and
     stop → otherwise pretend to contact a server for a moment → show "done".
   -------------------------------------------------------------------------- */
(function setupSignIn() {
  const tabs = $$('[role="tab"]');
  if (!tabs.length) return;

  // The heading and line under it change with the tab.
  const COPY = {
    signin: { title: "Welcome back",       lead: "Sign in to see your saved trips and bookings." },
    create: { title: "Create your account", lead: "Save trips, book stays and join the community." },
  };


  // --- Tabs -----------------------------------------------------------------
  function showTab(name) {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", on);
      tab.tabIndex = on ? 0 : -1;          // only the open tab is reachable with Tab
      $("#" + tab.getAttribute("aria-controls")).hidden = !on;
    });
    $("[data-auth-title]").textContent = COPY[name].title;
    $("[data-auth-lead]").textContent = COPY[name].lead;

    // Put #create in the address bar, so signin.html#create can be linked to
    // directly. replaceState changes the address without reloading the page.
    history.replaceState(null, "", name === "create" ? "#create" : location.pathname);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));

    // Arrow keys move between tabs — the way tabs work everywhere else.
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const next = tabs[(index + 1) % tabs.length];
      showTab(next.dataset.tab);
      next.focus();
    });
  });

  // Open the right tab when the page loads with #create, and again if the
  // address changes to or from #create while you're already on the page.
  function tabFromAddress() {
    showTab(location.hash === "#create" ? "create" : "signin");
  }
  tabFromAddress();
  window.addEventListener("hashchange", tabFromAddress);


  // --- Show / hide password ---------------------------------------------------
  // Switching the input's type between "password" and "text" is all it takes.
  $$("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.previousElementSibling;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });


  // --- Error messages under fields ------------------------------------------
  // setError(input, "message") shows a message under that field.
  // setError(input, "") clears it.
  // It returns true when the field is fine, so checks can be chained.
  function setError(input, message) {
    const field = input.closest(".field");
    let error = $(".field__error", field);

    if (!message) {
      error?.remove();
      input.removeAttribute("aria-invalid");
      return true;
    }

    if (!error) {
      error = document.createElement("span");
      error.className = "field__error";
      error.id = input.id + "-error";
      field.append(error);
    }
    error.textContent = message;
    input.setAttribute("aria-invalid", "true");       // red border + screen readers hear "invalid"
    input.setAttribute("aria-errormessage", error.id);
    return false;
  }

  // Typing in a field clears its error straight away.
  $$(".auth__form input").forEach((input) => {
    input.addEventListener("input", () => setError(input, ""));
  });


  // --- The checks themselves ------------------------------------------------
  // Something@something.something — loose on purpose. The only real test of
  // an email address is sending a message to it.
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function checkEmail(input) {
    const value = input.value.trim();
    if (!value) return setError(input, "Enter your email address.");
    if (!EMAIL.test(value)) return setError(input, "That doesn't look complete. It should be like ama@example.com.");
    return setError(input, "");
  }

  // The three password rules, shared by the checklist and by the submit check.
  const RULES = {
    length: (value) => value.length >= 8,
    letter: (value) => /[a-z]/i.test(value),
    number: (value) => /[0-9]/.test(value),
  };


  // --- Live strength checklist on Create account ------------------------------
  const newPassword = $("#ca-password");
  const meter = $("[data-meter]");

  newPassword.addEventListener("input", () => {
    let met = 0;
    $$("[data-rule]").forEach((item) => {
      const ok = RULES[item.dataset.rule](newPassword.value);
      item.classList.toggle("is-met", ok);
      if (ok) met++;
    });
    meter.dataset.level = met;
    $("span", meter).style.width = (met / 3) * 100 + "%";
  });


  // --- Pretend to talk to a server ---------------------------------------------
  // Disables the button and changes its text for a moment, so the page
  // feels like it's doing something. With a real backend, a fetch() call
  // would go here instead of setTimeout.
  function fakeRequest(form, busyText, onDone) {
    const button = $('button[type="submit"]', form);
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
      onDone();
    }, 900);
  }

  // Swap the forms for the "done" message.
  function finish(title, text) {
    $("[data-auth-forms]").hidden = true;
    const done = $("[data-auth-done]");
    $("[data-done-title]", done).textContent = title;
    $("[data-done-text]", done).textContent = text;
    done.hidden = false;
    done.focus();                          // screen readers announce the message
  }

  // Moves the cursor to the first field that has a problem.
  function focusFirstError(form) {
    $('[aria-invalid="true"]', form)?.focus();
  }


  // --- Sign in -----------------------------------------------------------------
  const signInForm = $('[data-auth="signin"]');

  signInForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = signInForm.elements;

    // Run every check (not just until the first failure), so all the
    // problems show at once instead of one at a time.
    const ok = [
      checkEmail(email),
      setError(password, password.value ? "" : "Enter your password."),
    ].every(Boolean);

    if (!ok) return focusFirstError(signInForm);

    fakeRequest(signInForm, "Signing in…", () => {
      finish("You're signed in", `Welcome back. You're signed in as ${email.value.trim()}.`);
    });
  });


  // --- Create account ------------------------------------------------------------
  const createForm = $('[data-auth="create"]');

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { name, email, password, confirm, terms } = createForm.elements;

    const passwordOk = Object.values(RULES).every((rule) => rule(password.value));

    const ok = [
      setError(name, name.value.trim().length >= 2 ? "" : "Enter your name."),
      checkEmail(email),
      setError(password, passwordOk ? "" : "Use 8 or more characters, with at least one letter and one number."),
      setError(confirm,
        !confirm.value ? "Type your password again."
        : confirm.value !== password.value ? "The two passwords don't match."
        : ""),
      setError(terms, terms.checked ? "" : "Tick this box to create an account."),
    ].every(Boolean);

    if (!ok) return focusFirstError(createForm);

    const firstName = name.value.trim().split(" ")[0];
    fakeRequest(createForm, "Creating account…", () => {
      finish(`Welcome to Wandr, ${firstName}`,
        `Your account is ready. We've sent a confirmation link to ${email.value.trim()}.`);
    });
  });


  // --- Forgot password ------------------------------------------------------------
  $("[data-forgot]").addEventListener("click", () => {
    openDialog({
      title: "Reset your password",
      submitLabel: "Send reset link",
      body: `
        <p>Enter the email you signed up with and we'll send you a link to choose a new password.</p>
        <p class="field">
          <label class="field__label" for="rs-email">Email</label>
          <input class="field__input" id="rs-email" name="email" type="email" required
                 value="${escapeHTML($("#si-email").value.trim())}">
        </p>`,
      onSubmit(form) {
        toast(`Reset link sent to ${form.elements.email.value.trim()}.`);
      },
    });
  });


  // --- Google ---------------------------------------------------------------------
  $("[data-google]").addEventListener("click", () => {
    toast("Google sign-in isn't connected yet. Use your email for now.");
  });
})();
