import { getClient } from "../lib/supabase.js";
import * as serialize from "./serializers.js";
import { validateTrip, validateBooking, validateProfile, validateMessage } from "./validators.js";

let me = null;

const AUTH_MESSAGES = [
  [/invalid login credentials/i, "That email and password don't match. Check them and try again."],
  [/already registered|already been registered/i, "There's already an account with that email. Sign in instead."],
  [/email not confirmed/i, "Confirm your email first. Open the link we sent to your inbox."],
  [/rate limit|too many/i, "Too many attempts. Wait a minute and try again."],
  [/password should be|weak password/i, "Choose a stronger password: 8 or more characters with letters and numbers."],
  [/failed to fetch|network/i, "Wandr can't reach the server. Check your connection and try again."],
];

function friendly(error) {
  const text = error?.message || String(error);
  const match = AUTH_MESSAGES.find(([pattern]) => pattern.test(text));
  return new Error(match ? match[1] : text);
}

async function run(request) {
  const { data, error } = await request;
  if (error) throw friendly(error);
  return data;
}

const pageUrl = (page) => new URL(page, location.href).href;

async function loadUser(authUser) {
  if (!authUser) {
    me = null;
    return null;
  }
  const db = await getClient();
  const [row, isAdmin] = await Promise.all([
    run(db.from("profiles").select("*").eq("id", authUser.id).maybeSingle()),
    db.rpc("is_admin").then(({ data }) => data === true, () => false),
  ]);
  me = serialize.profile.fromRow(authUser, row, isAdmin);
  return me;
}

export async function sessionUserId() {
  const db = await getClient();
  const { data } = await db.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser) {
    me = null;
    return null;
  }
  if (me?.id !== authUser.id) me = serialize.profile.fromRow(authUser, null);
  return authUser.id;
}

export async function currentUser() {
  const db = await getClient();
  const { data } = await db.auth.getSession();
  return loadUser(data.session?.user);
}

export async function onAuthChange(callback) {
  const db = await getClient();
  db.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") return;
    setTimeout(async () => callback(await loadUser(session?.user), event));
  });
}

export async function signUp({ name, email, password }) {
  const db = await getClient();
  const data = await run(db.auth.signUp({
    email,
    password,
    options: { data: { name }, emailRedirectTo: pageUrl("signin.html?confirmed=1") },
  }));
  if (data.user && data.user.identities?.length === 0) {
    throw new Error("There's already an account with that email. Sign in instead.");
  }
  if (!data.session) return { user: null, needsConfirm: true };
  return { user: await loadUser(data.user), needsConfirm: false };
}

export async function signIn({ email, password }) {
  const db = await getClient();
  const data = await run(db.auth.signInWithPassword({ email, password }));
  return loadUser(data.user);
}

export async function signOut() {
  const db = await getClient();
  await run(db.auth.signOut());
  me = null;
}

export async function resetPassword(email) {
  const db = await getClient();
  await run(db.auth.resetPasswordForEmail(email, { redirectTo: pageUrl("signin.html?reset=1") }));
}

export async function setNewPassword(password) {
  const db = await getClient();
  await run(db.auth.updateUser({ password }));
}

export async function changePassword(current, next) {
  const db = await getClient();
  const { error } = await db.auth.signInWithPassword({ email: me.email, password: current });
  if (error) throw new Error("Your current password isn't right.");
  await run(db.auth.updateUser({ password: next }));
}

export async function changeEmail(email) {
  const db = await getClient();
  await run(db.auth.updateUser({ email }, { emailRedirectTo: pageUrl("profile.html#account") }));
}

export async function saveProfile(changes) {
  const db = await getClient();
  const row = serialize.profile.toRow(validateProfile(changes));
  await run(db.from("profiles").update(row).eq("id", me.id));
}

export async function deleteAccount() {
  const db = await getClient();
  await run(db.rpc("delete_my_account"));
  await db.auth.signOut({ scope: "local" });
  me = null;
}

