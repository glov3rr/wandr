import { $, $$, escapeHTML } from "../lib/dom.js";
import { openDialog, toast } from "../lib/ui.js";
import { getUser, initials } from "../lib/store.js";

export function avatarHTML(user) {
  return user.avatar ? `<img src="${user.avatar}" alt="">` : escapeHTML(initials(user.name));
}

function setupMenu() {
  const header = $(".site-header");
  const toggle = $(".menu-toggle");
  if (!header || !toggle) return;
  toggle.addEventListener("click", () => {
    const open = header.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
  });
}

export const DIALOGS = {
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
      <p>Wandr doesn't have a server yet. Your sign-in, profile and the places
         you've visited are kept in this browser only, and nothing you type is
         sent anywhere.</p>
      <p>The only outside request the site makes is for its font, from Google Fonts.</p>`,
  }),
};

function setupDialogButtons() {
  $$("[data-dialog]").forEach((button) => {
    button.addEventListener("click", () => DIALOGS[button.dataset.dialog]());
  });
}

function renderAccount() {
  const header = $(".site-header__inner");
  if (!header) return;
  const user = getUser();

  $(".profile", header)?.remove();
  $('a[href="signin.html"]', header).hidden = Boolean(user);
  if (!user) return;

  const link = document.createElement("a");
  link.className = "profile";
  link.href = "profile.html";
  link.setAttribute("aria-label", "Your profile");
  if (document.body.dataset.page === "profile") link.setAttribute("aria-current", "page");
  link.innerHTML = `
    <span class="profile__avatar" aria-hidden="true">${avatarHTML(user)}</span>
    <span class="profile__name">${escapeHTML(user.name.split(" ")[0])}</span>`;
  header.insertBefore(link, $(".menu-toggle", header));
}

export function setupHeader() {
  setupMenu();
  setupDialogButtons();
  renderAccount();
  window.addEventListener("wandr:change", renderAccount);
}
