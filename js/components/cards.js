import { escapeHTML, cedis } from "../lib/dom.js";
import { placeUrl, regionLabel, slug, imageSrc } from "../lib/data.js";

export function placeCard(place, { row = false } = {}) {
  return `
    <li data-category="${slug(place.category)}" data-search="${escapeHTML(
      `${place.name} ${place.region} ${place.category}`.toLowerCase())}">
      <a class="card${row ? " card--row" : ""}" href="${placeUrl(place)}">
        <img class="card__img" src="${imageSrc(place.image)}" alt="${escapeHTML(place.imageAlt)}" loading="lazy">
        <div class="card__body">
          <p class="card__tag">${place.category}</p>
          <h3 class="card__title">${escapeHTML(place.name)}</h3>
          <p class="card__region">${regionLabel(place.region)}</p>
          <p class="card__rating">${place.rating.toFixed(1)}</p>
        </div>
      </a>
    </li>`;
}

function hotelImage(hotel) {
  if (hotel.image) {
    return `<img class="stay__img" src="${imageSrc(hotel.image)}" alt="${escapeHTML(hotel.name)}" loading="lazy">`;
  }
  const letters = hotel.name.split(" ").filter((word) => /^[A-Z]/.test(word)).slice(0, 2).map((word) => word[0]).join("");
  return `
    <div class="stay__img stay__img--blank" aria-hidden="true">
      <span>${letters}</span>
      <small>Photo coming soon</small>
    </div>`;
}

export function hotelCard(hotel, amenities, { area = hotel.area, link = null } = {}) {
  const name = link
    ? `<a href="${link}">${escapeHTML(hotel.name)}</a>`
    : `<button class="link-btn" type="button" data-book>${escapeHTML(hotel.name)}</button>`;
  const book = link
    ? `<a class="btn btn--solid" href="${link}">Book</a>`
    : `<button class="btn btn--solid" type="button" data-book>Book</button>`;

  return `
    <li data-hotel="${hotel.id}" data-region="${escapeHTML(hotel.region)}" data-price="${hotel.price}"
        data-rating="${hotel.rating}" data-amenities="${hotel.amenities.join(" ")}">
      <article class="stay">
        ${hotelImage(hotel)}
        <div class="stay__body">
          <h3 class="stay__name">${name}</h3>
          <p class="stay__where">${escapeHTML(area)}</p>
          <ul class="tags">
            ${hotel.amenities.map((key) => `<li class="tag">${amenities[key]}</li>`).join("")}
          </ul>
        </div>
        <div class="stay__aside">
          <p class="stay__rating">★ ${hotel.rating.toFixed(1)}</p>
          <p class="stay__price">${cedis(hotel.price)}<span>/night</span></p>
          ${book}
        </div>
      </article>
    </li>`;
}
