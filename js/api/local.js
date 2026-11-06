import { validateTrip, validateBooking, validateProfile, validateMessage, validateRoom, validateReport, slugify } from "./validators.js";

const PREFIX = "wandr:";
const SAMPLE_VISITED = ["kakum", "cape-coast", "labadi"];

function read(key, fallback) {
  try {
    const value = localStorage.getItem(PREFIX + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    throw new Error("Your browser couldn't save that. It may be out of space or in private mode.");
  }
}

function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch {}
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

function nameFromEmail(email) {
  const handle = email.trim().split("@")[0].split(/[._-]/)[0];
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

function signedInUser() {
  const user = read("user", null);
  if (!user) return null;
  return { id: "local", prefs: read("prefs", {}), ...user };
}

export async function sessionUserId() {
  return read("user", null) ? "local" : null;
}

export async function currentUser() {
  return signedInUser();
}

export async function onAuthChange(callback) {
  window.addEventListener("storage", (event) => {
    if (event.key === PREFIX + "user") callback(signedInUser(), "STORAGE");
  });
}

function startSession(name, email, visited) {
  const existing = read("user", null);
  write("user", existing && existing.email === email
    ? existing
    : { name, email, joined: new Date().toISOString() });
  if (!read("visited", null)) write("visited", visited);
  return signedInUser();
}

export async function signUp({ name, email }) {
  return { user: startSession(name, email, []), needsConfirm: false };
}

export async function signIn({ email }) {
  return startSession(nameFromEmail(email), email, SAMPLE_VISITED);
}

export async function signOut() {
  remove("user");
  remove("visited");
}

export async function resetPassword() {}

export async function setNewPassword() {}

export async function changePassword() {}

export async function changeEmail(email) {
  write("user", { ...read("user", {}), email });
}

export async function saveProfile(input) {
  const { prefs, ...rest } = validateProfile(input);
  if (prefs) write("prefs", prefs);
  write("user", { ...read("user", {}), ...rest });
}

export async function deleteAccount() {
  ["user", "visited", "saved", "prefs", "trips", "bookings", "rooms", "messages", "created-rooms", "read-at"].forEach(remove);
}

function placeList(key) {
  return {
    async list() { return read(key, []); },
    async add(placeId) { write(key, [...new Set([...read(key, []), placeId])]); },
    async remove(placeId) { write(key, read(key, []).filter((id) => id !== placeId)); },
  };
}

export const visited = placeList("visited");
export const saved = placeList("saved");

function recordList(key, build) {
  return {
    async list() { return read(key, []); },
    async add(item) {
      const record = { id: newId(), created: new Date().toISOString(), ...build(item) };
      write(key, [record, ...read(key, [])]);
      return record;
    },
    async remove(id) { write(key, read(key, []).filter((record) => record.id !== id)); },
  };
}

export const trips = recordList("trips", (input) => {
  const trip = validateTrip(input);
  return { ...trip, status: trip.start ? "planned" : "draft" };
});
export const bookings = recordList("bookings", (input) => ({ ...validateBooking(input), status: "requested" }));

const PAGE = 40;
const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("wandr-community") : null;

async function seedRooms() {
  const response = await fetch("data/wandr.json");
  if (!response.ok) throw new Error("Wandr couldn't load the chat rooms.");
  return (await response.json()).rooms;
}

async function allRooms() {
  return [...(await seedRooms()), ...read("created-rooms", [])];
}

const roomMessages = (roomId) => read("messages", {})[roomId] || [];

function shape(room) {
  const user = signedInUser();
  const joined = Boolean(user) && read("rooms", []).includes(room.id);
  const visible = roomMessages(room.id).filter((message) => !message.deleted);
  const readAt = read("read-at", {})[room.id] || "";
  return {
    id: room.id,
    name: room.name,
    initials: room.initials,
    groups: room.groups || [],
    description: room.description || "",
    members: joined ? 1 : 0,
    sort: room.sort ?? 0,
    createdBy: room.createdBy || "",
    createdAt: room.createdAt || null,
    mine: Boolean(room.createdBy),
    joined,
    unread: joined ? visible.filter((message) => !message.mine && message.at > readAt).length : 0,
    last: visible.at(-1) || null,
  };
}

function tell(kind, payload) {
  channel?.postMessage({ kind, payload });
}

export const community = {
  live: false,
  async rooms() {
    return (await allRooms()).map(shape);
  },
  async messages(roomId, beforeId) {
    const all = roomMessages(roomId);
    const end = beforeId ? all.findIndex((message) => message.id === beforeId) : all.length;
    const start = Math.max(0, end - PAGE);
    return { messages: all.slice(start, end), more: start > 0 };
  },
  async send(roomId, text) {
    const user = signedInUser();
    if (!user) throw new Error("Sign in to send messages.");
    if (!read("rooms", []).includes(roomId)) throw new Error("Join the room to send messages.");
    const message = { id: newId(), roomId, who: user.name, text: validateMessage(text), at: new Date().toISOString(), deleted: false, mine: true };
    const stored = read("messages", {});
    write("messages", { ...stored, [roomId]: [...(stored[roomId] || []), message] });
    tell("message", message);
    return message;
  },
  async create(input) {
    const user = signedInUser();
    if (!user) throw new Error("Sign in to create a room.");
    const value = validateRoom(input);
    const rooms = await allRooms();
    if (rooms.some((room) => room.name.toLowerCase() === value.name.toLowerCase())) {
      throw new Error(`There's already a room called ${value.name}. Join that one instead.`);
    }
    const base = slugify(value.name) || "room";
    let id = base;
    for (let n = 2; rooms.some((room) => room.id === id); n++) id = `${base}-${n}`;
    const words = value.name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean);
    const room = {
      id,
      name: value.name,
      initials: ((words[0]?.[0] || "R") + (words[1]?.[0] || "")).toUpperCase(),
      groups: value.topic ? [value.topic] : [],
      description: value.description,
      sort: rooms.length,
      createdBy: user.name,
      createdAt: new Date().toISOString(),
    };
    write("created-rooms", [...read("created-rooms", []), room]);
    write("rooms", [...read("rooms", []), id]);
    return shape(room);
  },
  async remove(messageId) {
    const stored = read("messages", {});
    for (const [roomId, list] of Object.entries(stored)) {
      const message = list.find((item) => item.id === messageId && item.mine);
      if (!message) continue;
      Object.assign(message, { deleted: true, text: "" });
      write("messages", { ...stored, [roomId]: list });
      tell("message", message);
      return;
    }
    throw new Error("You can only delete your own messages.");
  },
  async report(messageId, input) {
    validateReport(input);
  },
  async markRead(roomId) {
    write("read-at", { ...read("read-at", {}), [roomId]: new Date().toISOString() });
  },
  async join(roomId) {
    if (!signedInUser()) throw new Error("Sign in to join rooms.");
    write("rooms", [...new Set([...read("rooms", []), roomId])]);
    return 1;
  },
  async leave(roomId) {
    write("rooms", read("rooms", []).filter((id) => id !== roomId));
    return 0;
  },
  async watch({ message }) {
    if (!channel) return () => {};
    const listener = (event) => {
      if (event.data.kind === "message") message({ ...event.data.payload, mine: true });
    };
    channel.addEventListener("message", listener);
    return () => channel.removeEventListener("message", listener);
  },
  async presence(roomId, onCount) {
    onCount(signedInUser() ? 1 : 0);
    return () => {};
  },
};

export async function catalog() {
  const response = await fetch("data/wandr.json");
  if (!response.ok) throw new Error(`data/wandr.json answered ${response.status}`);
  return response.json();
}
