import { $, $$, escapeHTML, plural } from "../lib/dom.js";
import { setupChips, toast, promptSignIn, whileBusy, openDialog, markField } from "../lib/ui.js";
import { getUser, community, initials } from "../lib/store.js";
import { ROOM_TOPICS, REPORT_REASONS } from "../api/validators.js";

const COLOURS = ["volta", "accra", "mole", "kakum", "north", "solo"];
const FOLLOW_GAP = 5 * 60 * 1000;
const PHONE = window.matchMedia("(max-width: 900px)");

function colourFor(text) {
  if (COLOURS.includes(text)) return text;
  const total = [...String(text)].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  return COLOURS[total % COLOURS.length];
}

const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function dayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(iso) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

function shortTime(iso) {
  const date = new Date(iso);
  const age = Date.now() - date.getTime();
  if (date.toDateString() === new Date().toDateString()) return clock(iso);
  if (age < 6 * 86400000) return dayLabel(iso) === "Yesterday" ? "Yesterday" : date.toLocaleDateString("en-GB", { weekday: "short" });
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function linkify(text) {
  return escapeHTML(text).replace(/https?:\/\/[^\s<]+/g, (match) => {
    let url = match;
    let tail = "";
    while (/(&quot;|[.,!?;:)\]])$/.test(url)) {
      const cut = url.endsWith("&quot;") ? 6 : 1;
      tail = url.slice(-cut) + tail;
      url = url.slice(0, -cut);
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow ugc">${url}</a>${tail}`;
  });
}

function preview(room) {
  if (!room.last) return room.description ? escapeHTML(room.description) : "No messages yet";
  const who = room.last.mine ? "You" : room.last.who.split(" ")[0];
  return `${escapeHTML(who)}: ${escapeHTML(room.last.text.replace(/\s+/g, " "))}`;
}

function roomHTML(room, open) {
  const groups = [...room.groups, ...(room.joined ? ["joined"] : [])].join(" ");
  const badge = room.unread ? `<span class="badge" aria-label="${plural(room.unread, "unread message")}">${room.unread > 99 ? "99+" : room.unread}</span>` : "";
  return `
    <li class="room${open ? " room--open" : ""}${room.unread ? " room--unread" : ""}" data-room="${escapeHTML(room.id)}" data-groups="${groups}"
        data-search="${escapeHTML(`${room.name} ${room.description}`.toLowerCase())}">
      <span class="avatar avatar--${colourFor(room.id)}" aria-hidden="true">${escapeHTML(room.initials)}</span>
      <div class="room__body">
        <h3 class="room__name"><button class="link-btn" type="button"${open ? ' aria-current="true"' : ""}>${escapeHTML(room.name)}</button></h3>
        <p class="room__last">${preview(room)}</p>
      </div>
      <div class="room__meta">
        ${room.last ? `<time datetime="${room.last.at}">${shortTime(room.last.at)}</time>` : ""}
        ${badge}
      </div>
    </li>`;
}

function byActivity(a, b) {
  const at = a.last?.at || "";
  const bt = b.last?.at || "";
  if (at !== bt) return at < bt ? 1 : -1;
  return a.sort - b.sort;
}

