import { api, hasBackend } from "../api/index.js";
import { toast } from "./ui.js";
import { withTimeout } from "./dom.js";

export const DEFAULT_PREFS = {
  tripReminders: true,
  roomReplies: true,
  stayDeals: false,
  news: false,
  currency: "GHS",
  distance: "km",
};

let user = null;
let visitedIds = [];
let savedIds = [];
let lastAuthEvent = null;

function announce() {
  window.dispatchEvent(new CustomEvent("wandr:change"));
}

const CACHE_KEY = "wandr:me";

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache() {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify({ user, visitedIds, savedIds }));
    else localStorage.removeItem(CACHE_KEY);
  } catch {}
}

async function loadLists() {
  if (!user) {
    visitedIds = [];
    savedIds = [];
    return;
  }
  [visitedIds, savedIds] = await Promise.all([api.visited.list(), api.saved.list()]);
}

async function refresh() {
  const [next, visited, saved] = await Promise.all([api.currentUser(), api.visited.list(), api.saved.list()]);
  user = next;
  visitedIds = next ? visited : [];
  savedIds = next ? saved : [];
  writeCache();
}

export async function initSession() {
  try {
    const id = await withTimeout(api.sessionUserId(), 6000, "Checking your sign-in took too long.");
    const cache = readCache();
    if (!id) {
      user = null;
      writeCache();
    } else if (cache?.user?.id === id) {
      ({ user, visitedIds, savedIds } = cache);
      refresh().then(announce).catch(console.error);
    } else {
      await withTimeout(refresh(), 6000, "Loading your account took too long.");
    }
  } catch (error) {
    console.error(error);
    user = null;
  }
  api.onAuthChange(async (next, event) => {
    user = next;
    lastAuthEvent = event;
    await loadLists().catch(console.error);
    writeCache();
    announce();
  });
}

export const getUser = () => user;

export const authEvent = () => lastAuthEvent;

export async function signUp(details) {
  const result = await api.signUp(details);
  if (result.user) {
    user = result.user;
    await loadLists();
    writeCache();
    announce();
  }
  return result;
}

export async function signIn(details) {
  user = await api.signIn(details);
  await loadLists();
  writeCache();
  announce();
  return user;
}

function forget() {
  user = null;
  visitedIds = [];
  savedIds = [];
  writeCache();
  announce();
}

export async function signOut() {
  await api.signOut();
  forget();
}

export async function deleteAccount() {
  await api.deleteAccount();
  forget();
}

export async function updateUser(changes) {
  await api.saveProfile(changes);
  user = { ...user, ...changes };
  writeCache();
  announce();
}

export async function changeEmail(email) {
  await api.changeEmail(email);
  if (!hasBackend) {
    user = { ...user, email };
    writeCache();
    announce();
  }
}

export const resetPassword = (email) => api.resetPassword(email);
export const setNewPassword = (password) => api.setNewPassword(password);
export const changePassword = (current, next) => api.changePassword(current, next);

function toggler(getList, setList, remote) {
  return (id) => {
    const before = getList();
    const had = before.includes(id);
    setList(had ? before.filter((item) => item !== id) : [...before, id]);
    writeCache();
    announce();
    (had ? remote.remove(id) : remote.add(id)).catch((error) => {
      setList(before);
      writeCache();
      announce();
      toast(error.message);
    });
    return !had;
  };
}

export const getVisited = () => visitedIds;
export const toggleVisited = toggler(() => visitedIds, (list) => { visitedIds = list; }, api.visited);

export const getSaved = () => savedIds;
export const toggleSaved = toggler(() => savedIds, (list) => { savedIds = list; }, api.saved);

export const getPrefs = () => ({ ...DEFAULT_PREFS, ...(user?.prefs || {}) });

export async function setPref(key, value) {
  const prefs = { ...getPrefs(), [key]: value };
  await api.saveProfile({ prefs });
  user = { ...user, prefs };
  writeCache();
}

export const trips = api.trips;
export const bookings = api.bookings;
export const community = api.community;

export function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("");
}
