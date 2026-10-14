import { $, $$, escapeHTML } from "../lib/dom.js";
import {
  openDialog, toast, setupChips, markField, focusFirstError, setupPasswordToggles,
  setupStrengthMeter, isStrongPassword, isEmail,
} from "../lib/ui.js";
import { placeUrl, regionLabel, exploredStats, imageSrc } from "../lib/data.js";
import {
  getUser, updateUser, getVisited, toggleVisited, getPrefs, setPref, signOut, deleteAccount,
} from "../lib/store.js";
import { avatarHTML } from "../components/header.js";

const REGION_COVERS = {
  "Central": "cape coast castle.jpeg",
  "Greater Accra": "labadi beach.jpg",
  "Volta": "wli waterfalls.jpeg",
  "Eastern": "aburi.jpg",
  "Savannah": "mole national park 1.jpeg",
  "Oti": "Lake-Volta-jpg.webp",
};

const BADGES = [
  { name: "First stop", rule: "Visit any place", progress: (s) => [Math.min(s.count, 1), 1] },
  { name: "Castle coast", rule: "All of Central's places", progress: (s) => s.inRegion("Central") },
  { name: "Accra local", rule: "All of Greater Accra's places", progress: (s) => s.inRegion("Greater Accra") },
  { name: "Volta highlands", rule: "All of Volta's places", progress: (s) => s.inRegion("Volta") },
  { name: "Into the north", rule: "Visit Mole National Park", progress: (s) => [s.visited.includes("mole") ? 1 : 0, 1] },
  { name: "Halfway there", rule: "Visit half of Wandr's places", progress: (s) => [Math.min(s.count, Math.ceil(s.total / 2)), Math.ceil(s.total / 2)] },
  { name: "Far north", rule: "Visit a place in the Upper East", progress: (s) => [Math.min(s.inRegion("Upper East")[0], 1), 1] },
  { name: "All of Wandr", rule: "Visit every place", progress: (s) => [s.count, s.total] },
];

const MEDAL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>';
const LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

const ACCOUNT_KEYS = ["name", "email", "emailVisibility", "phoneVisibility", "phoneCode", "phone", "region", "bio"];
const ACCOUNT_DEFAULTS = { emailVisibility: "private", phoneVisibility: "private", phoneCode: "+233" };

