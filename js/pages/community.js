import { $, $$, escapeHTML } from "../lib/dom.js";
import { setupChips, toast, promptSignIn, whileBusy } from "../lib/ui.js";
import { getUser, community, initials } from "../lib/store.js";

const COLOURS = ["volta", "accra", "mole", "kakum", "north", "solo"];

function colourFor(name) {
  const total = [...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return COLOURS[total % COLOURS.length];
}

function timeLabel(iso) {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function messageHTML(message) {
  const time = `<time datetime="${message.at}">${timeLabel(message.at)}</time>`;
  if (message.mine) {
    return `
      <li class="msg msg--mine" data-id="${message.id}">
        <div class="msg__body">
          <p class="msg__who">${time} · You</p>
          <p class="msg__bubble">${escapeHTML(message.text)}</p>
        </div>
      </li>`;
  }
  return `
    <li class="msg" data-id="${message.id}">
      <span class="avatar avatar--sm avatar--${colourFor(message.who)}" aria-hidden="true">${escapeHTML(initials(message.who))}</span>
      <div class="msg__body">
        <p class="msg__who">${escapeHTML(message.who)} · ${time}</p>
        <p class="msg__bubble">${escapeHTML(message.text)}</p>
      </div>
    </li>`;
}

function roomHTML(room, open) {
  const groups = [...room.groups, ...(room.joined ? ["joined"] : [])].join(" ");
  const last = room.last
    ? `${room.last.mine ? "You" : escapeHTML(room.last.who)}: ${escapeHTML(room.last.text)}`
    : "No messages yet";
  return `
    <li class="room${open ? " room--open" : ""}" data-room="${room.id}" data-groups="${groups}">
      <span class="avatar avatar--${room.id}" aria-hidden="true">${escapeHTML(room.initials)}</span>
      <div class="room__body">
        <h3 class="room__name"><button class="link-btn" type="button">${escapeHTML(room.name)}</button></h3>
        <p class="room__last">${last}</p>
      </div>
      <div class="room__meta">
        ${room.last ? `<time datetime="${room.last.at}">${timeLabel(room.last.at)}</time>` : ""}
      </div>
    </li>`;
}

export default async function communityPage() {
  const roomList = $("[data-rooms]");
  const messageList = $(".messages");
  const composer = $("[data-composer]");
  const input = $(".composer__input");
  const sendButton = $(".btn", composer);
  const leave = $("[data-leave]");
  let rooms = [];
  let current = null;
  let messages = [];
  let group = "all";
  let stopListening = () => {};

  const room = () => rooms.find((item) => item.id === current);

  function renderRooms() {
    roomList.innerHTML = rooms.map((item) => roomHTML(item, item.id === current)).join("");
    filterRooms();
  }

  function filterRooms() {
    $$(".room", roomList).forEach((row) => {
      row.hidden = group !== "all" && !row.dataset.groups.split(" ").includes(group);
    });
  }

  function renderHead() {
    const open = room();
    const avatar = $(".chat__head .avatar");
    avatar.className = `avatar avatar--${open.id}`;
    avatar.textContent = open.initials;
    $(".chat__name").textContent = open.name;
    $(".chat__count").textContent = `${open.members.toLocaleString("en-GB")} members`;

    const signedIn = Boolean(getUser());
    leave.textContent = !signedIn ? "Sign in to join" : open.joined ? "Leave room" : "Join room";
    const canSend = signedIn && open.joined;
    input.disabled = !canSend;
    sendButton.disabled = !canSend;
    input.placeholder = !signedIn ? "Sign in to send messages"
      : open.joined ? "Message the room..." : "Join the room to send messages";
  }

  function renderMessages() {
    const open = room();
    const note = !getUser() ? "Sign in and join this room to send messages."
      : open.joined ? "" : "Join this room to send messages.";
    messageList.innerHTML = (messages.length
      ? messages.map(messageHTML).join("")
      : `<li class="messages__note">No messages yet. Say hello.</li>`)
      + (note ? `<li class="messages__note">${note}</li>` : "");
    messageList.scrollTop = messageList.scrollHeight;
  }

  function updateLast(message) {
    const open = room();
    open.last = message;
    const row = $(`.room[data-room="${open.id}"]`, roomList);
    $(".room__last", row).textContent = `${message.mine ? "You" : message.who}: ${message.text}`;
    $(".room__meta", row).innerHTML = `<time datetime="${message.at}">${timeLabel(message.at)}</time>`;
  }

  function receive(message) {
    if (messages.some((item) => item.id === message.id)) return;
    messages.push(message);
    renderMessages();
    updateLast(message);
  }

  async function openRoom(id) {
    current = id;
    $$(".room", roomList).forEach((row) => row.classList.toggle("room--open", row.dataset.room === id));
    renderHead();
    messageList.innerHTML = `<li class="messages__note">Loading messages…</li>`;
    stopListening();
    try {
      messages = await community.messages(id);
      if (current !== id) return;
      renderMessages();
      stopListening = await community.listen(id, (message) => {
        if (current === id) receive(message);
      });
    } catch (error) {
      messageList.innerHTML = `<li class="messages__note">${escapeHTML(error.message)}</li>`;
    }
  }

  async function loadRooms() {
    try {
      rooms = await community.rooms();
    } catch (error) {
      roomList.innerHTML = `<li class="messages__note">${escapeHTML(error.message)}</li>`;
      messageList.innerHTML = "";
      return;
    }
    if (!rooms.some((item) => item.id === current)) current = rooms[0]?.id;
    renderRooms();
    if (current) openRoom(current);
  }

  roomList.addEventListener("click", (event) => {
    const row = event.target.closest(".room");
    if (!row) return;
    openRoom(row.dataset.room);
    if (window.matchMedia("(max-width: 900px)").matches) $("#chat").scrollIntoView({ behavior: "smooth" });
  });

  setupChips($(".chips"), (value) => { group = value; filterRooms(); });

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !current) return;
    try {
      const message = await whileBusy(sendButton, "Sending…", () => community.send(current, text));
      receive(message);
      input.value = "";
      input.disabled = false;
      input.focus();
    } catch (error) {
      toast(error.message);
    }
  });

  leave.addEventListener("click", async () => {
    if (!getUser()) {
      promptSignIn("Sign in to join rooms", "Sign in to join rooms and talk with other travellers.");
      return;
    }
    const open = room();
    const joining = !open.joined;
    try {
      open.members = await whileBusy(leave, joining ? "Joining…" : "Leaving…",
        () => (joining ? community.join(open.id) : community.leave(open.id)));
      open.joined = joining;
      renderRooms();
      renderHead();
      renderMessages();
      toast(joining ? `You joined ${open.name}.` : `You left ${open.name}.`);
    } catch (error) {
      toast(error.message);
    }
  });

  window.addEventListener("wandr:change", loadRooms);
  await loadRooms();
}
