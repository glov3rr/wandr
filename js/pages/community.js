import { $, $$, escapeHTML } from "../lib/dom.js";
import { setupChips, toast } from "../lib/ui.js";

const ROOMS = {
  kakum: { name: "Kakum & Cape Coast", initials: "KC", members: 218, online: 12, joined: true, messages: [
    { who: "Kwabena", initials: "KA", colour: "volta", time: "08:41", text: "Has anyone visited Elmina Castle recently? Wondering how busy it gets." },
    { who: "Ama", initials: "AD", colour: "accra", time: "08:47", text: "Went two weeks ago. Tours start on the hour and the 9am one was almost empty." },
    { who: "Ama", initials: "AD", colour: "accra", time: "08:48", text: "Go on a weekday if you can. Saturdays are rough." },
    { mine: true, time: "09:02", text: "Good to know. Is it walkable from Cape Coast Castle or should I get a taxi?" },
    { who: "Yaw", initials: "YO", colour: "mole", time: "09:09", text: "Taxi. It is about 15km along the coast road, roughly GHS 40." },
    { mine: true, time: "09:11", text: "Perfect, thanks both." },
    { who: "Ama", initials: "AD", colour: "accra", time: "09:14", text: "Do Kakum the same trip. It is 40 minutes inland and the canopy walk opens at 8." },
  ]},
  volta: { name: "Volta Region", initials: "VR", members: 164, online: 5, joined: false, messages: [
    { who: "Selasi", initials: "SA", colour: "kakum", time: "07:30", text: "Wli was full of water last weekend. The lower falls trail was muddy but fine." },
    { who: "Kojo", initials: "KB", colour: "north", time: "08:02", text: "Afadjato in the rainy season?" },
  ]},
  accra: { name: "Accra Weekenders", initials: "AW", members: 402, online: 31, joined: true, messages: [
    { who: "Esi", initials: "EM", colour: "solo", time: "20:15", text: "Anyone know a quiet spot near Labadi for Sunday?" },
    { who: "Naa", initials: "NO", colour: "kakum", time: "21:40", text: "Labadi was packed on Sunday" },
  ]},
  mole: { name: "Mole Safari", initials: "MS", members: 97, online: 3, joined: false, messages: [
    { who: "Fuseini", initials: "FA", colour: "volta", time: "16:50", text: "The 6:30 walking safari is the one to book." },
    { who: "Yaw", initials: "YO", colour: "mole", time: "17:22", text: "Saw elephants at the waterhole" },
  ]},
  solo: { name: "Solo travellers Ghana", initials: "SG", members: 251, online: 9, joined: true, messages: [
    { who: "Kweku", initials: "KM", colour: "accra", time: "13:40", text: "The STC bus to Tamale was comfortable, about 12 hours." },
    { who: "Efua", initials: "EA", colour: "north", time: "14:05", text: "Anyone heading north in October?" },
  ]},
  north: { name: "Northern Ghana", initials: "NG", members: 108, online: 4, joined: false, messages: [
    { who: "Abena", initials: "AK", colour: "solo", time: "10:58", text: "Is the road from Tamale to Damongo paved now?" },
    { who: "Musah", initials: "MI", colour: "kakum", time: "11:30", text: "Tamale to Mole is about 2 hours" },
  ]},
};

function messageHTML(message) {
  if (message.mine) {
    return `
      <li class="msg msg--mine">
        <div class="msg__body">
          <p class="msg__who"><time>${message.time}</time> · You</p>
          <p class="msg__bubble">${escapeHTML(message.text)}</p>
        </div>
      </li>`;
  }
  return `
    <li class="msg">
      <span class="avatar avatar--sm avatar--${message.colour}" aria-hidden="true">${message.initials}</span>
      <div class="msg__body">
        <p class="msg__who">${message.who} · <time>${message.time}</time></p>
        <p class="msg__bubble">${escapeHTML(message.text)}</p>
      </div>
    </li>`;
}

export default function community() {
  const roomList = $("[data-rooms]");
  const messageList = $(".messages");
  const composer = $("[data-composer]");
  const input = $(".composer__input");
  const leave = $("[data-leave]");
  let current = "kakum";
  let group = "all";

  function render() {
    const room = ROOMS[current];
    const avatar = $(".chat__head .avatar");
    avatar.className = `avatar avatar--${current}`;
    avatar.textContent = room.initials;
    $(".chat__name").textContent = room.name;
    $(".chat__count").textContent = `${room.members} members · ${room.online} online`;

    messageList.innerHTML = room.messages.map(messageHTML).join("")
      + (room.joined ? "" : `<li class="messages__note">Join this room to send messages.</li>`);
    messageList.scrollTop = messageList.scrollHeight;

    leave.textContent = room.joined ? "Leave room" : "Join room";
    input.disabled = !room.joined;
    $(".btn", composer).disabled = !room.joined;
    input.placeholder = room.joined ? "Message the room..." : "Join the room to send messages";
  }

  function filterRooms() {
    $$(".room", roomList).forEach((row) => {
      row.hidden = group !== "all" && !row.dataset.groups.split(" ").includes(group);
    });
  }

  roomList.addEventListener("click", (event) => {
    const row = event.target.closest(".room");
    if (!row) return;
    $$(".room", roomList).forEach((other) => other.classList.toggle("room--open", other === row));
    $(".badge", row)?.remove();
    current = row.dataset.room;
    render();
    if (window.matchMedia("(max-width: 900px)").matches) $("#chat").scrollIntoView({ behavior: "smooth" });
  });

  setupChips($(".chips"), (value) => { group = value; filterRooms(); });

  composer.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    ROOMS[current].messages.push({ mine: true, time, text });
    render();
    const row = $(`.room[data-room="${current}"]`, roomList);
    $(".room__last", row).textContent = `You: ${text}`;
    $(".room__meta time", row).textContent = time;
    input.value = "";
    input.focus();
  });

  leave.addEventListener("click", () => {
    const room = ROOMS[current];
    room.joined = !room.joined;
    const row = $(`.room[data-room="${current}"]`, roomList);
    const groups = row.dataset.groups.split(" ").filter((name) => name !== "joined");
    if (room.joined) groups.push("joined");
    row.dataset.groups = groups.join(" ");
    render();
    filterRooms();
    toast(room.joined ? `You joined ${room.name}.` : `You left ${room.name}.`);
  });

  render();
}
