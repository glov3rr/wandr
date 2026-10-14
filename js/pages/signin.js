import { $, $$, escapeHTML } from "../lib/dom.js";
import {
  openDialog, toast, markField, focusFirstError, setupPasswordToggles,
  setupStrengthMeter, isStrongPassword, isEmail, whileBusy,
} from "../lib/ui.js";
import { getUser, signIn, signUp, resetPassword, setNewPassword, authEvent } from "../lib/store.js";

const COPY = {
  signin: { title: "Welcome back", lead: "Sign in to see your saved trips and bookings." },
  create: { title: "Create your account", lead: "Save trips, book stays and join the community." },
};

const params = new URLSearchParams(location.search);

function nextPage() {
  const next = params.get("next") || "";
  return /^[a-z]+\.html([?#][\w=&#.%-]*)?$/.test(next) ? next : null;
}

function choosePassword() {
  openDialog({
    title: "Choose a new password",
    submitLabel: "Save password",
    body: `
      <p>Pick a new password for your Wandr account.</p>
      <p class="field">
        <label class="field__label" for="np-password">New password</label>
        <input class="field__input" id="np-password" name="password" type="password"
               autocomplete="new-password" minlength="8" required>
      </p>`,
    onSubmit(form) {
      const input = form.elements.password;
      if (!isStrongPassword(input.value)) {
        input.setCustomValidity("Use 8 or more characters, with at least one letter and one number.");
        input.reportValidity();
        input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
        return false;
      }
      setNewPassword(input.value)
        .then(() => toast("Your new password is saved."))
        .catch((error) => toast(error.message));
    },
  });
}

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
    history.replaceState(null, "", location.pathname + location.search + (name === "create" ? "#create" : ""));
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

  function finish(title, text) {
    $("[data-auth-forms]").hidden = true;
    const done = $("[data-auth-done]");
    $("[data-done-title]", done).textContent = title;
    $("[data-done-text]", done).textContent = text;
    done.hidden = false;
    done.focus();
  }

  function signedIn(title, text) {
    const next = nextPage();
    if (next) {
      location.href = next;
      return;
    }
    finish(title, text);
  }

  const user = getUser();
  if (user) {
    if (params.has("reset") || authEvent() === "PASSWORD_RECOVERY") {
      finish("Reset your password", "Choose a new password to finish.");
      choosePassword();
    } else if (params.has("confirmed")) {
      finish(`Welcome to Wandr, ${user.name.split(" ")[0]}`, "Your email is confirmed and you're signed in.");
    } else {
      finish("You're signed in", `You're signed in as ${user.email}.`);
    }
  }

  window.addEventListener("wandr:change", () => {
    if (authEvent() === "PASSWORD_RECOVERY") {
      finish("Reset your password", "Choose a new password to finish.");
      choosePassword();
    }
  });

  const signInForm = $('[data-auth="signin"]');
  signInForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const { email, password } = signInForm.elements;
    const ok = [
      checkEmail(email),
      markField(password, password.value ? "" : "Enter your password."),
    ].every(Boolean);
    if (!ok) return focusFirstError(signInForm);

    try {
      const signedInUser = await whileBusy($('button[type="submit"]', signInForm), "Signing in…",
        () => signIn({ email: email.value.trim(), password: password.value }));
      signedIn("You're signed in", `Welcome back, ${signedInUser.name.split(" ")[0]}. You're signed in as ${signedInUser.email}.`);
    } catch (error) {
      markField(password, error.message);
      focusFirstError(signInForm);
    }
  });

  const createForm = $('[data-auth="create"]');
  setupStrengthMeter(createForm.elements.password, createForm);

  createForm.addEventListener("submit", async (event) => {
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
    const address = email.value.trim();
    try {
      const result = await whileBusy($('button[type="submit"]', createForm), "Creating account…",
        () => signUp({ name: name.value.trim(), email: address, password: password.value }));
      if (result.needsConfirm) {
        finish("Check your email", `We sent a confirmation link to ${address}. Open it to finish creating your account.`);
      } else {
        signedIn(`Welcome to Wandr, ${firstName}`, "Your account is ready and you're signed in.");
      }
    } catch (error) {
      markField(email, error.message);
      focusFirstError(createForm);
    }
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
      onSubmit(form) {
        const address = form.elements.email.value.trim();
        resetPassword(address)
          .then(() => toast(`If ${address} has an account, a reset link is on its way.`))
          .catch((error) => toast(error.message));
      },
    });
  });

  $("[data-google]").addEventListener("click", () => {
    toast("Google sign-in isn't connected yet. Use your email for now.");
  });
}
