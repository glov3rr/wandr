import { $, $$, todayISO } from "./lib/dom.js";
import { loadData } from "./lib/data.js";
import { setupHeader } from "./components/header.js";
import { initSession } from "./lib/store.js";
import home from "./pages/home.js";
import explore from "./pages/explore.js";
import place from "./pages/place.js";
import trips from "./pages/trips.js";
import stays from "./pages/stays.js";
import community from "./pages/community.js";
import signin from "./pages/signin.js";
import profile from "./pages/profile.js";

const DATA_PAGES = { home, explore, place, trips, stays, profile };
const PLAIN_PAGES = { community, signin };

function showLoadError(error) {
  console.error(error);
  const main = $("main");
  main.insertAdjacentHTML("afterbegin", `
    <p class="load-error" role="alert">
      Wandr couldn't load its list of places. Check your connection and refresh the page.
    </p>`);
}

const setDateLimits = () => $$('input[type="date"]').forEach((input) => { input.min ||= todayISO(); });

await initSession();
setupHeader();

const name = document.body.dataset.page;

if (PLAIN_PAGES[name]) {
  PLAIN_PAGES[name]();
  setDateLimits();
}

if (DATA_PAGES[name]) {
  loadData()
    .then((data) => {
      DATA_PAGES[name](data);
      setDateLimits();
    })
    .catch(showLoadError);
}
