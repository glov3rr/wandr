import { $, $$, escapeHTML, cedis, formatDate, nightsBetween } from "../lib/dom.js";
import { openDialog, toast } from "../lib/ui.js";
import { placeUrl } from "../lib/data.js";

const tagsHTML = (ids, data) => ids
  .map((id) => data.place(id))
  .filter(Boolean)
  .map((place) => `<li class="tag">${escapeHTML(place.name)}</li>`)
  .join("");

export default function trips(data) {
  const form = $("[data-trip-form]");
  const tripList = $("[data-trip-list]");

  $("[data-attraction-options]").innerHTML = data.places.map((place) => `
    <label class="check"><input type="checkbox" name="attractions" value="${place.id}"> ${escapeHTML(place.name)}</label>`).join("");

  $$("[data-stop-tags]").forEach((list) => {
    list.innerHTML = tagsHTML(list.closest("[data-stops]").dataset.stops.split(","), data);
  });

  tripList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-trip-details]");
    if (!button) return;
    const trip = button.closest(".trip");
    const stops = trip.dataset.stops.split(",").map((id) => data.place(id)).filter(Boolean);
    const stats = $$(".trip__stats > div", trip)
      .map((pair) => `<div><span>${$("dt", pair).textContent}</span><strong>${$("dd", pair).textContent}</strong></div>`)
      .join("");

    openDialog({
      title: escapeHTML(button.textContent),
      body: `
        <p>${$(".trip__dates", trip).textContent}</p>
        <div class="summary">${stats}</div>
        <ol class="stop-list">
          ${stops.map((place, index) => `<li>${index + 1}. <a href="${placeUrl(place)}">${escapeHTML(place.name)}</a></li>`).join("")}
        </ol>`,
    });
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const ticked = $$('input[name="attractions"]:checked', form).map((box) => box.value);
    error.hidden = ticked.length > 0;
    if (!form.reportValidity() || ticked.length === 0) return;

    const name = form.elements["trip-name"].value.trim();
    const start = form.elements.start.value;
    const end = form.elements.end.value;
    const budget = Number(form.elements.budget.value);

    const item = document.createElement("li");
    item.innerHTML = `
      <article class="trip is-new" data-stops="${ticked.join(",")}">
        <div class="trip__head">
          <h3 class="trip__name"><button class="link-btn" type="button" data-trip-details>${escapeHTML(name)}</button></h3>
          <p class="trip__status trip__status--planned">Planned</p>
        </div>
        <p class="trip__dates">${formatDate(start)} – ${formatDate(end)}</p>
        <dl class="trip__stats">
          <div><dt>Days</dt><dd>${nightsBetween(start, end) + 1}</dd></div>
          <div><dt>Stops</dt><dd>${ticked.length}</dd></div>
          <div><dt>Travellers</dt><dd>${form.elements.travellers.value}</dd></div>
          <div><dt>Total</dt><dd>${budget ? cedis(budget) : "—"}</dd></div>
        </dl>
        <ul class="tags">${tagsHTML(ticked, data)}</ul>
      </article>`;
    tripList.prepend(item);

    $("[data-trip-count]").textContent = `${$$(".trip", tripList).length} saved, 1 upcoming`;
    form.reset();
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => $(".trip", item).classList.remove("is-new"), 3000);
    toast(`"${name}" saved to your trips.`);
  });

  form.addEventListener("reset", () => { error.hidden = true; });
}
