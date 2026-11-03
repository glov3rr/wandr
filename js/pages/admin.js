import { $, $$, escapeHTML, cedis } from "../lib/dom.js";
import { toast, openDialog, whileBusy } from "../lib/ui.js";
import { imageSrc, regionLabel } from "../lib/data.js";
import { getUser } from "../lib/store.js";
import * as admin from "../api/admin.js";
import { REGIONS, CATEGORIES, slugify } from "../api/validators.js";

const FACT_LABELS = ["Getting there", "Best time", "Duration", "Guides", "Entry", "Bring", "Tours", "Nearby", "Swimming", "Note"];

const toMap = (lat, lng) => ({
  x: 67.691 + 18.455 * lng + 0.094 * lat,
  y: 164.517 + 0.079 * lng - 14.327 * lat,
});

const options = (values, selected, labels = values) => values
  .map((value, index) => `<option value="${escapeHTML(value)}"${value === selected ? " selected" : ""}>${escapeHTML(labels[index])}</option>`)
  .join("");

const errorSlot = (field) => `<span class="admin-error" data-error-for="${field}" role="alert" hidden></span>`;

function blankPlace() {
  return {
    id: "", name: "", category: "Nature", region: "Greater Accra", where: "", rating: 4.5, reviews: 0,
    image: "", imageAlt: "", gallery: [], about: [], facts: [{ label: "Getting there", value: "" }, { label: "Best time", value: "" }],
    stay: { hotel: null, note: null }, related: [], map: { x: null, y: null }, featured: false, hidden: false,
  };
}

function blankHotel() {
  return { id: "", name: "", area: "", region: "Greater Accra", price: 800, rating: 4.3, amenities: ["wifi"], image: null, hidden: false };
}

function photosOf(place) {
  return [...new Set([place.image, ...(place.gallery || [])].filter(Boolean))];
}

