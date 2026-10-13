const PREFIX = "wandr:";

export const store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(PREFIX + key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  },
};

export const SAMPLE_VISITED = ["kakum", "cape-coast", "labadi"];

export const DEFAULT_PREFS = {
  tripReminders: true,
  roomReplies: true,
  stayDeals: false,
  news: false,
  currency: "GHS",
  distance: "km",
};

function announce() {
  window.dispatchEvent(new CustomEvent("wandr:change"));
}

window.addEventListener("storage", (event) => {
  if (event.key?.startsWith(PREFIX)) announce();
});

export function getUser() {
  return store.get("user", null);
}

export function updateUser(changes) {
  const saved = store.set("user", { ...getUser(), ...changes });
  announce();
  return saved;
}

export function signInAs(name, email, visited) {
  const existing = getUser();
  store.set("user", existing && existing.email === email
    ? existing
    : { name, email, joined: new Date().toISOString() });
  if (!store.get("visited", null)) store.set("visited", visited);
  announce();
}

export function signOut() {
  store.remove("user");
  store.remove("visited");
  announce();
}

export function deleteAccount() {
  ["user", "visited", "prefs"].forEach((key) => store.remove(key));
  announce();
}

export function getVisited() {
  return store.get("visited", []);
}

export function toggleVisited(id) {
  const visited = getVisited();
  const been = visited.includes(id);
  store.set("visited", been ? visited.filter((v) => v !== id) : [...visited, id]);
  announce();
  return !been;
}

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...store.get("prefs", {}) };
}

export function setPref(key, value) {
  store.set("prefs", { ...getPrefs(), [key]: value });
}

export function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}

export function nameFromEmail(email) {
  const handle = email.trim().split("@")[0].split(/[._-]/)[0];
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}
