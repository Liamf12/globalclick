const upgrades = [
  {id:"finger", icon:"◉", name:"Better Finger", desc:"+1 base click power", base:25, type:"add", value:1},
  {id:"grip", icon:"✚", name:"Iron Grip", desc:"+4 base click power", base:150, type:"add", value:4},
  {id:"double", icon:"Ⅱ", name:"Double Tap", desc:"×2 click multiplier", base:1000, type:"mult", value:2},
  {id:"turbo", icon:"»", name:"Turbo Click", desc:"×3 click multiplier", base:15000, type:"mult", value:3},
  {id:"overdrive", icon:"⚡", name:"Overdrive", desc:"×5 click multiplier", base:250000, type:"mult", value:5},
  {id:"quantum", icon:"◇", name:"Quantum Click", desc:"×10 click multiplier", base:5000000, type:"mult", value:10},
  {id:"cosmic", icon:"✦", name:"Cosmic Click", desc:"×25 click multiplier", base:150000000, type:"mult", value:25},
  {id:"reality", icon:"∞", name:"Reality Breaker", desc:"×100 click multiplier", base:10000000000, type:"mult", value:100},
  {id:"void", icon:"◈", name:"Void Engine", desc:"×500 click multiplier", base:1000000000000, type:"mult", value:500},
  {id:"infinite", icon:"∞", name:"Infinite Click", desc:"×2,500 click multiplier", base:1000000000000000, type:"mult", value:2500}
];

const milestones = [1e3, 1e5, 1e7, 1e9, 1e12, 1e15, 1e18, 1e21];

let db = null;

let state = {
  global: 0,
  user: 0,
  levels: {},
  online: 0
};

let userId = localStorage.getItem("gc_user") || crypto.randomUUID();

localStorage.setItem("gc_user", userId);


const fmt = n => {
  n = Number(n);

  if (!Number.isFinite(n)) return "∞";

  if (n < 1000) {
    return Math.floor(n).toLocaleString();
  }

  const units = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
  const i = Math.floor(Math.log10(n) / 3);

  return (
    n / 10 ** (i * 3)
  ).toFixed(n < 1e6 ? 1 : 2)
   .replace(/.00$/, "") + " " + (units[i - 1] || "");
};


const cost = (u, l) =>
  Math.floor(u.base * Math.pow(1.18, l));


const power = () => {
  let p = 1;
  let m = 1;

  for (const u of upgrades) {
    const l = state.levels[u.id] || 0;

    if (u.type === "add") {
      p += u.value * l;
    } else {
      m *= Math.pow(u.value, l);
    }
  }

  return Math.max(1, Math.floor(p * m));
};


function render() {

  document.querySelector("#globalClicks").textContent =
    fmt(state.global);

  document.querySelector("#wallet").textContent =
    fmt(state.user);

  document.querySelector("#players").textContent =
    fmt(state.user);

  document.querySelector("#cpc").textContent =
    fmt(power());

  document.querySelector("#buttonPower").textContent =
    fmt(power());

  document.querySelector("#online").textContent =
    state.online || "—";


  const next =
    milestones.find(x => x > state.global) ||
    milestones[milestones.length - 1];

  const previousMilestones =
    milestones.filter(x => x <= state.global);

  const prev =
    previousMilestones.length
      ? previousMilestones[previousMilestones.length - 1]
      : 0;

  const pct = Math.min(
    100,
    Math.max(
      0,
      ((state.global - prev) / (next - prev)) * 100
    )
  );


  document.querySelector("#milestoneText").textContent =
    `NEXT: ${fmt(next)} CLICKS`;

  document.querySelector("#milestonePct").textContent =
    Math.floor(pct) + "%";

  document.querySelector("#barFill").style.width =
    pct + "%";


  document.querySelector("#upgrades").innerHTML =
    upgrades.map(u => {

      const l = state.levels[u.id] || 0;
      const c = cost(u, l);
      const ok = state.user >= c;

      return `
        <div class="upgrade">
          <div class="u-icon">${u.icon}</div>

          <div class="u-main">
            <div class="u-name">
              ${u.name}
              <span style="color:#666">Lv.${l}</span>
            </div>

            <div class="u-desc">${u.desc}</div>
          </div>

          <button class="buy"
                  data-id="${u.id}"
                  ${ok ? "" : "disabled"}>
            <b>BUY</b>
            <span>${fmt(c)}</span>
          </button>
        </div>
      `;

    }).join("");


  document.querySelector("#milestoneCards").innerHTML =
    milestones.map(m => {

      const p = Math.min(
        100,
        (state.global / m) * 100
      );

      const done = state.global >= m;

      return `
        <div class="mcard ${done ? "done" : ""}">
          <b>${done ? "✓ " : ""}${fmt(m)}</b>

          <p>
            ${done
              ? "COMMUNITY MILESTONE REACHED"
              : "GLOBAL CLICK TARGET"}
          </p>

          <div class="mbar">
            <div style="width:${p}%"></div>
          </div>
        </div>
      `;

    }).join("");


  document.querySelectorAll(".buy").forEach(button => {
    button.onclick = () => buy(button.dataset.id);
  });
}