function placeList(table) {
  return {
    async list() {
      const db = await getClient();
      const rows = await run(db.from(table).select("place_id"));
      return rows.map((row) => row.place_id);
    },
    async add(placeId) {
      const db = await getClient();
      await run(db.from(table).insert({ place_id: placeId }));
    },
    async remove(placeId) {
      const db = await getClient();
      await run(db.from(table).delete().eq("place_id", placeId).eq("user_id", me.id));
    },
  };
}

export const visited = placeList("visited");
export const saved = placeList("saved_places");

export const trips = {
  async list() {
    const db = await getClient();
    const rows = await run(db.from("trips").select("*").order("created_at", { ascending: false }));
    return rows.map(serialize.trip.fromRow);
  },
  async add(trip) {
    const db = await getClient();
    const row = await run(db.from("trips").insert(serialize.trip.toRow(validateTrip(trip))).select().single());
    return serialize.trip.fromRow(row);
  },
  async remove(id) {
    const db = await getClient();
    await run(db.from("trips").delete().eq("id", id));
  },
};

export const bookings = {
  async list() {
    const db = await getClient();
    const rows = await run(db.from("bookings").select("*").order("check_in", { ascending: true }));
    return rows.map(serialize.booking.fromRow);
  },
  async add(booking) {
    const db = await getClient();
    const row = await run(db.from("bookings").insert(serialize.booking.toRow(validateBooking(booking))).select().single());
    return serialize.booking.fromRow(row);
  },
  async remove(id) {
    const db = await getClient();
    await run(db.from("bookings").delete().eq("id", id));
  },
};

const MESSAGE_COLUMNS = serialize.message.columns;

const toMessage = (row) => serialize.message.fromRow(row, me?.id);

export const community = {
  async rooms() {
    const db = await getClient();
    const [rooms, memberships] = await Promise.all([
      run(db.from("rooms").select("*").order("sort")),
      me ? run(db.from("room_members").select("room_id")) : [],
    ]);
    const joined = new Set(memberships.map((row) => row.room_id));
    const latest = await Promise.all(rooms.map((room) => run(db.from("messages")
      .select(MESSAGE_COLUMNS).eq("room_id", room.id)
      .order("created_at", { ascending: false }).limit(1))));
    return rooms.map((room, index) => serialize.room.fromRow(
      room, joined.has(room.id), latest[index][0] ? toMessage(latest[index][0]) : null));
  },
  async messages(roomId) {
    const db = await getClient();
    const rows = await run(db.from("messages").select(MESSAGE_COLUMNS).eq("room_id", roomId)
      .order("created_at", { ascending: false }).limit(50));
    return rows.reverse().map(toMessage);
  },
  async send(roomId, text) {
    const db = await getClient();
    const row = await run(db.from("messages").insert({ room_id: roomId, body: validateMessage(text) })
      .select(MESSAGE_COLUMNS).single());
    return toMessage(row);
  },
  async join(roomId) {
    const db = await getClient();
    await run(db.from("room_members").insert({ room_id: roomId }));
    return (await run(db.from("rooms").select("members").eq("id", roomId).single())).members;
  },
  async leave(roomId) {
    const db = await getClient();
    await run(db.from("room_members").delete().eq("room_id", roomId).eq("user_id", me.id));
    return (await run(db.from("rooms").select("members").eq("id", roomId).single())).members;
  },
  async listen(roomId, onMessage) {
    const db = await getClient();
    const channel = db.channel(`room-${roomId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        (payload) => onMessage(toMessage(payload.new)))
      .subscribe();
    return () => db.removeChannel(channel);
  },
};

export { run };

export async function catalog() {
  const db = await getClient();
  const [places, hotels, amenities] = await Promise.all([
    run(db.from("places").select("*").order("sort")),
    run(db.from("hotels").select("*").order("sort")),
    run(db.from("amenities").select("*").order("sort")),
  ]);
  if (!places.length) throw new Error("The places table is empty.");
  return {
    places: places.filter((row) => !row.hidden).map(serialize.place.fromRow),
    hotels: hotels.filter((row) => !row.hidden).map(serialize.hotel.fromRow),
    amenities: Object.fromEntries(amenities.map((row) => [row.key, row.label])),
  };
}
