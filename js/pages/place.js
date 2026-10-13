import { $, $$, escapeHTML, formatDate, plural, todayISO } from "../lib/dom.js";
import { openDialog, toast } from "../lib/ui.js";
import { regionLabel, exploredStats, imageSrc, imageCredit } from "../lib/data.js";
import { getUser, getVisited, toggleVisited } from "../lib/store.js";
import { placeCard, hotelCard } from "../components/cards.js";

function notFound(root) {
  document.title = "Place not found — Wandr";
  root.innerHTML = `
    <section class="empty empty--page">
      <h1 class="intro__title">We couldn't find that place</h1>
      <p>The link may be old or mistyped. Every place on Wandr is on the map.</p>
      <a class="btn btn--solid" href="explore.html">Explore the map</a>
    </section>`;
}

function creditHTML(image) {
  const credit = imageCredit(image);
  return credit
    ? `<a href="${credit.url}" target="_blank" rel="noopener">Photo: ${credit.label}</a>`
    : "";
}

function render(place, data) {
  const hotel = data.hotel(place.stay.hotel);
  const related = place.related.map((id) => data.place(id)).filter(Boolean);
  const region = regionLabel(place.region);

  return `
    <nav class="crumbs" aria-label="Breadcrumb">
      <ol>
        <li><a href="home.html">Home</a></li>
        <li><a href="explore.html">Explore</a></li>
        <li>${region}</li>
        <li aria-current="page">${escapeHTML(place.name)}</li>
      </ol>
    </nav>

    <section class="hero">
      <figure class="hero__figure">
        <img class="hero__img" src="${imageSrc(place.image)}" alt="${escapeHTML(place.imageAlt)}">
        ${imageCredit(place.image) ? `<figcaption class="photo-credit">${creditHTML(place.image)}</figcaption>` : ""}
      </figure>
      <div class="hero__bar">
        <div>
          <p class="card__tag">${place.category}</p>
          <h1 class="hero__title">${escapeHTML(place.name)}</h1>
          <p class="hero__where">${escapeHTML(place.where)}</p>
        </div>
        <p class="hero__rating">★ ${place.rating.toFixed(1)}<span>${plural(place.reviews, "review")}</span></p>
      </div>
    </section>

    <section class="detail">
      <div class="detail__main">
        <h2 class="detail__heading">About</h2>
        ${place.about.map((paragraph) => `<p class="prose">${escapeHTML(paragraph)}</p>`).join("")}

        <h2 class="detail__heading">Good to know</h2>
        <dl class="facts">
          ${place.facts.map((fact) => `<div><dt>${escapeHTML(fact.label)}</dt><dd>${escapeHTML(fact.value)}</dd></div>`).join("")}
        </dl>

        ${place.gallery.length > 1 ? `
          <h2 class="detail__heading">Gallery</h2>
          <ul class="gallery">
            ${place.gallery.map((image) => `
              <li><button class="gallery__btn" type="button">
                <img src="${imageSrc(image, 640)}" alt="${escapeHTML(place.name)} and the surrounding area" loading="lazy">
              </button></li>`).join("")}
          </ul>` : ""}

        ${hotel ? `
          <h2 class="detail__heading">Where to stay nearby</h2>
          <ul class="stay-list">
            ${hotelCard(hotel, data.amenities, {
              area: `${hotel.area.split(" · ")[0]} · ${place.stay.note}`,
              link: `stays.html?book=${hotel.id}`,
            })}
          </ul>` : ""}
      </div>

      <aside class="booking">
        <p class="booking__price">Plan a visit<span>${escapeHTML(place.name)}</span></p>
        <form data-visit-form>
          <p class="field">
            <label class="field__label" for="visit-date">Date of visit</label>
            <input class="field__input" type="date" id="visit-date" name="visit-date" required>
          </p>
          <p class="field">
            <label class="field__label" for="adults">Adults</label>
            <input class="field__input" type="number" id="adults" name="adults" value="2" min="1" max="20">
          </p>
          <p class="field">
            <label class="field__label" for="students">Students</label>
            <input class="field__input" type="number" id="students" name="students" value="0" min="0" max="20">
          </p>
          <button class="btn btn--solid booking__cta" type="submit">Add to trip</button>
          <button class="btn booking__cta" type="button" aria-pressed="false" data-save>Save for later</button>
          <button class="btn booking__cta" type="button" aria-pressed="false" data-visited>I've been here</button>
        </form>
        <dl class="booking__total">
          <div><dt>Region</dt><dd>${region}</dd></div>
          <div><dt>Category</dt><dd>${place.category}</dd></div>
          <div class="booking__grand"><dt>Rating</dt><dd>★ ${place.rating.toFixed(1)}</dd></div>
        </dl>
        <p class="booking__note">Entry fees and opening hours change often. Confirm directly with the site before you travel.</p>
      </aside>
    </section>

    ${related.length ? `
      <section class="related">
        <div class="section-head">
          <h2 class="section-head__title">Nearby attractions</h2>
          <a class="section-head__link" href="explore.html#${place.id}">See on map</a>
        </div>
        <ul class="card-grid">${related.map((other) => placeCard(other)).join("")}</ul>
      </section>` : ""}`;
}

