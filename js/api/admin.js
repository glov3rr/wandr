import { getClient, hasBackend } from "../lib/supabase.js";
import { run } from "./remote.js";
import * as serialize from "./serializers.js";
import { validatePlace, validateHotel, slugify } from "./validators.js";

const BUCKET = "media";
const CATALOG_CACHE = "wandr:catalog";

const FRIENDLY = [
  [/places_rules|hotels_rules/, "Something in the form isn't allowed. Check each field and try again."],
  [/duplicate key|already exists/, "Something else already uses this web address. Change it and try again."],
  [/violates foreign key constraint.*bookings/s, "People have booked this stay, so it can't be deleted. Hide it instead."],
  [/violates foreign key constraint/, "This is linked to other places or bookings, so it can't be deleted. Hide it instead."],
  [/row-level security/, "Your account isn't an admin, so it can't make changes."],
  [/hidden.*does not exist|column .* does not exist/, "Run supabase/002_admin.sql in Supabase first, then try again."],
];

function explain(error) {
  const match = FRIENDLY.find(([pattern]) => pattern.test(error.message));
  return match ? Object.assign(new Error(match[1]), { cause: error }) : error;
}

async function guard(work) {
  try {
    return await work();
  } catch (error) {
    if (error.name === "ValidationError") throw error;
    throw explain(error);
  }
}

function forgetCatalog() {
  try { localStorage.removeItem(CATALOG_CACHE); } catch {}
}

export const available = hasBackend;

export async function isAdmin() {
  if (!hasBackend) return false;
  const db = await getClient();
  const { data, error } = await db.rpc("is_admin");
  return !error && data === true;
}

export async function load() {
  const db = await getClient();
  const [places, hotels, amenities] = await guard(() => Promise.all([
    run(db.from("places").select("*").order("sort")),
    run(db.from("hotels").select("*").order("sort")),
    run(db.from("amenities").select("*").order("sort")),
  ]));
  return {
    places: places.map(serialize.place.fromRow),
    hotels: hotels.map(serialize.hotel.fromRow),
    amenities: amenities.map((row) => ({ key: row.key, label: row.label })),
  };
}

async function nextSort(db, table) {
  const rows = await run(db.from(table).select("sort").order("sort", { ascending: false }).limit(1));
  return (rows[0]?.sort ?? -1) + 1;
}

export async function savePlace(input, context) {
  return guard(async () => {
    const value = validatePlace(input, context);
    const db = await getClient();
    const row = serialize.place.toRow(value);
    const saved = context.isNew
      ? await run(db.from("places").insert({ ...row, sort: await nextSort(db, "places") }).select().single())
      : await run(db.from("places").update(row).eq("id", value.id).select().single());
    forgetCatalog();
    return serialize.place.fromRow(saved);
  });
}

export async function deletePlace(id) {
  return guard(async () => {
    const db = await getClient();
    await run(db.from("places").delete().eq("id", id));
    forgetCatalog();
  });
}

export async function saveHotel(input, context) {
  return guard(async () => {
    const value = validateHotel(input, context);
    const db = await getClient();
    const row = serialize.hotel.toRow(value);
    const saved = context.isNew
      ? await run(db.from("hotels").insert({ ...row, sort: await nextSort(db, "hotels") }).select().single())
      : await run(db.from("hotels").update(row).eq("id", value.id).select().single());
    forgetCatalog();
    return serialize.hotel.fromRow(saved);
  });
}

export async function deleteHotel(id) {
  return guard(async () => {
    const db = await getClient();
    await run(db.from("hotels").delete().eq("id", id));
    forgetCatalog();
  });
}

function shrink(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("That photo couldn't be read."))), "image/jpeg", quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't a photo Wandr can read. Use a JPG, PNG or WebP."));
    };
    image.src = url;
  });
}

export async function uploadPhoto(file, folder) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    throw new Error(`${file.name} isn't a JPG, PNG or WebP photo.`);
  }
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is over 20 MB. Choose a smaller photo.`);
  const blob = await shrink(file);
  const db = await getClient();
  const path = `${slugify(folder) || "misc"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  await guard(() => run(db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false })));
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function exportCatalog(data) {
  const strip = ({ hidden, updated, ...rest }) => rest;
  return {
    places: data.places.filter((item) => !item.hidden).map(strip),
    hotels: data.hotels.filter((item) => !item.hidden).map(strip),
    amenities: Object.fromEntries(data.amenities.map((item) => [item.key, item.label])),
  };
}

export async function loadCommunity() {
  const db = await getClient();
  const [rooms, reports] = await Promise.all([
    run(db.from("rooms").select("*").order("created_at", { ascending: false })),
    run(db.rpc("admin_reports")),
  ]).catch((error) => {
    if (/admin_reports|created_at|function/i.test(error.message)) {
      throw new Error("Run supabase/003_community.sql in Supabase to manage rooms and reports.");
    }
    throw error;
  });
  return {
    rooms: rooms.map((row) => serialize.room.fromRow(row)),
    reports: reports.map(serialize.report.fromRow),
  };
}

export async function deleteRoom(id) {
  return guard(async () => {
    const db = await getClient();
    const removed = await run(db.from("rooms").delete().eq("id", id).select("id"));
    if (!removed.length) throw new Error("That room couldn't be deleted. It may already be gone.");
  });
}

export async function deleteMessage(messageId) {
  return guard(async () => {
    const db = await getClient();
    await run(db.rpc("delete_message", { target: messageId }));
  });
}

export async function dismissReports(messageId) {
  return guard(async () => {
    const db = await getClient();
    await run(db.from("reports").delete().eq("message_id", messageId));
  });
}