async function load() {

  try {

    if (
      !window.SUPABASE_URL ||
      !window.SUPABASE_ANON_KEY ||
      window.SUPABASE_URL.includes("PASTE_")
    ) {
      document.querySelector("#status").textContent =
        "ADD SUPABASE KEYS TO CONFIG.JS";

      return;
    }


    db = supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_ANON_KEY
    );


    const { data, error } =
      await db.rpc("get_game_state", {
        p_user_id: userId
      });


    if (error) {
      console.error("GET GAME STATE ERROR:", error);

      document.querySelector("#status").textContent =
        "DATABASE ERROR";

      return;
    }


    console.log("Initial game state:", data);


    state = {
      ...state,
      ...data,
      levels: data.levels || {}
    };


    render();


    await db.rpc("set_presence", {
      p_user_id: userId,
      p_online: true
    });


    const channel =
      db.channel("global-clicker");


    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "game_state"
        },
        payload => {

          console.log("REALTIME UPDATE:", payload);

          if (payload.new) {

            state.global =
              Number(payload.new.global_clicks);

            state.online =
              Number(
                payload.new.online_count ||
                state.online
              );

            render();
          }
        }
      )
      .subscribe(status => {

        console.log(
          "Realtime status:",
          status
        );

      });


    setInterval(async () => {

      await db.rpc("set_presence", {
        p_user_id: userId,
        p_online: true
      });

    }, 15000);


    setInterval(async () => {

      const { data, error } =
        await db.rpc("get_game_state", {
          p_user_id: userId
        });

      if (error) {
        console.error(
          "REFRESH ERROR:",
          error
        );

        return;
      }

      if (data) {

        state = {
          ...state,
          ...data,
          levels: data.levels || {}
        };

        render();
      }

    }, 5000);


    document.querySelector("#status").textContent =
      "LIVE";

    console.log("GLOBAL CLICK CONNECTED");

  } catch (error) {

    console.error(
      "LOAD ERROR:",
      error
    );

    document.querySelector("#status").textContent =
      "CONNECTION ERROR";
  }
}


async function clickGlobal() {

  console.log("CLICK BUTTON PRESSED");

  if (!db) {
    console.error("Supabase is not connected.");
    return;
  }


  const amount = power();

  console.log(
    "Sending click:",
    amount
  );


  const { data, error } =
    await db.rpc("perform_click", {
      p_user_id: userId,
      p_amount: amount
    });


  if (error) {

    console.error(
      "PERFORM CLICK ERROR:",
      error
    );

    return;
  }


  console.log(
    "Click result:",
    data
  );


  if (data) {

    state.global =
      Number(data.global_clicks);

    state.user =
      Number(data.user_clicks);

    state.levels =
      data.levels || state.levels;

    render();
  }


  const feed =
    document.querySelector("#feed");

  feed.textContent =
    `+${fmt(amount)} • GLOBAL CLICK REGISTERED`;

  setTimeout(() => {
    feed.textContent = "";
  }, 800);
}


async function buy(id) {

  if (!db) {
    console.error("Supabase is not connected.");
    return;
  }


  console.log(
    "Buying upgrade:",
    id
  );


  const { data, error } =
    await db.rpc("buy_upgrade", {
      p_user_id: userId,
      p_upgrade_id: id
    });


  if (error) {

    console.error(
      "BUY UPGRADE ERROR:",
      error
    );

    return;
  }


  if (data) {

    state.global =
      Number(data.global_clicks);

    state.user =
      Number(data.user_clicks);

    state.levels =
      data.levels || state.levels;

    render();
  }
}


document
  .querySelector("#clickBtn")
  .onclick = clickGlobal;


load();