function updatedText(iso) {
  if (!iso) return "";
  return "Edited " + new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function adminPage() {
  const root = $("[data-admin-root]");
  let data = null;
  let leaveGuard = null;

  const notFound = () => {
    document.title = "Page not found — Wandr";
    root.innerHTML = `
      <section class="empty empty--page">
        <h1 class="intro__title">We couldn't find that page</h1>
        <p>The link may be old or mistyped.</p>
        <a class="btn btn--solid" href="home.html">Go to the home page</a>
      </section>`;
  };

  if (!admin.available || !getUser()) return notFound();
  root.innerHTML = `<p class="loading">Loading…</p>`;
  if (!(await admin.isAdmin())) return notFound();
  document.title = "Admin — Wandr";

  async function refresh() {
    data = await admin.load();
  }

  try {
    await refresh();
  } catch (error) {
    root.innerHTML = `<p class="load-error" role="alert">${escapeHTML(error.message)}</p>`;
    return;
  }

  function showErrors(form, fields) {
    $$("[data-error-for]", form).forEach((slot) => { slot.hidden = true; });
    let first = null;
    Object.entries(fields).forEach(([field, message]) => {
      const slot = $(`[data-error-for="${field}"]`, form);
      if (!slot) return;
      slot.textContent = message;
      slot.hidden = false;
      first ??= slot;
    });
    if (first) {
      first.closest(".admin-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      first.closest(".admin-card")?.querySelector("input, select, textarea")?.focus({ preventScroll: true });
    }
  }

  function listView(tab) {
    leaveGuard = null;
    const isPlaces = tab === "places";
    const items = isPlaces ? data.places : data.hotels;
    root.innerHTML = `
      <section class="intro admin-intro">
        <div>
          <p class="intro__greeting">Admin</p>
          <h1 class="intro__title">Manage Wandr</h1>
        </div>
        <div class="admin-intro__actions">
          <button class="btn" type="button" data-export>Download backup</button>
          <a class="btn btn--solid" href="#${isPlaces ? "place" : "stay"}/new">${isPlaces ? "Add a place" : "Add a stay"}</a>
        </div>
      </section>

      <nav class="admin-tabs" aria-label="What to manage">
        <a href="#places" ${isPlaces ? 'aria-current="page"' : ""}>Places <span>${data.places.length}</span></a>
        <a href="#stays" ${!isPlaces ? 'aria-current="page"' : ""}>Stays <span>${data.hotels.length}</span></a>
      </nav>

      <div class="admin-toolbar">
        <label class="visually-hidden" for="admin-search">Search</label>
        <input class="search__input" id="admin-search" type="search" placeholder="Search ${isPlaces ? "places" : "stays"}…">
      </div>

      <ul class="admin-list" data-admin-list>
        ${items.map((item) => `
          <li data-search="${escapeHTML(`${item.name} ${item.id} ${item.region} ${item.category || item.area}`.toLowerCase())}">
            <a class="admin-row" href="#${isPlaces ? "place" : "stay"}/${item.id}">
              ${item.image
                ? `<img class="admin-row__img" src="${escapeHTML(imageSrc(item.image))}" alt="" loading="lazy">`
                : `<span class="admin-row__img admin-row__img--blank" aria-hidden="true">No photo</span>`}
              <span class="admin-row__main">
                <span class="admin-row__name">${escapeHTML(item.name)}</span>
                <span class="admin-row__meta">${isPlaces
                  ? `${escapeHTML(item.category)} · ${escapeHTML(regionLabel(item.region))}`
                  : `${escapeHTML(item.area)} · ${cedis(item.price)}`}</span>
              </span>
              <span class="admin-row__badges">
                ${item.hidden ? '<span class="admin-badge admin-badge--muted">Hidden</span>' : ""}
                ${item.featured ? '<span class="admin-badge">Featured</span>' : ""}
              </span>
              <span class="admin-row__edited">${updatedText(item.updated)}</span>
              <span class="admin-row__go" aria-hidden="true">Edit ›</span>
            </a>
          </li>`).join("")}
      </ul>
      <p class="empty" hidden data-admin-empty>Nothing matches that search.</p>`;

    const search = $("#admin-search");
    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      $$("[data-admin-list] > li").forEach((row) => {
        row.hidden = !row.dataset.search.includes(query);
        if (!row.hidden) shown++;
      });
      $("[data-admin-empty]").hidden = shown > 0;
    });

    $("[data-export]").addEventListener("click", async () => {
      const rooms = await fetch("data/wandr.json").then((response) => response.json()).then((json) => json.rooms).catch(() => undefined);
      const json = { ...admin.exportCatalog(data), ...(rooms ? { rooms } : {}) };
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2) + "\n"], { type: "application/json" }));
      link.download = "wandr.json";
      link.click();
      URL.revokeObjectURL(link.href);
      toast("Backup downloaded. Replace data/wandr.json with it to keep the offline copy up to date.");
    });
  }

  function photoTiles(photos, single = false) {
    return photos.map((photo, index) => `
      <li class="photo-tile${photo.uploading ? " is-uploading" : ""}" data-index="${index}">
        <img src="${escapeHTML(photo.preview || imageSrc(photo.src))}" alt="">
        ${!single && index === 0 ? '<span class="photo-tile__cover">Cover</span>' : ""}
        ${photo.uploading ? '<span class="photo-tile__status">Uploading…</span>' : `
          <span class="photo-tile__tools">
            ${!single && index > 0 ? `<button type="button" data-photo="left" aria-label="Move photo ${index + 1} earlier">◂</button>` : ""}
            ${!single && index < photos.length - 1 ? `<button type="button" data-photo="right" aria-label="Move photo ${index + 1} later">▸</button>` : ""}
            ${!single && index > 0 ? `<button type="button" data-photo="cover" aria-label="Make photo ${index + 1} the cover">Cover</button>` : ""}
            <button type="button" data-photo="remove" aria-label="Remove photo ${index + 1}">×</button>
          </span>`}
      </li>`).join("");
  }

  function setupPhotos(form, photos, folder, { single = false, onChange }) {
    const list = $("[data-photo-list]", form);
    const input = $("[data-photo-input]", form);
    const drop = $("[data-photo-drop]", form);

    const render = () => {
      list.innerHTML = photoTiles(photos, single);
      drop.hidden = single && photos.length > 0;
      onChange(list);
    };

    async function add(files) {
      const chosen = [...files].slice(0, single ? 1 : 12);
      if (single) photos.splice(0, photos.length);
      const pending = chosen.map((file) => ({ uploading: true, preview: URL.createObjectURL(file), file }));
      photos.push(...pending);
      render();
      await Promise.all(pending.map(async (photo) => {
        try {
          photo.src = await admin.uploadPhoto(photo.file, folder());
          photo.uploading = false;
        } catch (error) {
          photos.splice(photos.indexOf(photo), 1);
          toast(error.message);
        }
        URL.revokeObjectURL(photo.preview);
        delete photo.preview;
        delete photo.file;
        render();
      }));
    }

    input.addEventListener("change", () => {
      add(input.files);
      input.value = "";
    });
    drop.addEventListener("dragover", (event) => {
      event.preventDefault();
      drop.classList.add("is-over");
    });
    drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
    drop.addEventListener("drop", (event) => {
      event.preventDefault();
      drop.classList.remove("is-over");
      add(event.dataTransfer.files);
    });

    list.addEventListener("click", (event) => {
      const button = event.target.closest("[data-photo]");
      if (!button) return;
      const index = Number(button.closest("[data-index]").dataset.index);
      const [photo] = photos.splice(index, 1);
      if (button.dataset.photo === "left") photos.splice(index - 1, 0, photo);
      if (button.dataset.photo === "right") photos.splice(index + 1, 0, photo);
      if (button.dataset.photo === "cover") photos.unshift(photo);
      render();
    });

    render();
    return () => photos.some((photo) => photo.uploading);
  }

  function editorShell({ back, backLabel, title, subtitle, body, isNew, viewUrl }) {
    root.innerHTML = `
      <a class="admin-back" href="${back}">‹ ${backLabel}</a>
      <section class="intro admin-intro">
        <div>
          <p class="intro__greeting">${subtitle}</p>
          <h1 class="intro__title" data-editor-title>${escapeHTML(title)}</h1>
        </div>
        ${viewUrl ? `<a class="btn" href="${viewUrl}" target="_blank" rel="noopener">View on site</a>` : ""}
      </section>
      <form class="admin-form" novalidate>
        ${body}
        <div class="admin-savebar">
          <p class="admin-savebar__status" data-save-status>No changes yet</p>
          ${isNew ? "" : '<button class="btn btn--danger" type="button" data-delete>Delete</button>'}
          <a class="btn" href="${back}">Cancel</a>
          <button class="btn btn--solid" type="submit">${isNew ? "Publish" : "Save changes"}</button>
        </div>
      </form>`;
    return $(".admin-form", root);
  }

  function clearErrors(scope) {
    $$("[data-error-for]", scope).forEach((slot) => { slot.hidden = true; });
  }

  function trackChanges(form, read) {
    const start = JSON.stringify(read());
    const clearNear = (event) => {
      const card = event.target.closest?.(".admin-card");
      if (card) clearErrors(card);
    };
    form.addEventListener("input", clearNear);
    form.addEventListener("change", clearNear);
    const status = $("[data-save-status]", form);
    const dirty = () => JSON.stringify(read()) !== start;
    const update = (scope) => {
      if (scope instanceof Element) clearErrors(scope.closest(".admin-card") || scope);
      const changed = dirty();
      status.textContent = changed ? "Unsaved changes" : "No changes yet";
      status.classList.toggle("is-dirty", changed);
    };
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    leaveGuard = () => dirty();
    return { update, done: () => { leaveGuard = null; } };
  }

  function confirmDelete(name, remove, back) {
    openDialog({
      title: `Delete ${escapeHTML(name)}?`,
      submitLabel: "Delete for good",
      body: `<p>This removes it from Wandr straight away and can't be undone. To take it off the site for now, tick <strong>Hide from the site</strong> instead.</p>`,
      onSubmit() {
        remove()
          .then(async () => {
            leaveGuard = null;
            await refresh();
            toast(`${name} deleted.`);
            location.hash = back;
          })
          .catch((error) => toast(error.message));
      },
    });
  }

  function placeEditor(id) {
    const isNew = id === "new";
    const existing = data.places.find((item) => item.id === id);
    if (!isNew && !existing) return listView("places");
    const place = structuredClone(existing || blankPlace());
    const photos = photosOf(place).map((src) => ({ src }));
    let idTouched = !isNew;
    const others = data.places.filter((item) => item.id !== place.id);

    const form = editorShell({
      back: "#places",
      backLabel: "All places",
      title: isNew ? "New place" : place.name,
      subtitle: isNew ? "Add a place" : "Edit place",
      isNew,
      viewUrl: !isNew && !place.hidden ? `place.html?id=${encodeURIComponent(place.id)}` : "",
      body: `
        <section class="admin-card">
          <h2 class="admin-card__title">Basics</h2>
          <div class="admin-grid">
            <p class="field admin-grid__wide">
              <label class="field__label" for="ad-name">Name</label>
              <input class="field__input" id="ad-name" name="name" value="${escapeHTML(place.name)}" maxlength="80" placeholder="Kintampo Waterfalls">
              ${errorSlot("name")}
            </p>
            <p class="field admin-grid__wide">
              <label class="field__label" for="ad-id">Web address</label>
              <span class="admin-prefix"><span>place.html?id=</span>
                <input class="field__input" id="ad-id" name="id" value="${escapeHTML(place.id)}" ${isNew ? "" : "readonly"} maxlength="60"></span>
              <span class="field__hint">${isNew ? "Made from the name. Lowercase letters, numbers and dashes." : "Can't be changed after publishing, because links and trips point to it."}</span>
              ${errorSlot("id")}
            </p>
            <p class="field">
              <label class="field__label" for="ad-category">Category</label>
              <select class="field__input" id="ad-category" name="category">${options(CATEGORIES, place.category)}</select>
              ${errorSlot("category")}
            </p>
            <p class="field">
              <label class="field__label" for="ad-region">Region</label>
              <select class="field__input" id="ad-region" name="region">${options(REGIONS, place.region)}</select>
              ${errorSlot("region")}
            </p>
            <p class="field admin-grid__wide">
              <label class="field__label" for="ad-where">Where, in one line</label>
              <input class="field__input" id="ad-where" name="where" value="${escapeHTML(place.where || "")}" maxlength="120" placeholder="Bono East Region · 4 km north of Kintampo">
              ${errorSlot("where")}
            </p>
            <p class="field">
              <label class="field__label" for="ad-rating">Rating (0–5)</label>
              <input class="field__input" id="ad-rating" name="rating" type="number" min="0" max="5" step="0.1" value="${place.rating}">
              ${errorSlot("rating")}
            </p>
            <p class="field">
              <label class="field__label" for="ad-reviews">Number of reviews</label>
              <input class="field__input" id="ad-reviews" name="reviews" type="number" min="0" step="1" value="${place.reviews}">
              ${errorSlot("reviews")}
            </p>
          </div>
          <div class="admin-switches">
            <label class="check"><input type="checkbox" name="featured" ${place.featured ? "checked" : ""}> Feature on the home page</label>
            <label class="check"><input type="checkbox" name="hidden" ${place.hidden ? "checked" : ""}> Hide from the site</label>
          </div>
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Photos</h2>
          <p class="admin-card__lead">The first photo is the cover. Photos are resized before uploading, so any size from your phone or camera is fine.</p>
          <ul class="photo-grid" data-photo-list></ul>
          <label class="photo-drop" data-photo-drop>
            <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple data-photo-input>
            <strong>Add photos</strong>
            <span>Click to choose, or drag them here</span>
          </label>
          ${errorSlot("photos")}
          <p class="field">
            <label class="field__label" for="ad-alt">Describe the cover photo</label>
            <input class="field__input" id="ad-alt" name="imageAlt" value="${escapeHTML(place.imageAlt || "")}" maxlength="160" placeholder="Water spilling over rock steps into a pool">
            <span class="field__hint">Read aloud to people using screen readers.</span>
          </p>
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">About</h2>
          <p class="field">
            <label class="field__label" for="ad-about">Description</label>
            <textarea class="field__input admin-textarea" id="ad-about" name="about" rows="9" placeholder="Leave an empty line between paragraphs.">${escapeHTML((place.about || []).join("\n\n"))}</textarea>
            <span class="field__hint" data-about-count></span>
            ${errorSlot("about")}
          </p>
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Good to know</h2>
          <p class="admin-card__lead">Short practical facts shown in a table on the place page.</p>
          <datalist id="fact-labels">${FACT_LABELS.map((label) => `<option value="${label}">`).join("")}</datalist>
          <ul class="fact-rows" data-facts></ul>
          <button class="btn" type="button" data-add-fact>Add a fact</button>
          ${errorSlot("facts")}
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Map pin</h2>
          <p class="admin-card__lead">Click the map where the place is. Or type its coordinates from Google Maps (right-click a spot there to copy them).</p>
          <div class="admin-map">
            <div class="admin-map__frame" data-map>
              <img src="Images/ghana map.jpg" alt="Map of Ghana. Click to place the pin." width="800" height="1039">
              <span class="admin-map__pin" data-pin hidden></span>
            </div>
            <div class="admin-map__side">
              <p class="field">
                <label class="field__label" for="ad-coords">Coordinates</label>
                <input class="field__input" id="ad-coords" placeholder="7.1218, 0.5927" data-coords>
              </p>
              <button class="btn" type="button" data-use-coords>Place pin</button>
              <p class="field__hint" data-pin-readout></p>
              ${errorSlot("map")}
            </div>
          </div>
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Nearby</h2>
          <div class="admin-grid">
            <p class="field">
              <label class="field__label" for="ad-stay">Where to stay</label>
              <select class="field__input" id="ad-stay" name="stayHotel">
                <option value="">No stay suggested</option>
                ${options(data.hotels.map((hotel) => hotel.id), place.stay?.hotel || "", data.hotels.map((hotel) => hotel.name))}
              </select>
              ${errorSlot("stay")}
            </p>
            <p class="field">
              <label class="field__label" for="ad-stay-note">Distance or note</label>
              <input class="field__input" id="ad-stay-note" name="stayNote" value="${escapeHTML(place.stay?.note || "")}" maxlength="40" placeholder="12 km away">
            </p>
          </div>
          <fieldset class="admin-related">
            <legend class="field__label">Nearby attractions <span class="field__hint">(2 or 3 is best)</span></legend>
            <input class="field__input" type="search" placeholder="Filter places…" data-related-filter>
            <div class="admin-related__list">
              ${others.map((other) => `
                <label class="check" data-related-name="${escapeHTML(other.name.toLowerCase())}">
                  <input type="checkbox" name="related" value="${other.id}" ${place.related.includes(other.id) ? "checked" : ""}>
                  ${escapeHTML(other.name)}
                </label>`).join("")}
            </div>
            ${errorSlot("related")}
          </fieldset>
        </section>`,
    });

    const factList = $("[data-facts]", form);
    const factRow = (fact = { label: "", value: "" }) => `
      <li class="fact-row">
        <input class="field__input" list="fact-labels" placeholder="Label" value="${escapeHTML(fact.label)}" data-fact-label aria-label="Fact label" maxlength="40">
        <input class="field__input" placeholder="Details" value="${escapeHTML(fact.value)}" data-fact-value aria-label="Fact details" maxlength="160">
        <button class="fact-row__remove" type="button" aria-label="Remove fact" data-remove-fact>×</button>
      </li>`;
    factList.innerHTML = place.facts.map(factRow).join("");
    $("[data-add-fact]", form).addEventListener("click", () => {
      factList.insertAdjacentHTML("beforeend", factRow());
      $("li:last-child [data-fact-label]", factList).focus();
      changes.update(factList);
    });
    factList.addEventListener("click", (event) => {
      if (!event.target.closest("[data-remove-fact]")) return;
      event.target.closest("li").remove();
      changes.update(factList);
    });

    let pin = { ...place.map };
    const pinEl = $("[data-pin]", form);
    const drawPin = () => {
      const placed = Number.isFinite(pin.x) && Number.isFinite(pin.y) && pin.x !== null;
      pinEl.hidden = !placed;
      if (placed) {
        pinEl.style.left = pin.x + "%";
        pinEl.style.top = pin.y + "%";
      }
      $("[data-pin-readout]", form).textContent = placed ? `Pin at ${pin.x.toFixed(1)}% across, ${pin.y.toFixed(1)}% down.` : "No pin yet.";
    };
    $("[data-map]", form).addEventListener("click", (event) => {
      const box = event.currentTarget.getBoundingClientRect();
      pin = {
        x: Math.round(((event.clientX - box.left) / box.width) * 1000) / 10,
        y: Math.round(((event.clientY - box.top) / box.height) * 1000) / 10,
      };
      drawPin();
      changes.update(pinEl);
    });
    $("[data-use-coords]", form).addEventListener("click", () => {
      const parts = $("[data-coords]", form).value.split(/[,\s]+/).map(Number).filter((value) => !Number.isNaN(value));
      if (parts.length !== 2) return toast("Type the coordinates as latitude, longitude, like 7.1218, 0.5927.");
      const [lat, lng] = parts;
      if (lat < 4.5 || lat > 11.3 || lng < -3.4 || lng > 1.3) return toast("Those coordinates aren't in Ghana. Check the order: latitude first.");
      const spot = toMap(lat, lng);
      pin = { x: Math.round(spot.x * 10) / 10, y: Math.round(spot.y * 10) / 10 };
      drawPin();
      changes.update(pinEl);
    });
    drawPin();

    const nameInput = form.elements.name;
    const idInput = form.elements.id;
    idInput.addEventListener("input", () => { idTouched = true; });
    nameInput.addEventListener("input", () => {
      if (!idTouched) idInput.value = slugify(nameInput.value);
      $("[data-editor-title]").textContent = nameInput.value.trim() || "New place";
    });

    const aboutInput = form.elements.about;
    const paragraphs = () => aboutInput.value.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    const countAbout = () => {
      const count = paragraphs().length;
      $("[data-about-count]", form).textContent = `${count} ${count === 1 ? "paragraph" : "paragraphs"} · ${aboutInput.value.trim().length} characters`;
    };
    aboutInput.addEventListener("input", countAbout);
    countAbout();

    $("[data-related-filter]", form).addEventListener("input", (event) => {
      const query = event.target.value.trim().toLowerCase();
      $$("[data-related-name]", form).forEach((label) => { label.hidden = !label.dataset.relatedName.includes(query); });
    });

    const read = () => ({
      id: idInput.value.trim(),
      name: nameInput.value,
      category: form.elements.category.value,
      region: form.elements.region.value,
      where: form.elements.where.value,
      rating: form.elements.rating.value,
      reviews: form.elements.reviews.value,
      image: photos.find((photo) => photo.src)?.src || "",
      imageAlt: form.elements.imageAlt.value,
      gallery: photos.filter((photo) => photo.src).map((photo) => photo.src),
      about: paragraphs(),
      facts: $$(".fact-row", form).map((row) => ({ label: $("[data-fact-label]", row).value, value: $("[data-fact-value]", row).value })),
      stay: { hotel: form.elements.stayHotel.value || null, note: form.elements.stayNote.value },
      related: $$('input[name="related"]:checked', form).map((box) => box.value),
      map: { ...pin },
      featured: form.elements.featured.checked,
      hidden: form.elements.hidden.checked,
    });

    const changes = trackChanges(form, read);
    const uploading = setupPhotos(form, photos, () => idInput.value || nameInput.value, { onChange: (scope) => changes?.update(scope) });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (uploading()) return toast("Wait for the photos to finish uploading.");
      try {
        const saved = await whileBusy($('button[type="submit"]', form), isNew ? "Publishing…" : "Saving…", () => admin.savePlace(read(), {
          isNew,
          placeIds: data.places.map((item) => item.id),
          hotelIds: data.hotels.map((item) => item.id),
        }));
        changes.done();
        await refresh();
        toast(isNew ? `${saved.name} is live on Wandr.` : `${saved.name} saved.`);
        location.hash = `place/${saved.id}`;
        if (!isNew) placeEditor(saved.id);
      } catch (error) {
        if (error.fields) showErrors(form, error.fields);
        else toast(error.message);
      }
    });

    $("[data-delete]", form)?.addEventListener("click", () => confirmDelete(place.name, () => admin.deletePlace(place.id), "#places"));
  }

  function hotelEditor(id) {
    const isNew = id === "new";
    const existing = data.hotels.find((item) => item.id === id);
    if (!isNew && !existing) return listView("stays");
    const hotel = structuredClone(existing || blankHotel());
    const photos = hotel.image ? [{ src: hotel.image }] : [];
    let idTouched = !isNew;
    const usedBy = data.places.filter((place) => place.stay?.hotel === hotel.id);

    const form = editorShell({
      back: "#stays",
      backLabel: "All stays",
      title: isNew ? "New stay" : hotel.name,
      subtitle: isNew ? "Add a stay" : "Edit stay",
      isNew,
      viewUrl: !isNew && !hotel.hidden ? `stays.html?book=${encodeURIComponent(hotel.id)}` : "",
      body: `
        <section class="admin-card">
          <h2 class="admin-card__title">Basics</h2>
          <div class="admin-grid">
            <p class="field admin-grid__wide">
              <label class="field__label" for="ah-name">Name</label>
              <input class="field__input" id="ah-name" name="name" value="${escapeHTML(hotel.name)}" maxlength="80" placeholder="Royal Senchi">
              ${errorSlot("name")}
            </p>
            <p class="field admin-grid__wide">
              <label class="field__label" for="ah-id">Web address</label>
              <span class="admin-prefix"><span>stays.html?book=</span>
                <input class="field__input" id="ah-id" name="id" value="${escapeHTML(hotel.id)}" ${isNew ? "" : "readonly"} maxlength="60"></span>
              ${errorSlot("id")}
            </p>
            <p class="field admin-grid__wide">
              <label class="field__label" for="ah-area">Where, in one line</label>
              <input class="field__input" id="ah-area" name="area" value="${escapeHTML(hotel.area)}" maxlength="120" placeholder="Akosombo, Eastern Region · riverside">
              ${errorSlot("area")}
            </p>
            <p class="field">
              <label class="field__label" for="ah-region">Region</label>
              <select class="field__input" id="ah-region" name="region">${options(REGIONS, hotel.region)}</select>
              ${errorSlot("region")}
            </p>
            <p class="field">
              <label class="field__label" for="ah-price">Price per night (GHS)</label>
              <input class="field__input" id="ah-price" name="price" type="number" min="1" step="1" value="${hotel.price}">
              ${errorSlot("price")}
            </p>
            <p class="field">
              <label class="field__label" for="ah-rating">Rating (0–5)</label>
              <input class="field__input" id="ah-rating" name="rating" type="number" min="0" max="5" step="0.1" value="${hotel.rating}">
              ${errorSlot("rating")}
            </p>
          </div>
          <div class="admin-switches">
            <label class="check"><input type="checkbox" name="hidden" ${hotel.hidden ? "checked" : ""}> Hide from the site</label>
          </div>
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Amenities</h2>
          <div class="admin-amenities">
            ${data.amenities.map((amenity) => `
              <label class="check"><input type="checkbox" name="amenities" value="${amenity.key}" ${hotel.amenities.includes(amenity.key) ? "checked" : ""}> ${escapeHTML(amenity.label)}</label>`).join("")}
          </div>
          ${errorSlot("amenities")}
        </section>

        <section class="admin-card">
          <h2 class="admin-card__title">Photo</h2>
          <p class="admin-card__lead">Without a photo, the stay shows a “Photo coming soon” box.</p>
          <ul class="photo-grid photo-grid--single" data-photo-list></ul>
          <label class="photo-drop" data-photo-drop>
            <input class="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" data-photo-input>
            <strong>Add a photo</strong>
            <span>Click to choose, or drag it here</span>
          </label>
        </section>

        ${usedBy.length ? `
          <section class="admin-card">
            <h2 class="admin-card__title">Suggested on</h2>
            <p class="admin-card__lead">${usedBy.map((place) => `<a href="#place/${place.id}">${escapeHTML(place.name)}</a>`).join(", ")}</p>
          </section>` : ""}`,
    });

    const nameInput = form.elements.name;
    const idInput = form.elements.id;
    idInput.addEventListener("input", () => { idTouched = true; });
    nameInput.addEventListener("input", () => {
      if (!idTouched) idInput.value = slugify(nameInput.value);
      $("[data-editor-title]").textContent = nameInput.value.trim() || "New stay";
    });

    const read = () => ({
      id: idInput.value.trim(),
      name: nameInput.value,
      area: form.elements.area.value,
      region: form.elements.region.value,
      price: form.elements.price.value,
      rating: form.elements.rating.value,
      amenities: $$('input[name="amenities"]:checked', form).map((box) => box.value),
      image: photos.find((photo) => photo.src)?.src || null,
      hidden: form.elements.hidden.checked,
    });

    const changes = trackChanges(form, read);
    const uploading = setupPhotos(form, photos, () => `stays/${idInput.value || nameInput.value}`, { single: true, onChange: (scope) => changes?.update(scope) });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (uploading()) return toast("Wait for the photo to finish uploading.");
      try {
        const saved = await whileBusy($('button[type="submit"]', form), isNew ? "Publishing…" : "Saving…", () => admin.saveHotel(read(), {
          isNew,
          hotelIds: data.hotels.map((item) => item.id),
          amenityKeys: data.amenities.map((item) => item.key),
        }));
        changes.done();
        await refresh();
        toast(isNew ? `${saved.name} is live on Wandr.` : `${saved.name} saved.`);
        location.hash = `stay/${saved.id}`;
        if (!isNew) hotelEditor(saved.id);
      } catch (error) {
        if (error.fields) showErrors(form, error.fields);
        else toast(error.message);
      }
    });

    $("[data-delete]", form)?.addEventListener("click", () => confirmDelete(hotel.name, () => admin.deleteHotel(hotel.id), "#stays"));
  }

  let current = location.hash;

  function route() {
    const [view, id] = location.hash.replace(/^#/, "").split("/");
    current = location.hash;
    window.scrollTo(0, 0);
    if (view === "place" && id) return placeEditor(decodeURIComponent(id));
    if (view === "stay" && id) return hotelEditor(decodeURIComponent(id));
    return listView(view === "stays" ? "stays" : "places");
  }

  window.addEventListener("hashchange", () => {
    if (location.hash === current) return;
    if (leaveGuard?.() && !confirm("You have unsaved changes. Leave without saving?")) {
      history.replaceState(null, "", current);
      return;
    }
    route();
  });

  window.addEventListener("beforeunload", (event) => {
    if (leaveGuard?.()) event.preventDefault();
  });

  route();
}
