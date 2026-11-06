export const REGIONS = [
  "Ahafo", "Ashanti", "Bono", "Bono East", "Central", "Eastern", "Greater Accra", "North East",
  "Northern", "Oti", "Savannah", "Upper East", "Upper West", "Volta", "Western", "Western North",
];

export const CATEGORIES = ["Nature", "History", "Wildlife", "Beach", "Culture"];

export class ValidationError extends Error {
  constructor(fields) {
    super(Object.values(fields)[0]);
    this.name = "ValidationError";
    this.fields = fields;
  }
}

export const slugify = (text) => String(text).toLowerCase().normalize("NFKD")
  .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function today() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

const daysBetween = (start, end) => Math.round((new Date(end) - new Date(start)) / 86400000);

function checker() {
  const errors = {};
  return {
    errors,
    require(field, condition, message) {
      if (!condition && !errors[field]) errors[field] = message;
      return condition;
    },
    done(value) {
      if (Object.keys(errors).length) throw new ValidationError(errors);
      return value;
    },
  };
}

const text = (value) => String(value ?? "").trim();

const number = (value) => (value === "" || value === null || value === undefined ? NaN : Number(value));

export function validatePlace(input, { placeIds = [], hotelIds = [], isNew = false } = {}) {
  const c = checker();
  const id = text(input.id);
  const name = text(input.name);
  const where = text(input.where);
  const rating = number(input.rating);
  const reviews = number(input.reviews ?? 0);
  const gallery = (input.gallery || []).map(text).filter(Boolean);
  const image = text(input.image) || gallery[0] || "";
  const about = (input.about || []).map(text).filter(Boolean);
  const facts = (input.facts || [])
    .map((fact) => ({ label: text(fact.label), value: text(fact.value) }))
    .filter((fact) => fact.label || fact.value);
  const x = number(input.map?.x);
  const y = number(input.map?.y);
  const stayHotel = text(input.stay?.hotel);

  c.require("id", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), "The web address can only use lowercase letters, numbers and dashes.");
  c.require("id", !isNew || !placeIds.includes(id), "Another place already uses this web address.");
  c.require("name", name.length >= 2 && name.length <= 80, "Give the place a name of 2 to 80 characters.");
  c.require("category", CATEGORIES.includes(input.category), "Choose a category.");
  c.require("region", REGIONS.includes(input.region), "Choose a region.");
  c.require("where", where.length >= 2 && where.length <= 120, "Describe where it is in a short line, like “Volta Region · near Hohoe”.");
  c.require("rating", rating >= 0 && rating <= 5, "Rating must be between 0 and 5.");
  c.require("reviews", Number.isInteger(reviews) && reviews >= 0, "Reviews must be a whole number.");
  c.require("photos", image.length > 0, "Add at least one photo.");
  c.require("about", about.length >= 1 && about.length <= 6, "Write a description, 1 to 6 paragraphs.");
  c.require("about", about.every((paragraph) => paragraph.length <= 1200), "Keep each paragraph under 1,200 characters.");
  c.require("facts", facts.every((fact) => fact.label && fact.value), "Every fact needs both a label and a value.");
  c.require("facts", facts.length <= 10, "Keep it to 10 facts or fewer.");
  c.require("map", x >= 0 && x <= 100 && y >= 0 && y <= 100, "Click the map to place the pin.");
  c.require("stay", !stayHotel || hotelIds.includes(stayHotel), "That hotel doesn't exist any more.");

  const related = [...new Set((input.related || []).map(text))].filter((other) => other && other !== id);
  c.require("related", related.every((other) => placeIds.includes(other)), "One of the nearby places doesn't exist any more.");

  return c.done({
    id,
    name,
    category: input.category,
    region: input.region,
    where,
    rating: Math.round(rating * 10) / 10,
    reviews,
    image,
    imageAlt: text(input.imageAlt) || name,
    gallery: gallery.length ? gallery : [image],
    about,
    facts,
    stay: { hotel: stayHotel || null, note: stayHotel ? text(input.stay?.note) || null : null },
    related,
    map: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
    featured: Boolean(input.featured),
    hidden: Boolean(input.hidden),
  });
}

export function validateHotel(input, { hotelIds = [], amenityKeys = [], isNew = false } = {}) {
  const c = checker();
  const id = text(input.id);
  const name = text(input.name);
  const area = text(input.area);
  const price = number(input.price);
  const rating = number(input.rating);
  const amenities = [...new Set(input.amenities || [])];

  c.require("id", /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id), "The web address can only use lowercase letters, numbers and dashes.");
  c.require("id", !isNew || !hotelIds.includes(id), "Another stay already uses this web address.");
  c.require("name", name.length >= 2 && name.length <= 80, "Give the stay a name of 2 to 80 characters.");
  c.require("area", area.length >= 2 && area.length <= 120, "Describe where it is, like “Ho, Volta Region”.");
  c.require("region", REGIONS.includes(input.region), "Choose a region.");
  c.require("price", Number.isInteger(price) && price >= 1 && price <= 100000, "Price must be a whole number of cedis.");
  c.require("rating", rating >= 0 && rating <= 5, "Rating must be between 0 and 5.");
  c.require("amenities", amenities.every((key) => amenityKeys.includes(key)), "One of the amenities isn't recognised.");

  return c.done({
    id,
    name,
    area,
    region: input.region,
    price,
    rating: Math.round(rating * 10) / 10,
    amenities,
    image: text(input.image) || null,
    hidden: Boolean(input.hidden),
  });
}