export default async function communityPage() {
  const page = $("[data-community]");
  const roomList = $("[data-rooms]");
  const roomsEmpty = $("[data-rooms-empty]");
  const search = $("#room-search");
  const messageList = $(".messages");
  const jump = $("[data-jump]");
  const composer = $("[data-composer]");
  const input = $(".composer__input");
  const sendButton = $("button", composer);
  const gate = $("[data-gate]");
  const gateText = $("[data-gate-text]");
  const gateAction = $("[data-gate-action]");
  const leave = $("[data-leave]");
  const about = $("[data-about]");
  const baseTitle = document.title;

  let rooms = [];
  let current = null;
  let messages = [];
  let more = false;
  let online = 0;
  let group = "all";
  let userId = getUser()?.id || null;
  let stopWatching = () => {};
  let stopPresence = () => {};
  let readTimer = null;

  const room = () => rooms.find((item) => item.id === current);
  const nearBottom = () => messageList.scrollHeight - messageList.scrollTop - messageList.clientHeight < 90;
  const toBottom = () => { messageList.scrollTop = messageList.scrollHeight; jump.hidden = true; };

  function renderStats() {
    const joined = rooms.filter((item) => item.joined).length;
    $("[data-community-stats]").textContent = getUser()
      ? `${plural(rooms.length, "room")} · ${joined} joined`
      : `${plural(rooms.length, "room")} · sign in to chat`;
    const unread = rooms.reduce((sum, item) => sum + item.unread, 0);
    document.title = unread ? `(${unread > 99 ? "99+" : unread}) ${baseTitle}` : baseTitle;
  }

  function renderRooms() {
    rooms.sort(byActivity);
    roomList.innerHTML = rooms.map((item) => roomHTML(item, item.id === current)).join("");
    filterRooms();
    renderStats();
  }

  function filterRooms() {
    const query = search.value.trim().toLowerCase();
    let shown = 0;
    $$(".room", roomList).forEach((row) => {
      row.hidden = (group !== "all" && !row.dataset.groups.split(" ").includes(group))
        || (query && !row.dataset.search.includes(query));
      if (!row.hidden) shown++;
    });
    roomsEmpty.hidden = shown > 0 || !rooms.length;
    if (!shown && rooms.length) {
      roomsEmpty.textContent = group === "joined" && !query
        ? (getUser() ? "You haven't joined any rooms yet." : "Sign in to join rooms.")
        : "No rooms match. Try another word or start a new room.";
    }
  }

  function renderHead() {
    const open = room();
    if (!open) return;
    const avatar = $(".chat__head .avatar");
    avatar.className = `avatar avatar--${colourFor(open.id)}`;
    avatar.textContent = open.initials;
    $(".chat__name").textContent = open.name;
    const parts = [plural(open.members, "member")];
    if (online > 0) parts.push(`${online} online`);
    $(".chat__count").textContent = parts.join(" · ");
    about.hidden = !open.description;
    about.textContent = open.description;

    const user = getUser();
    leave.hidden = !user || !open.joined;

    const canSend = Boolean(user) && open.joined;
    composer.hidden = !canSend;
    gate.hidden = canSend;
    gateText.textContent = !user ? "Sign in to join the conversation." : `Join ${open.name} to send messages.`;
    gateAction.textContent = !user ? "Sign in" : "Join room";
  }

  function messageHTML(message, previous) {
    const follow = previous && previous.who === message.who && previous.mine === message.mine
      && !previous.deleted && new Date(message.at) - new Date(previous.at) < FOLLOW_GAP;
    const user = getUser();
    const tools = [];
    if (!message.deleted && user) {
      if (message.mine || user.isAdmin) tools.push(`<button class="link-btn" type="button" data-delete>Delete</button>`);
      if (!message.mine) tools.push(`<button class="link-btn" type="button" data-report>Report</button>`);
    }
    const time = `<time datetime="${message.at}">${clock(message.at)}</time>`;
    const bubble = message.deleted
      ? `<p class="msg__bubble msg__bubble--deleted">Message deleted</p>`
      : `<p class="msg__bubble">${linkify(message.text)}</p>`;
    const who = message.mine ? "You" : escapeHTML(message.who);
    return `
      <li class="msg${message.mine ? " msg--mine" : ""}${follow ? " msg--follow" : ""}" data-id="${message.id}">
        ${message.mine ? "" : `<span class="avatar avatar--sm avatar--${colourFor(message.who)}" aria-hidden="true">${escapeHTML(initials(message.who))}</span>`}
        <div class="msg__body">
          <p class="msg__who">${who} · ${time}</p>
          ${bubble}
          ${tools.length || follow ? `<p class="msg__tools">${follow ? time : ""}${tools.join("")}</p>` : ""}
        </div>
      </li>`;
  }

  function renderMessages({ keep = "bottom" } = {}) {
    const open = room();
    if (!open) return;
    const stick = keep === "bottom" || (keep === "auto" && nearBottom());
    const fromBottom = messageList.scrollHeight - messageList.scrollTop;
    let html = more ? `<li class="messages__more"><button class="btn" type="button" data-more>Load earlier messages</button></li>` : "";
    let lastDay = null;
    let previous = null;
    messages.forEach((message) => {
      const day = dayKey(message.at);
      if (day !== lastDay) {
        html += `<li class="messages__day"><span>${dayLabel(message.at)}</span></li>`;
        lastDay = day;
        previous = null;
      }
      html += messageHTML(message, previous);
      previous = message;
    });
    if (!messages.length) {
      html = `<li class="messages__empty"><strong>No messages yet</strong><span>Start the conversation in ${escapeHTML(open.name)}.</span></li>`;
    }
    messageList.innerHTML = html;
    if (keep === "top") messageList.scrollTop = messageList.scrollHeight - fromBottom;
    else if (stick) toBottom();
  }

  function markRead() {
    const open = room();
    if (!open?.joined || document.visibilityState !== "visible") return;
    clearTimeout(readTimer);
    readTimer = setTimeout(() => community.markRead(open.id), 600);
    if (open.unread) {
      open.unread = 0;
      $(`.room[data-room="${CSS.escape(open.id)}"]`, roomList)?.classList.remove("room--unread");
      $(`.room[data-room="${CSS.escape(open.id)}"] .badge`, roomList)?.remove();
      renderStats();
    }
  }

  async function openRoom(id, { show = false } = {}) {
    if (!rooms.some((item) => item.id === id)) return;
    const changed = current !== id;
    current = id;
    $$(".room", roomList).forEach((row) => {
      const isOpen = row.dataset.room === id;
      row.classList.toggle("room--open", isOpen);
      $(".link-btn", row).toggleAttribute("aria-current", isOpen);
    });
    const url = new URL(location.href);
    url.searchParams.set("room", id);
    history.replaceState(null, "", url);
    if (show) {
      page.classList.add("is-chatting");
      if (PHONE.matches) page.scrollIntoView({ block: "start" });
    }
    if (!changed && messages.length) return renderHead();

    online = 0;
    renderHead();
    messages = [];
    more = false;
    messageList.innerHTML = `<li class="messages__note">Loading messages…</li>`;
    stopPresence();
    stopPresence = () => {};
    try {
      const result = await community.messages(id);
      if (current !== id) return;
      messages = result.messages;
      more = result.more;
      renderMessages();
      markRead();
      const stop = await community.presence(id, (count) => {
        if (current !== id) return;
        online = count;
        renderHead();
      });
      if (current === id) stopPresence = stop;
      else stop();
    } catch (error) {
      if (current === id) messageList.innerHTML = `<li class="messages__note">${escapeHTML(error.message)}</li>`;
    }
  }

  function upsertRoom(next) {
    const existing = rooms.find((item) => item.id === next.id);
    if (existing) {
      const { joined, unread } = existing;
      Object.assign(existing, next, { joined: next.joined || joined, unread, mine: existing.mine || next.mine });
    } else {
      rooms.push(next);
    }
    renderRooms();
    if (next.id === current) renderHead();
  }

  function receive(message) {
    const target = rooms.find((item) => item.id === message.roomId);
    if (!target) return;
    const known = message.roomId === current && messages.find((item) => item.id === message.id);
    if (message.roomId === current) {
      const atBottom = nearBottom();
      if (known) Object.assign(known, message);
      else messages.push(message);
      renderMessages({ keep: "auto" });
      if (!known && !atBottom && !message.mine) jump.hidden = false;
      if (!known && atBottom) markRead();
      else if (!known && !message.mine && target.joined && document.visibilityState !== "visible") target.unread++;
    } else if (!message.deleted && !message.mine && target.joined) {
      target.unread++;
    }
    if (!message.deleted && (!target.last || target.last.at <= message.at)) {
      target.last = { who: message.who, text: message.text, at: message.at, mine: message.mine };
    }
    renderRooms();
  }

  function roomGone(id) {
    const wasOpen = id === current;
    rooms = rooms.filter((item) => item.id !== id);
    renderRooms();
    if (wasOpen) {
      current = null;
      toast("That room was removed.");
      page.classList.remove("is-chatting");
      if (rooms.length) openRoom(rooms[0].id);
    }
  }

  async function loadRooms() {
    try {
      rooms = await community.rooms();
    } catch (error) {
      roomList.innerHTML = `<li class="rooms__note">${escapeHTML(error.message)}</li>`;
      messageList.innerHTML = "";
      return;
    }
    rooms.sort(byActivity);
    const wanted = new URL(location.href).searchParams.get("room");
    const fallback = rooms.find((item) => item.joined) || rooms[0];
    const next = rooms.some((item) => item.id === wanted) ? wanted
      : rooms.some((item) => item.id === current) ? current : fallback?.id;
    current = null;
    renderRooms();
    if (next) openRoom(next, { show: Boolean(wanted) && wanted === next });
    else messageList.innerHTML = `<li class="messages__empty"><strong>No rooms yet</strong><span>Start the first one.</span></li>`;
  }

  async function startWatching() {
    stopWatching();
    stopWatching = await community.watch({ message: receive, room: upsertRoom, roomGone });
  }

  function needSignIn(title, text) {
    if (getUser()) return false;
    promptSignIn(title, text);
    return true;
  }

  async function toggleMembership(button) {
    if (needSignIn("Sign in to join rooms", "Sign in or create a free account to join rooms and talk with other travellers.")) return;
    const open = room();
    const joining = !open.joined;
    try {
      open.members = await whileBusy(button, joining ? "Joining…" : "Leaving…",
        () => (joining ? community.join(open.id) : community.leave(open.id)));
      open.joined = joining;
      open.unread = 0;
      if (joining) community.markRead(open.id);
      renderRooms();
      renderHead();
      renderMessages({ keep: "auto" });
      if (joining) input.focus();
      toast(joining ? `You joined ${open.name}.` : `You left ${open.name}.`);
    } catch (error) {
      toast(error.message);
    }
  }

  function newRoomDialog() {
    if (needSignIn("Sign in to start a room", "Sign in or create a free account to start a room.")) return;
    const dialog = openDialog({
      title: "Start a room",
      submitLabel: "Create room",
      body: `
        <p class="modal__note">Rooms are public. Anyone can read them, and signed-in travellers can join and post.</p>
        <p class="field">
          <label class="field__label" for="room-name">Room name</label>
          <input class="field__input" id="room-name" name="name" type="text" maxlength="40" required
                 placeholder="For example: Tamale food tour" autocomplete="off">
        </p>
        <p class="field">
          <label class="field__label" for="room-topic">Topic</label>
          <select class="field__input" id="room-topic" name="topic">
            ${Object.entries(ROOM_TOPICS).map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
          </select>
        </p>
        <p class="field">
          <label class="field__label" for="room-about">What's it about? <span class="field__optional">Optional</span></label>
          <textarea class="field__input" id="room-about" name="description" rows="2" maxlength="160"
                    placeholder="One line so people know what to expect"></textarea>
        </p>`,
      onSubmit(form) {
        const fields = { name: form.elements.name, topic: form.elements.topic, description: form.elements.description };
        Object.values(fields).forEach((field) => markField(field, ""));
        const button = $('button[type="submit"]', form);
        whileBusy(button, "Creating…", () => community.create({
          name: fields.name.value, topic: fields.topic.value, description: fields.description.value,
        }))
          .then((created) => {
            dialog.close();
            upsertRoom(created);
            const made = rooms.find((item) => item.id === created.id);
            made.joined = true;
            renderRooms();
            current = null;
            openRoom(created.id, { show: true });
            toast(`${created.name} is ready. Share it and start the conversation.`);
          })
          .catch((error) => {
            if (error.fields) {
              Object.entries(error.fields).forEach(([key, message]) => fields[key] && markField(fields[key], message));
              $('[aria-invalid="true"]', form)?.focus();
            } else {
              markField(fields.name, error.message);
              fields.name.focus();
            }
          });
        return false;
      },
    });
  }

  function reportDialog(message) {
    const dialog = openDialog({
      title: "Report this message",
      submitLabel: "Send report",
      body: `
        <blockquote class="report-quote"><strong>${escapeHTML(message.who)}</strong> ${escapeHTML(message.text)}</blockquote>
        <fieldset class="fieldset report-reasons">
          <legend class="fieldset__legend">What's wrong?</legend>
          ${REPORT_REASONS.map((reason, index) => `
            <label class="report-reason"><input type="radio" name="reason" value="${reason}"${index === 0 ? " checked" : ""}> ${reason}</label>`).join("")}
        </fieldset>
        <p class="field">
          <label class="field__label" for="report-details">Details <span class="field__optional">Optional</span></label>
          <textarea class="field__input" id="report-details" name="details" rows="2" maxlength="240"></textarea>
        </p>
        <p class="modal__note">Only the Wandr team sees reports. The sender isn't told who reported them.</p>`,
      onSubmit(form) {
        const details = form.elements.details;
        markField(details, "");
        whileBusy($('button[type="submit"]', form), "Sending…",
          () => community.report(message.id, { reason: form.elements.reason.value, details: details.value }))
          .then(() => {
            dialog.close();
            toast("Thanks. The Wandr team will take a look.");
          })
          .catch((error) => {
            markField(details, error.fields?.details || error.fields?.reason || error.message);
            details.focus();
          });
        return false;
      },
    });
  }

  function deleteDialog(message) {
    const dialog = openDialog({
      title: "Delete this message?",
      submitLabel: "Delete",
      body: `<p>${message.mine ? "It will be removed for everyone in the room." : `This removes ${escapeHTML(message.who)}'s message for everyone.`} This can't be undone.</p>`,
      onSubmit(form) {
        whileBusy($('button[type="submit"]', form), "Deleting…", () => community.remove(message.id))
          .then(() => {
            dialog.close();
            receive({ ...message, deleted: true, text: "" });
          })
          .catch((error) => {
            dialog.close();
            toast(error.message);
          });
        return false;
      },
    });
  }

  roomList.addEventListener("click", (event) => {
    const row = event.target.closest(".room");
    if (row) openRoom(row.dataset.room, { show: true });
  });

  messageList.addEventListener("click", async (event) => {
    if (event.target.closest("[data-more]")) {
      const button = event.target.closest("[data-more]");
      const id = current;
      try {
        const result = await whileBusy(button, "Loading…", () => community.messages(id, messages[0]?.id));
        if (current !== id) return;
        messages = [...result.messages, ...messages];
        more = result.more;
        renderMessages({ keep: "top" });
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    const row = event.target.closest(".msg");
    const message = row && messages.find((item) => String(item.id) === row.dataset.id);
    if (!message) return;
    if (event.target.closest(".msg__bubble") && !event.target.closest("a")) {
      $$(".msg--active", messageList).forEach((item) => item !== row && item.classList.remove("msg--active"));
      row.classList.toggle("msg--active");
    }
    if (event.target.closest("[data-delete]")) deleteDialog(message);
    if (event.target.closest("[data-report]")) reportDialog(message);
  });

  messageList.addEventListener("scroll", () => {
    if (nearBottom()) {
      jump.hidden = true;
      markRead();
    }
  });

  jump.addEventListener("click", () => {
    toBottom();
    markRead();
  });

  $("[data-back]").addEventListener("click", () => {
    page.classList.remove("is-chatting");
    $(".rooms").scrollIntoView({ block: "start" });
  });

  $("[data-new-room]").addEventListener("click", newRoomDialog);
  search.addEventListener("input", filterRooms);
  setupChips($(".chips"), (value) => { group = value; filterRooms(); });

  leave.addEventListener("click", () => toggleMembership(leave));
  gateAction.addEventListener("click", () => toggleMembership(gateAction));

  function resize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  input.addEventListener("input", resize);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || !current || sendButton.disabled) return;
    const id = current;
    input.value = "";
    resize();
    try {
      const message = await whileBusy(sendButton, "Sending…", () => community.send(id, text));
      if (current === id) receive(message);
      toBottom();
    } catch (error) {
      if (!input.value) {
        input.value = text;
        resize();
      }
      toast(error.message);
    }
    input.focus();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && nearBottom()) markRead();
  });

  window.addEventListener("wandr:change", async () => {
    const id = getUser()?.id || null;
    if (id === userId) return;
    userId = id;
    await loadRooms();
    startWatching();
  });

  PHONE.addEventListener("change", () => {
    if (!PHONE.matches) page.classList.remove("is-chatting");
  });

  await loadRooms();
  startWatching();
}
