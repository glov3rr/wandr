import { $, $$, escapeHTML } from "../lib/dom.js";
import { getUser } from "../lib/store.js";

const SEEN_KEY = "wandr:onboarded";

const STEPS = [
  {
    image: "Images/kakum 1.jpeg",
    eyebrow: "Welcome",
    title: "Akwaaba to Wandr",
    text: "Plan travel in Ghana in one place: find places worth the trip, build an itinerary, book a stay and ask people who've been.",
  },
  {
    image: "Images/ghana map.jpg",
    eyebrow: "Explore",
    title: "Every place on one map",
    text: "Hover or tap a pin to preview a place, then filter by nature, history, wildlife, beaches or culture.",
    position: "center 70%",
  },
  {
    image: "Images/cape coast castle.jpeg",
    eyebrow: "Trips and stays",
    title: "Plan trips and book stays",
    text: "Start from a ready-made package or pick your own stops, then request a room at hotels close to each one.",
  },
  {
    image: "Images/mole national park 1.jpeg",
    eyebrow: "Your Ghana",
    title: "See how much you've explored",
    text: "Mark the places you've been. Your profile fills a progress ring, unlocks badges and maps your travels region by region.",
  },
  {
    image: "Images/wli waterfalls.jpeg",
    eyebrow: "Community",
    title: "Ask people who've been",
    text: "Join chat rooms for regions and trip buddies to swap tips on routes, prices and the best time to go.",
  },
];

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "yes";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "yes");
  } catch {}
}

export function showOnboarding() {
  let index = 0;
  const signedIn = Boolean(getUser());
  const dialog = document.createElement("dialog");
  dialog.className = "tour";
  dialog.setAttribute("aria-labelledby", "tour-title");
  dialog.innerHTML = `
    <div class="tour__media">
      ${STEPS.map((step, i) => `
        <img class="tour__img${i === 0 ? " is-active" : ""}" src="${step.image}" alt=""
             style="object-position: ${step.position || "center"}">`).join("")}
      <button class="tour__skip" type="button" data-tour-close>Skip</button>
    </div>
    <div class="tour__body">
      <p class="tour__eyebrow" data-tour-eyebrow></p>
      <h2 class="tour__title" id="tour-title" data-tour-title></h2>
      <p class="tour__text" data-tour-text></p>
      <div class="tour__dots" role="group" aria-label="Choose a step">
        ${STEPS.map((step, i) => `
          <button class="tour__dot" type="button" data-tour-go="${i}"
                  aria-label="Step ${i + 1}: ${escapeHTML(step.title)}"></button>`).join("")}
      </div>
      <div class="tour__actions">
        <button class="btn tour__back" type="button" data-tour-back>Back</button>
        <button class="btn btn--solid" type="button" data-tour-next>Next</button>
        <a class="btn btn--solid" href="signin.html#create" data-tour-join hidden>Create free account</a>
        <button class="btn" type="button" data-tour-close data-tour-done hidden>Start exploring</button>
      </div>
      <p class="tour__count" aria-live="polite" data-tour-count></p>
    </div>`;

  document.body.append(dialog);

  function show(next) {
    index = Math.max(0, Math.min(STEPS.length - 1, next));
    const step = STEPS[index];
    const last = index === STEPS.length - 1;
    $("[data-tour-eyebrow]", dialog).textContent = step.eyebrow;
    $("[data-tour-title]", dialog).textContent = step.title;
    $("[data-tour-text]", dialog).textContent = step.text;
    $("[data-tour-count]", dialog).textContent = `Step ${index + 1} of ${STEPS.length}`;
    $$(".tour__img", dialog).forEach((image, i) => image.classList.toggle("is-active", i === index));
    $$(".tour__dot", dialog).forEach((dot, i) => dot.setAttribute("aria-current", i === index ? "step" : "false"));
    $("[data-tour-back]", dialog).hidden = index === 0;
    $("[data-tour-next]", dialog).hidden = last;
    $("[data-tour-join]", dialog).hidden = !last || signedIn;
    $("[data-tour-done]", dialog).hidden = !last;
    $("[data-tour-done]", dialog).classList.toggle("btn--solid", last && signedIn);
    $(".tour__skip", dialog).hidden = last;
    const focusTarget = last ? $(signedIn ? "[data-tour-done]" : "[data-tour-join]", dialog) : $("[data-tour-next]", dialog);
    focusTarget.focus();
  }

  $("[data-tour-next]", dialog).addEventListener("click", () => show(index + 1));
  $("[data-tour-back]", dialog).addEventListener("click", () => show(index - 1));
  $$("[data-tour-go]", dialog).forEach((dot) => dot.addEventListener("click", () => show(Number(dot.dataset.tourGo))));
  $$("[data-tour-close]", dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
  $("[data-tour-join]", dialog).addEventListener("click", () => markSeen());

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") show(index + 1);
    if (event.key === "ArrowLeft") show(index - 1);
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => {
    markSeen();
    dialog.remove();
  });

  dialog.showModal();
  show(0);
}

export function maybeShowOnboarding() {
  const page = document.body.dataset.page;
  const params = new URLSearchParams(location.search);
  if (hasSeen() || getUser() || page === "signin" || params.has("reset") || params.has("confirmed")) return;
  setTimeout(() => {
    if (!document.querySelector("dialog[open]")) showOnboarding();
  }, 700);
}