export function validateTrip(input) {
  const c = checker();
  const name = text(input.name);
  const start = text(input.start);
  const end = text(input.end) || start;
  const travellers = number(input.travellers ?? 1);
  const budget = input.budget ? number(input.budget) : null;
  const stops = [...new Set((input.stops || []).map(text).filter(Boolean))];

  c.require("name", name.length >= 1 && name.length <= 80, "Give the trip a name.");
  c.require("start", !start || ISO_DATE.test(start), "Pick a start date.");
  c.require("end", !start || (ISO_DATE.test(end) && end >= start), "The trip can't end before it starts.");
  c.require("travellers", Number.isInteger(travellers) && travellers >= 1 && travellers <= 50, "Travellers must be between 1 and 50.");
  c.require("budget", budget === null || (Number.isFinite(budget) && budget >= 0), "Budget must be a positive number.");
  c.require("stops", stops.length >= 1 && stops.length <= 30, "Choose between 1 and 30 stops.");

  return c.done({ name, start: start || null, end: start ? end : null, travellers, budget: budget ? Math.round(budget) : null, stops });
}

export function validateBooking(input) {
  const c = checker();
  const guests = number(input.guests);
  c.require("hotelId", Boolean(text(input.hotelId)), "Choose a stay.");
  c.require("checkIn", ISO_DATE.test(input.checkIn || ""), "Pick a check-in date.");
  c.require("checkIn", (input.checkIn || "") >= today(), "Check-in can't be in the past.");
  c.require("checkOut", ISO_DATE.test(input.checkOut || "") && input.checkOut > input.checkIn, "Check-out has to be after check-in.");
  c.require("checkOut", daysBetween(input.checkIn, input.checkOut) <= 30, "Bookings can be at most 30 nights.");
  c.require("guests", Number.isInteger(guests) && guests >= 1 && guests <= 6, "Guests must be between 1 and 6.");
  return c.done({ hotelId: text(input.hotelId), checkIn: input.checkIn, checkOut: input.checkOut, guests });
}

export function validateProfile(changes) {
  const c = checker();
  const value = { ...changes };
  if ("name" in value) {
    value.name = text(value.name);
    c.require("name", value.name.length >= 2 && value.name.length <= 80, "Enter your name.");
  }
  if ("bio" in value) {
    value.bio = text(value.bio);
    c.require("bio", value.bio.length <= 300, "Keep your bio under 300 characters.");
  }
  if ("region" in value) {
    c.require("region", !value.region || REGIONS.includes(value.region), "Choose a region from the list.");
  }
  if ("phone" in value) {
    value.phone = text(value.phone).replace(/\s/g, "");
    c.require("phone", !value.phone || /^\d{7,12}$/.test(value.phone), "Use digits only, without the country code.");
  }
  if ("prefs" in value) {
    c.require("prefs", value.prefs && typeof value.prefs === "object" && !Array.isArray(value.prefs), "Preferences couldn't be saved.");
  }
  if ("avatar" in value && value.avatar) {
    c.require("avatar", value.avatar.length <= 200000, "That photo is too large.");
  }
  return c.done(value);
}

export function validateMessage(body) {
  const c = checker();
  const value = text(body).replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n");
  c.require("text", value.length >= 1, "Write a message first.");
  c.require("text", value.length <= 1000, "Keep messages under 1,000 characters.");
  return c.done(value);
}

export const ROOM_TOPICS = { "": "General chat", regions: "A region or place", buddies: "Trip buddies" };

export const REPORT_REASONS = ["Spam or advertising", "Harassment or hate", "Unsafe or misleading advice", "Something else"];

const oneLine = (value) => text(value).replace(/\s+/g, " ");

export function validateRoom(input) {
  const c = checker();
  const name = oneLine(input.name);
  const description = oneLine(input.description);
  const topic = text(input.topic);
  c.require("name", name.length >= 3 && name.length <= 40, "Room names need 3 to 40 characters.");
  c.require("name", /[\p{L}\p{N}]/u.test(name), "Use letters or numbers in the room name.");
  c.require("description", description.length <= 160, "Keep the description under 160 characters.");
  c.require("topic", Object.hasOwn(ROOM_TOPICS, topic), "Choose a topic from the list.");
  return c.done({ name, description, topic });
}

export function validateReport(input) {
  const c = checker();
  const reason = text(input.reason);
  const details = oneLine(input.details);
  c.require("reason", REPORT_REASONS.includes(reason), "Choose a reason.");
  c.require("details", details.length <= 240, "Keep the details under 240 characters.");
  c.require("details", reason !== "Something else" || details.length > 0, "Tell us what's wrong.");
  return c.done(details ? `${reason}: ${details}` : reason);
}
