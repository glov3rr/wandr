import { $, $$ } from "./dom.js";

let toastTimer;

export function toast(message) {
  let box = $(".toast");
  if (!box) {
    box = document.createElement("div");
    box.className = "toast";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  box.textContent = message;
  box.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("is-visible"), 3500);
}

export function openDialog({ title, body, submitLabel, cancelLabel = "Cancel", onSubmit, onOpen, className = "" }) {
  const dialog = document.createElement("dialog");
  dialog.className = "modal " + className;

  const actions = submitLabel
    ? `<div class="modal__actions">
         <button class="btn" type="button" data-close>${cancelLabel}</button>
         <button class="btn btn--solid" type="submit">${submitLabel}</button>
       </div>`
    : "";

  dialog.innerHTML = `
    <div class="modal__head">
      <h2 class="modal__title">${title}</h2>
      <button class="modal__close" type="button" data-close aria-label="Close">×</button>
    </div>
    ${submitLabel
      ? `<form class="modal__body" novalidate>${body}${actions}</form>`
      : `<div class="modal__body">${body}</div>`}`;

  document.body.append(dialog);
  dialog.showModal();

  $$("[data-close]", dialog).forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());

  const form = $("form", dialog);
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (onSubmit(form) !== false) dialog.close();
    });
  }

  if (onOpen) onOpen(dialog);
  return dialog;
}

export function setupChips(container, onChange) {
  const chips = $$("[data-filter]", container);
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      chips.forEach((other) => {
        const on = other === chip;
        other.classList.toggle("chip--active", on);
        other.setAttribute("aria-pressed", on);
      });
      onChange(chip.dataset.filter);
    });
  });
}

export function chipsHTML(options) {
  return options.map(([value, label], index) => `
    <li><button class="chip${index === 0 ? " chip--active" : ""}" type="button"
      data-filter="${value}" aria-pressed="${index === 0}">${label}</button></li>`).join("");
}

export function markField(input, message) {
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
  input.setAttribute("aria-invalid", "true");
  input.setAttribute("aria-errormessage", error.id);
  return false;
}

export function focusFirstError(form) {
  $('[aria-invalid="true"]', form)?.focus();
}

export function setupPasswordToggles(root = document) {
  $$("[data-toggle-password]", root).forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.previousElementSibling;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
      button.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });
}

export const PASSWORD_RULES = {
  length: (value) => value.length >= 8,
  letter: (value) => /[a-z]/i.test(value),
  number: (value) => /[0-9]/.test(value),
};

export function setupStrengthMeter(input, root) {
  const meter = $("[data-meter]", root);
  function update() {
    let met = 0;
    $$("[data-rule]", root).forEach((item) => {
      const ok = PASSWORD_RULES[item.dataset.rule](input.value);
      item.classList.toggle("is-met", ok);
      if (ok) met++;
    });
    meter.dataset.level = met;
    $("span", meter).style.width = (met / 3) * 100 + "%";
  }
  input.addEventListener("input", update);
  return update;
}

export const isStrongPassword = (value) => Object.values(PASSWORD_RULES).every((rule) => rule(value));

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export function promptSignIn(title, text) {
  const back = encodeURIComponent(location.pathname.split("/").pop() + location.search + location.hash);
  openDialog({
    title,
    body: `
      <p>${text}</p>
      <div class="modal__actions">
        <a class="btn" href="signin.html?next=${back}#create">Create account</a>
        <a class="btn btn--solid" href="signin.html?next=${back}">Sign in</a>
      </div>`,
  });
}

export async function whileBusy(button, label, work) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await work();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}
