import { api, hasBackend } from "../api/index.js";
import { catalog as localCatalog } from "../api/local.js";
import { withTimeout } from "./dom.js";

const GHANA_REGIONS = 16;

let request;

const CACHE_KEY = "wandr:catalog";

function savedCatalog() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY));
  } catch {
    return null;
  }
}

function remember(raw) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(raw));
  } catch {}
  return raw;
}

function withHelpers(raw) {
  return {
    ...raw,
    place: (id) => raw.places.find((place) => place.id === id),
    hotel: (id) => raw.hotels.find((hotel) => hotel.id === id),
    categories: [...new Set(raw.places.map((place) => place.category))],
    regions: [...new Set(raw.places.map((place) => place.region))],
  };
}

export function loadData() {
  if (request) return request;
  const fresh = withTimeout(api.catalog(), 8000, "The database took too long to answer.")
    .then((raw) => (hasBackend ? remember(raw) : raw))
    .catch((error) => {
      if (!hasBackend) throw error;
      console.warn("Using the built-in list of places:", error.message);
      return localCatalog();
    });
  const saved = hasBackend ? savedCatalog() : null;
  request = (saved?.places?.length ? Promise.resolve(saved) : fresh).then(withHelpers);
  return request;
}

export const placeUrl = (place) => `place.html?id=${encodeURIComponent(place.id)}`;

export const regionLabel = (region) => (region === "Greater Accra" ? region : `${region} Region`);

export const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const COMMONS = "commons:";

export function imageSrc(image) {
  if (!image) return "";
  if (image.startsWith(COMMONS)) {
    return `Images/commons/${image.slice(COMMONS.length).replace(/[^\w.-]/g, "_")}`;
  }
  return `Images/${image}`;
}

export function imageCredit(image) {
  if (!image || !image.startsWith(COMMONS)) return null;
  const file = image.slice(COMMONS.length);
  return { label: "Wikimedia Commons", url: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}` };
}

export function exploredStats(data, visitedIds) {
  const visited = visitedIds.filter((id) => data.place(id));
  const regions = new Set(visited.map((id) => data.place(id).region));
  const next = data.places.find((place) => !visited.includes(place.id)) || null;
  return {
    visited,
    count: visited.length,
    total: data.places.length,
    percent: Math.round((visited.length / data.places.length) * 100),
    regions: regions.size,
    ghanaRegions: GHANA_REGIONS,
    next,
    inRegion(region) {
      const inside = data.places.filter((place) => place.region === region);
      return [inside.filter((place) => visited.includes(place.id)).length, inside.length];
    },
  };
}