export default function profile(data) {
  const settings = $("[data-settings]");
  const user = getUser();
  $("[data-signed-out]").hidden = Boolean(user);
  $$("[data-signed-in]").forEach((part) => { part.hidden = !user; });
  if (!user) return;

  let placeFilter = "all";

  function render() {
    const current = getUser();
    if (!current) return;
    const stats = exploredStats(data, getVisited());
    const earned = BADGES.filter((badge) => {
      const [done, need] = badge.progress(stats);
      return done >= need;
    }).length;

    $$("[data-avatar]").forEach((slot) => { slot.innerHTML = avatarHTML(current); });
    $("[data-user-name]").textContent = current.name;
    $("[data-user-region]").textContent = current.region ? `${regionLabel(current.region)}, Ghana` : "Ghana";
    $("[data-user-since]").textContent = new Date(current.joined || Date.now())
      .toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    $("[data-user-bio]").textContent = current.bio || "";
    $("[data-cover]").src = "Images/" + (REGION_COVERS[current.region] || "kakum 1.jpeg");
    $("[data-avatar-remove]").hidden = !current.avatar;

    $('[data-stat="percent"]').textContent = stats.percent + "%";
    $('[data-stat="places"]').textContent = `${stats.count} / ${stats.total}`;
    $('[data-stat="regions"]').textContent = `${stats.regions} / ${stats.ghanaRegions}`;
    $('[data-stat="badges"]').textContent = `${earned} / ${BADGES.length}`;
    $("[data-nav-count]").textContent = stats.percent + "%";

    const circumference = 2 * Math.PI * 52;
    requestAnimationFrame(() => {
      $("[data-ring]").style.strokeDashoffset = circumference * (1 - stats.percent / 100);
    });
    $("[data-ring-percent]").textContent = stats.percent + "%";
    $("[data-ring-summary]").textContent = stats.count
      ? `You've been to ${stats.count} of ${stats.total} places, across ${stats.regions} of Ghana's ${stats.ghanaRegions} regions.`
      : "You haven't marked any places yet. Start with somewhere you've already been.";

    const next = stats.next;
    const nextCard = $("[data-next-card]");
    nextCard.classList.toggle("next-card--done", !next);
    nextCard.innerHTML = next
      ? `
        <img src="${imageSrc(next.image)}" alt="">
        <p class="eyebrow">Next up</p>
        <h3 class="next-card__name"><a href="${placeUrl(next)}">${escapeHTML(next.name)}</a></h3>
        <p class="next-card__region">${regionLabel(next.region)}</p>
        <div class="next-card__actions">
          <a class="btn btn--solid" href="${placeUrl(next)}">Plan a visit</a>
          <button class="btn" type="button" data-place="${next.id}">I've been here</button>
        </div>`
      : `
        <p class="eyebrow">All done</p>
        <h3 class="next-card__name">You've been everywhere on Wandr</h3>
        <p class="next-card__region">New places are added often. Check back soon.</p>`;

    $("[data-badge-count]").textContent = `${earned} of ${BADGES.length} earned`;
    $("[data-badges]").innerHTML = BADGES.map((badge) => {
      const [done, need] = badge.progress(stats);
      const got = done >= need;
      return `
        <li>
          <div class="badge-tile${got ? " is-earned" : ""}">
            <span class="badge-tile__medal">${got ? MEDAL : LOCK}</span>
            <p class="badge-tile__name">${badge.name}</p>
            <p class="badge-tile__rule">${got ? "Earned" : `${badge.rule} · ${done}/${need}`}</p>
            <span class="badge-tile__progress"><span style="width: ${(done / need) * 100}%"></span></span>
          </div>
        </li>`;
    }).join("");

    const countdown = $("[data-countdown]");
    const days = Math.ceil((new Date(countdown.dataset.date + "T00:00") - new Date()) / 86400000);
    countdown.innerHTML = days > 0
      ? `${days} <span>${days === 1 ? "day" : "days"} to go</span>`
      : `<span>This trip has started. Enjoy it.</span>`;

    const steps = [
      { label: "Add a profile photo", done: Boolean(current.avatar), field: "avatar-file" },
      { label: "Choose your home region", done: Boolean(current.region), field: "pf-region" },
      { label: "Add your phone number", done: Boolean(current.phone), field: "pf-phone" },
      { label: "Write a short bio", done: Boolean(current.bio), field: "pf-bio" },
      { label: "Mark a place you've visited", done: stats.count > 0, section: "progress" },
    ];
    const complete = Math.round((steps.filter((step) => step.done).length / steps.length) * 100);
    $("[data-complete-percent]").textContent = complete + "%";
    $("[data-complete-bar]").style.width = complete + "%";
    $("[data-checklist]").innerHTML = steps.map((step) => `
      <li class="${step.done ? "is-done" : ""}">
        <span class="checklist__mark" aria-hidden="true">✓</span>
        <span class="checklist__label">${step.label}</span>
        ${step.done ? "" : `<button class="link-btn checklist__go" type="button"
          data-go="${step.section || "account"}" ${step.field ? `data-focus="${step.field}"` : ""}>Add</button>`}
      </li>`).join("");

    $("[data-map-pins]").innerHTML = data.places.map((place) => {
      const been = stats.visited.includes(place.id);
      return `<a class="map-pin${been ? " is-done" : ""}" href="${placeUrl(place)}"
        style="--x: ${place.map.x}%; --y: ${place.map.y}%" title="${escapeHTML(place.name)}"
        aria-label="${escapeHTML(place.name)}, ${been ? "visited" : "not visited yet"}"></a>`;
    }).join("");

    $("[data-region-list]").innerHTML = data.regions.map((region) => {
      const [done, total] = stats.inRegion(region);
      return `
        <li>
          <span class="region-list__name">${region}</span>
          <span class="region-list__bar"><span style="width: ${(done / total) * 100}%"></span></span>
          <span class="region-list__count">${done} / ${total}</span>
        </li>`;
    }).join("");
    $("[data-region-note]").textContent =
      `Wandr lists places in ${data.regions.length} of Ghana's ${stats.ghanaRegions} regions so far.`;

    const shown = data.places.filter((place) => {
      const been = stats.visited.includes(place.id);
      return placeFilter === "all" || (placeFilter === "visited" ? been : !been);
    });

    $("[data-place-grid]").innerHTML = shown.map((place) => {
      const been = stats.visited.includes(place.id);
      return `
        <li>
          <article class="place-card${been ? " is-visited" : ""}">
            <img class="place-card__img" src="${imageSrc(place.image)}" alt="" loading="lazy">
            ${been ? '<span class="place-card__stamp">Visited</span>' : ""}
            <div class="place-card__body">
              <h3 class="place-card__name"><a href="${placeUrl(place)}">${escapeHTML(place.name)}</a></h3>
              <p class="place-card__region">${place.region}</p>
              <button class="place-card__toggle" type="button" data-place="${place.id}" aria-pressed="${been}">
                ${been ? "Visited ✓" : "Mark as visited"}
              </button>
            </div>
          </article>
        </li>`;
    }).join("");

    const empty = $("[data-place-empty]");
    empty.hidden = shown.length > 0;
    empty.textContent = placeFilter === "visited"
      ? "No places marked yet. Switch to All and tick the ones you've been to."
      : "You've been to every place on Wandr.";
  }

  const titles = Object.fromEntries($$("[data-section-link]").map((link) =>
    [link.dataset.sectionLink, $("span", link).textContent.trim()]));

  function showSection(name, focusId) {
    if (!titles[name]) name = "overview";
    $$("[data-panel]").forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
    $$("[data-section-link]").forEach((link) => {
      if (link.dataset.sectionLink === name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    $("[data-section-title]").textContent = titles[name];
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    if (focusId) {
      const target = document.getElementById(focusId);
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", (event) => {
    const link = event.target.closest("[data-section-link], [data-go]");
    if (!link) return;
    event.preventDefault();
    showSection(link.dataset.sectionLink || link.dataset.go, link.dataset.focus);
    if (!link.dataset.focus) settings.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  window.addEventListener("hashchange", () => showSection(location.hash.slice(1)));
  window.addEventListener("wandr:change", render);
  showSection(location.hash.slice(1));
  render();

  settings.addEventListener("click", (event) => {
    const button = event.target.closest("[data-place]");
    if (!button) return;
    const id = button.dataset.place;
    const added = toggleVisited(id);
    if (button.closest(".place-grid")) $(`.place-grid [data-place="${id}"]`)?.focus();
    toast(added ? `${data.place(id).name} added to your places.` : `${data.place(id).name} removed.`);
  });

  setupChips($("[data-place-filter]"), (value) => {
    placeFilter = value;
    render();
  });

  setupPasswordToggles(settings);

  const account = $('[data-form="account"]');
  const fields = account.elements;
  const count = $("[data-count]", account);
  const saveBar = $("[data-save-bar]", account);

  const savedValues = () => {
    const current = getUser();
    return Object.fromEntries(ACCOUNT_KEYS.map((key) => [key, current[key] || ACCOUNT_DEFAULTS[key] || ""]));
  };
  const formValues = () => Object.fromEntries(ACCOUNT_KEYS.map((key) => [key, fields[key].value.trim()]));
  const isDirty = () => {
    const saved = savedValues();
    const now = formValues();
    return ACCOUNT_KEYS.some((key) => saved[key] !== now[key]);
  };

  function updateSaveBar() {
    const dirty = isDirty();
    saveBar.classList.toggle("is-dirty", dirty);
    $("[data-save-status]", saveBar).textContent = dirty ? "You have unsaved changes" : "All changes saved";
    $$("button", saveBar).forEach((button) => { button.disabled = !dirty; });
  }

  function fillAccount() {
    const saved = savedValues();
    ACCOUNT_KEYS.forEach((key) => { fields[key].value = saved[key]; });
    count.textContent = `${fields.bio.value.length} / 160`;
    $$("input", account).forEach((input) => markField(input, ""));
    updateSaveBar();
  }

  fillAccount();

  account.addEventListener("input", (event) => {
    if (event.target === fields.bio) count.textContent = `${fields.bio.value.length} / 160`;
    if (event.target.matches("input")) markField(event.target, "");
    updateSaveBar();
  });
  account.addEventListener("change", updateSaveBar);

  account.addEventListener("reset", (event) => {
    event.preventDefault();
    fillAccount();
    toast("Changes discarded.");
  });

  account.addEventListener("submit", (event) => {
    event.preventDefault();
    const values = formValues();
    const phone = values.phone.replace(/\s/g, "");
    const ok = [
      markField(fields.name, values.name.length >= 2 ? "" : "Enter your name."),
      markField(fields.email, isEmail(values.email) ? "" : "Enter a full email address, like ama@example.com."),
      markField(fields.phone, !phone || /^\d{7,12}$/.test(phone) ? "" : "Use digits only, without the country code."),
    ].every(Boolean);
    if (!ok) return focusFirstError(account);

    updateUser(values);
    updateSaveBar();
    toast("Your profile is saved.");
  });

  window.addEventListener("beforeunload", (event) => {
    if (getUser() && isDirty()) event.preventDefault();
  });

  const fileInput = $("[data-avatar-input]");
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    fileInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast("That file isn't an image. Choose a JPG or PNG.");
    if (file.size > 2 * 1024 * 1024) return toast("That photo is over 2 MB. Choose a smaller one.");

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const image = new Image();
      image.addEventListener("load", () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(image.width, image.height);
        canvas.getContext("2d").drawImage(
          image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, size, size);
        const saved = updateUser({ avatar: canvas.toDataURL("image/jpeg", 0.85) });
        toast(saved ? "Profile photo updated." : "Your browser couldn't save that photo.");
      });
      image.src = reader.result;
    });
    reader.readAsDataURL(file);
  });

  $("[data-avatar-remove]").addEventListener("click", () => {
    updateUser({ avatar: null });
    toast("Profile photo removed.");
  });

  const password = $('[data-form="password"]');
  const updateRules = setupStrengthMeter(password.elements.next, password);
  $$("input", password).forEach((input) => input.addEventListener("input", () => markField(input, "")));
  password.addEventListener("reset", () => {
    setTimeout(() => {
      updateRules();
      $$("input", password).forEach((input) => markField(input, ""));
    });
  });

  password.addEventListener("submit", (event) => {
    event.preventDefault();
    const { current, next, confirm } = password.elements;
    const ok = [
      markField(current, current.value ? "" : "Enter your current password."),
      markField(next,
        !isStrongPassword(next.value) ? "Use 8 or more characters, with at least one letter and one number."
        : next.value === current.value ? "Choose a password that's different from your current one."
        : ""),
      markField(confirm,
        !confirm.value ? "Type your new password again."
        : confirm.value !== next.value ? "The two new passwords don't match."
        : ""),
    ].every(Boolean);
    if (!ok) return focusFirstError(password);
    password.reset();
    toast("Password updated.");
  });

  const prefs = $('[data-form="preferences"]');
  Object.entries(getPrefs()).forEach(([key, value]) => {
    const field = prefs.elements[key];
    if (!field) return;
    if (field.type === "checkbox") field.checked = value;
    else field.value = value;
  });
  prefs.addEventListener("change", (event) => {
    const field = event.target;
    setPref(field.name, field.type === "checkbox" ? field.checked : field.value);
    toast("Preference saved.");
  });

  $("[data-sign-out]").addEventListener("click", () => {
    signOut();
    location.href = "home.html";
  });

  $("[data-delete-account]").addEventListener("click", () => {
    openDialog({
      title: "Delete your account?",
      submitLabel: "Delete account",
      body: `
        <p>This removes your profile, your places visited and your preferences. It can't be undone.</p>
        <p class="field">
          <label class="field__label" for="del-confirm">Type DELETE to confirm</label>
          <input class="field__input confirm-input" id="del-confirm" name="confirm" autocomplete="off" required>
        </p>`,
      onSubmit(form) {
        const input = form.elements.confirm;
        if (input.value.trim().toUpperCase() !== "DELETE") {
          input.setCustomValidity("Type DELETE to confirm.");
          input.reportValidity();
          input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
          return false;
        }
        deleteAccount();
        location.href = "home.html";
      },
    });
  });
}