function openViewer(place, startIndex) {
  let index = startIndex;
  const photos = place.gallery;

  const dialog = openDialog({
    title: escapeHTML(place.name),
    className: "modal--photo",
    body: `
      <img class="photo__img" alt="">
      <div class="photo__bar">
        <button class="btn" type="button" data-step="-1">‹ Previous</button>
        <span data-counter></span>
        <span class="photo-credit" data-credit></span>
        <button class="btn" type="button" data-step="1">Next ›</button>
      </div>`,
  });
  $(".modal__body", dialog).style.padding = "0";

  function show() {
    const image = $(".photo__img", dialog);
    image.src = imageSrc(photos[index]);
    $("[data-credit]", dialog).innerHTML = creditHTML(photos[index]);
    image.alt = `${place.name}, photo ${index + 1} of ${photos.length}`;
    $("[data-counter]", dialog).textContent = `${index + 1} / ${photos.length}`;
  }

  function step(by) {
    index = (index + by + photos.length) % photos.length;
    show();
  }

  $$("[data-step]", dialog).forEach((button) => button.addEventListener("click", () => step(Number(button.dataset.step))));
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
  });
  show();
}

export default function place(data) {
  const root = $("[data-place-root]");
  const id = new URLSearchParams(location.search).get("id");
  const current = data.place(id);
  if (!current) return notFound(root);

  document.title = `${current.name} — Wandr`;
  root.innerHTML = render(current, data);

  const form = $("[data-visit-form]");
  $("#visit-date", form).min = todayISO();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const adults = Number(form.elements.adults.value);
    const students = Number(form.elements.students.value);
    let people = plural(adults, "adult");
    if (students) people += `, ${plural(students, "student")}`;
    toast(`${current.name} added to your trip for ${formatDate(form.elements["visit-date"].value)} · ${people}.`);
  });

  const save = $("[data-save]", form);
  save.addEventListener("click", () => {
    const saved = save.getAttribute("aria-pressed") !== "true";
    save.setAttribute("aria-pressed", saved);
    save.textContent = saved ? "Saved ✓" : "Save for later";
    toast(saved ? `${current.name} saved for later.` : `${current.name} removed from your saved places.`);
  });

  const visitedButton = $("[data-visited]", form);

  function syncVisited() {
    const been = Boolean(getUser()) && getVisited().includes(current.id);
    visitedButton.setAttribute("aria-pressed", been);
    visitedButton.textContent = been ? "Visited ✓" : "I've been here";
  }

  syncVisited();
  window.addEventListener("wandr:change", syncVisited);

  visitedButton.addEventListener("click", () => {
    if (!getUser()) {
      openDialog({
        title: "Sign in to track your travels",
        body: `
          <p>Sign in and Wandr keeps count of the places you've been, so you can see how much of Ghana you've explored.</p>
          <div class="modal__actions">
            <a class="btn" href="signin.html#create">Create account</a>
            <a class="btn btn--solid" href="signin.html">Sign in</a>
          </div>`,
      });
      return;
    }
    const added = toggleVisited(current.id);
    const stats = exploredStats(data, getVisited());
    toast(added
      ? `${current.name} added. You've explored ${stats.count} of ${stats.total} places.`
      : `${current.name} removed from your places.`);
  });

  $$(".gallery__btn").forEach((button, index) => button.addEventListener("click", () => openViewer(current, index)));
}
