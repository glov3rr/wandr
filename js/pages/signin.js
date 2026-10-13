import { $, $$, escapeHTML } from "../lib/dom.js";
import {
  openDialog, toast, markField, focusFirstError, setupPasswordToggles,
  setupStrengthMeter, isStrongPassword, isEmail,
} from "../lib/ui.js";
import { signInAs, nameFromEmail, SAMPLE_VISITED } from "../lib/store.js";

const COPY = {
  signin: { title: "Welcome back", lead: "Sign in to see your saved trips and bookings." },
  create: { title: "Create your account", lead: "Save trips, book stays and join the community." },
};

export default function signin() {
  const tabs = $$('[role="tab"]');

  function showTab(name) {
    tabs.forEach((tab) => {
      const on = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", on);
      tab.tabIndex = on ? 0 : -1;
      $("#" + tab.getAttribute("aria-controls")).hidden = !on;
    });
    $("[data-auth-title]").textContent = COPY[name].title;
    $("[data-auth-lead]").textContent = COPY[name].lead;
    history.replaceState(null, "", name === "create" ? "#create" : location.pathname);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => showTab(tab.dataset.tab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const next = tabs[(index + 1) % tabs.length];
      showTab(next.dataset.tab);
      next.focus();
    });
  });

  const fromAddress = () => showTab(location.hash === "#create" ? "create" : "signin");
  fromAddress();
  window.addEventListener("hashchange", fromAddress);

  setupPasswordToggles();
  $$(".auth__form input").forEach((input) => input.addEventListener("input", () => markField(input, "")));

  const checkEmail = (input) => {
    if (!input.value.trim()) return markField(input, "Enter your email address.");
    if (!isEmail(input.value)) return markField(input, "That doesn't look complete. It should be like ama@example.com.");
    return markField(input, "");
  };

  function fakeRequest(form, busyText, done) {
    const button = $('button[type="submit"]', form);
    const label = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    setTimeout(() => {
      button.disabled = false;
      button.textContent = label;
      done();
    }, 900);
  }

  function finish(title, text) {
    $("[data-auth-forms]").hidden = true;
    const done = $("[data-auth-done]");
    $("[data-done-title]", done).textContent = title;
    $("[data-done-text]", done).textContent = text;
    done.hidden = false;
    done.focus();
  }

  const signInForm = $('[data-auth="signin"]');
  signInForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { email, password } = signInForm.elements;
    const ok = [
      checkEmail(email),
      markField(password, password.value ? "" : "Enter your password."),
    ].every(Boolean);
    if (!ok) return focusFirstError(signInForm);

    fakeRequest(signInForm, "Signing in…", () => {
      signInAs(nameFromEmail(email.value), email.value.trim(), SAMPLE_VISITED);
      finish("You're signed in", `Welcome back. You're signed in as ${email.value.trim()}.`);
    });
  });

  const createForm = $('[data-auth="create"]');
  setupStrengthMeter(createForm.elements.password, createForm);

  createForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const { name, email, password, confirm, terms } = createForm.elements;
    const ok = [
      markField(name, name.value.trim().length >= 2 ? "" : "Enter your name."),
      checkEmail(email),
      markField(password, isStrongPassword(password.value) ? "" : "Use 8 or more characters, with at least one letter and one number."),
      markField(confirm,
        !confirm.value ? "Type your password again."
        : confirm.value !== password.value ? "The two passwords don't match."
        : ""),
      markField(terms, terms.checked ? "" : "Tick this box to create an account."),
    ].every(Boolean);
    if (!ok) return focusFirstError(createForm);

    const firstName = name.value.trim().split(" ")[0];
    fakeRequest(createForm, "Creating account…", () => {
      signInAs(name.value.trim(), email.value.trim(), []);
      finish(`Welcome to Wandr, ${firstName}`,
        `Your account is ready. We've sent a confirmation link to ${email.value.trim()}.`);
    });
  });

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
      onSubmit(form) { toast(`Reset link sent to ${form.elements.email.value.trim()}.`); },
    });
  });

  $("[data-google]").addEventListener("click", () => {
    toast("Google sign-in isn't connected yet. Use your email for now.");
  });
}
