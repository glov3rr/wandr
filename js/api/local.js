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

export async function saveProfile(changes) {
  const { prefs, ...rest } = changes;
  if (prefs) write("prefs", prefs);
  write("user", { ...read("user", {}), ...rest });
}

export async function deleteAccount() {
  ["user", "visited", "saved", "prefs", "trips", "bookings", "rooms", "messages"].forEach(remove);
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

export const trips = recordList("trips", (trip) => ({ ...trip, status: trip.start ? "planned" : "draft" }));
export const bookings = recordList("bookings", (booking) => ({ ...booking, status: "requested" }));

async function seedRooms() {
  const response = await fetch("data/wandr.json");
  if (!response.ok) throw new Error("Wandr couldn't load the chat rooms.");
  return (await response.json()).rooms;
}

function seedMessages(room) {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return room.messages.map((message, index) => ({
    id: `${room.id}-${index}`,
    who: message.who,
    text: message.text,
    at: new Date(`${yesterday}T${message.time}:00`).toISOString(),
    mine: false,
  }));
}

function allMessages(room) {
  return [...seedMessages(room), ...(read("messages", {})[room.id] || [])];
}

export const community = {
  async rooms() {
    const joined = read("rooms", ["kakum", "accra", "solo"]);
    return (await seedRooms()).map((room) => {
      const messages = allMessages(room);
      const isJoined = Boolean(signedInUser()) && joined.includes(room.id);
      return {
        id: room.id,
        name: room.name,
        initials: room.initials,
        groups: room.groups,
        members: room.members + (isJoined ? 1 : 0),
        joined: isJoined,
        last: messages.at(-1) || null,
      };
    });
  },
  async messages(roomId) {
    const room = (await seedRooms()).find((item) => item.id === roomId);
    return room ? allMessages(room) : [];
  },
  async send(roomId, text) {
    const user = signedInUser();
    const message = { id: newId(), who: user.name, text, at: new Date().toISOString(), mine: true };
    const stored = read("messages", {});
    write("messages", { ...stored, [roomId]: [...(stored[roomId] || []), message] });
    return message;
  },
  async join(roomId) {
    write("rooms", [...new Set([...read("rooms", ["kakum", "accra", "solo"]), roomId])]);
    return (await this.rooms()).find((room) => room.id === roomId).members;
  },
  async leave(roomId) {
    write("rooms", read("rooms", ["kakum", "accra", "solo"]).filter((id) => id !== roomId));
    return (await this.rooms()).find((room) => room.id === roomId).members;
  },
  async listen() {
    return () => {};
  },
};

export async function catalog() {
  const response = await fetch("data/wandr.json");
  if (!response.ok) throw new Error(`data/wandr.json answered ${response.status}`);
  return response.json();
}
