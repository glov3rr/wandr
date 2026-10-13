const GHANA_REGIONS = 16;

let request;

export function loadData() {
  request ??= fetch("data/wandr.json")
    .then((response) => {
      if (!response.ok) throw new Error(`data/wandr.json answered ${response.status}`);
      return response.json();
    })
    .then((raw) => ({
      ...raw,
      place: (id) => raw.places.find((place) => place.id === id),
      hotel: (id) => raw.hotels.find((hotel) => hotel.id === id),
      categories: [...new Set(raw.places.map((place) => place.category))],
      regions: [...new Set(raw.places.map((place) => place.region))],
    }));
  return request;
}

export const placeUrl = (place) => `place.html?id=${encodeURIComponent(place.id)}`;

export const regionLabel = (region) => (region === "Greater Accra" ? region : `${region} Region`);

export const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const COMMONS = "commons:";

export function imageSrc(image, width = 1280) {
  if (!image) return "";
  if (image.startsWith(COMMONS)) {
    const file = encodeURIComponent(image.slice(COMMONS.length));
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=${width}`;
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
