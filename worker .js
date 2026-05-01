const VERSION = "realdata-full-auto-v1";
const ENGINE_BASE = "https://rev-worker-schedule-full.umeparis0317.workers.dev";

const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const PLACE_CODES = {
  "札幌": "01",
  "函館": "02",
  "福島": "03",
  "新潟": "04",
  "東京": "05",
  "中山": "06",
  "中京": "07",
  "京都": "08",
  "阪神": "09",
  "小倉": "10"
};

const DEFAULT_PLACES = ["東京", "京都", "新潟"];

function j(data, init = {}) {
  return new Response(JSON.stringify(data), { ...init, headers });
}

function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function slashDateFromYmd(s) {
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function nextWeekendDates() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dates = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(today, i);
    const day = d.getUTCDay();
    if (day === 6 || day === 0) dates.push(ymd(d));
    if (dates.length >= 4) break;
  }
  if (!dates.length) dates.push(ymd(today));
  return dates;
}

function makeRaceIds({ dates = nextWeekendDates(), places = DEFAULT_PLACES, fromRace = 1, toRace = 12 } = {}) {
  const ids = [];
  for (const date of dates) {
    for (const place of places) {
      const code = PLACE_CODES[place];
      if (!code) continue;
      for (let r = fromRace; r <= toRace; r++) {
        ids.push(`${date}${code}${String(r).padStart(2, "0")}`);
      }
    }
  }
  return ids;
}

function raceShell(raceId) {
  const ymds = raceId.slice(0, 8);
  const placeCode = raceId.slice(8, 10);
  const raceNo = String(Number(raceId.slice(10, 12)));
  const place = Object.entries(PLACE_CODES).find(([, code]) => code === placeCode)?.[0] || "";
  return {
    id: raceId,
    race: {
      date: slashDateFromYmd(ymds),
      place,
      raceNo,
      raceName: `${place}${raceNo}R`,
      grade: "",
      condition: "",
      surface: "",
      age: "",
      distance: "",
      headcount: ""
    },
    horses: [],
    status: "scheduled",
    sourceRaceId: raceId,
    source: "generated-schedule"
  };
}

async function engineRace(raceId) {
  const target = `${ENGINE_BASE}/api/schedule?raceId=${encodeURIComponent(raceId)}`;
  const res = await fetch(target, {
    headers: { "accept": "application/json" }
  });
  const text = await res.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    return {
      ok: false,
      raceId,
      error: "schedule-full returned non-JSON",
      raw: text.slice(0, 300),
      fallback: raceShell(raceId)
    };
  }

  if (!data || data.ok === false) {
    return {
      ok: false,
      raceId,
      error: data?.error || "schedule-full failed",
      engine: data,
      fallback: raceShell(raceId)
    };
  }

  const race = data.race?.race ? data.race : {
    id: raceId,
    race: data.race || raceShell(raceId).race,
    horses: data.horses || []
  };

  return {
    ok: true,
    raceId,
    race: {
      ...race,
      id: race.id || raceId,
      sourceRaceId: race.sourceRaceId || raceId,
      horses: race.horses || data.horses || [],
      oddsCount: data.oddsCount ?? race.oddsCount ?? 0,
      oddsStatus: data.oddsStatus ?? race.oddsStatus ?? "unknown",
      status: data.status ?? race.status ?? "ok",
      mode: "full-auto-bridge"
    }
  };
}

async function kvGet(env, key) {
  if (!env.RACES_KV) return null;
  const v = await env.RACES_KV.get(key);
  if (!v) return null;
  try { return JSON.parse(v); } catch { return null; }
}

async function kvPut(env, key, value) {
  if (!env.RACES_KV) return false;
  await env.RACES_KV.put(key, JSON.stringify(value));
  return true;
}

async function getRace(env, raceId, { refresh = false } = {}) {
  const key = `race:${raceId}`;
  if (!refresh) {
    const cached = await kvGet(env, key);
    if (cached) return { ok: true, cached: true, race: cached };
  }

  const got = await engineRace(raceId);
  const race = got.ok ? got.race : got.fallback;
  if (race) await kvPut(env, key, race);

  return {
    ok: got.ok,
    cached: false,
    race,
    error: got.error,
    raw: got.raw
  };
}

function parseListParam(url, name) {
  const v = url.searchParams.get(name);
  if (!v) return null;
  return v.split(",").map(x => x.trim()).filter(Boolean);
}

async function buildSchedule(request, env) {
  const url = new URL(request.url);
  const raceId = url.searchParams.get("raceId") || url.searchParams.get("id");
  const refresh = url.searchParams.get("refresh") === "1";
  const hydrate = url.searchParams.get("hydrate") === "1";
  const limit = Math.min(Number(url.searchParams.get("limit") || (hydrate ? 12 : 72)), 72);

  if (raceId) {
    const got = await getRace(env, raceId, { refresh });
    return j({
      ok: got.ok,
      mode: "full-auto",
      raceId,
      cached: got.cached,
      race: got.race,
      horses: got.race?.horses || [],
      oddsCount: got.race?.oddsCount ?? 0,
      oddsStatus: got.race?.oddsStatus || "",
      error: got.error,
      raw: got.raw
    });
  }

  const dates = parseListParam(url, "dates") || nextWeekendDates();
  const places = parseListParam(url, "places") || DEFAULT_PLACES;
  const ids = makeRaceIds({ dates, places }).slice(0, limit);

  if (!hydrate) {
    const races = ids.map(raceShell);
    return j({
      ok: true,
      mode: "full-auto-list",
      note: "hydrate=1 を付けると出馬表まで取得します。通常アプリ用はこの一覧を保存し、個別表示時に /api/race?raceId=... で詳細取得が安定です。",
      count: races.length,
      dates,
      places,
      races
    });
  }

  const races = [];
  const errors = [];
  for (const id of ids) {
    const got = await getRace(env, id, { refresh });
    if (got.race) races.push(got.race);
    if (!got.ok) errors.push({ raceId: id, error: got.error, raw: got.raw });
  }

  return j({
    ok: true,
    mode: "full-auto-hydrated",
    count: races.length,
    errorCount: errors.length,
    kv: !!env.RACES_KV,
    dates,
    places,
    races,
    errors: errors.slice(0, 10)
  });
}

function historyGradeSeeds() {
  return [
    { id: "202405260511", race: { date: "2024/05/26", place: "東京", raceNo: "11", raceName: "東京優駿", grade: "G1", surface: "芝", distance: "2400m", age: "3歳", headcount: "" }, horses: [], status: "history_seed" },
    { id: "202406230811", race: { date: "2024/06/23", place: "京都", raceNo: "11", raceName: "宝塚記念", grade: "G1", surface: "芝", distance: "2200m", age: "3歳以上", headcount: "" }, horses: [], status: "history_seed" },
    { id: "202410270511", race: { date: "2024/10/27", place: "東京", raceNo: "11", raceName: "天皇賞（秋）", grade: "G1", surface: "芝", distance: "2000m", age: "3歳以上", headcount: "" }, horses: [], status: "history_seed" },
    { id: "202411240511", race: { date: "2024/11/24", place: "東京", raceNo: "11", raceName: "ジャパンカップ", grade: "G1", surface: "芝", distance: "2400m", age: "3歳以上", headcount: "" }, horses: [], status: "history_seed" },
    { id: "202412220611", race: { date: "2024/12/22", place: "中山", raceNo: "11", raceName: "有馬記念", grade: "G1", surface: "芝", distance: "2500m", age: "3歳以上", headcount: "" }, horses: [], status: "history_seed" }
  ];
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return j({ ok: true });

    const url = new URL(request.url);

    try {
      if (url.pathname === "/" || url.pathname === "/api/health") {
        return j({
          ok: true,
          app: "rev-worker-schedule-realdata",
          version: VERSION,
          mode: "full-auto",
          engine: ENGINE_BASE,
          kv: !!env.RACES_KV,
          endpoints: [
            "/api/schedule",
            "/api/schedule?hydrate=1&limit=12",
            "/api/schedule?raceId=202605020101",
            "/api/race?raceId=202605020101",
            "/api/history-grades",
            "/api/save-schedule?hydrate=1&limit=12"
          ]
        });
      }

      if (url.pathname === "/api/schedule" || url.pathname === "/api/race") {
        return await buildSchedule(request, env);
      }

      if (url.pathname === "/api/save-schedule") {
        const req2 = new Request(new URL(request.url.replace("/api/save-schedule", "/api/schedule")).toString(), request);
        const res = await buildSchedule(req2, env);
        return res;
      }

      if (url.pathname === "/api/history-grades") {
        const races = historyGradeSeeds();
        for (const r of races) await kvPut(env, `race:${r.id}`, r);
        return j({
          ok: true,
          mode: "history-grade-seeds",
          note: "過去重賞はまず保存用シードです。実出馬表は raceId 指定で取得できるものから順次 hydrate してください。",
          count: races.length,
          races
        });
      }

      if (url.pathname === "/api/import-json" && request.method === "POST") {
        const body = await request.json();
        const races = Array.isArray(body.races) ? body.races : [];
        let saved = 0;
        for (const r of races) {
          const id = r.id || r.sourceRaceId || `${r.race?.date || ""}_${r.race?.place || ""}_${String(r.race?.raceNo || "").padStart(2, "0")}`;
          if (!id) continue;
          await kvPut(env, `race:${id}`, { ...r, id });
          saved++;
        }
        return j({ ok: true, saved, kv: !!env.RACES_KV });
      }

      return j({ ok: false, error: "not found", path: url.pathname }, { status: 404 });
    } catch (e) {
      return j({
        ok: false,
        error: "realdata worker exception",
        detail: String(e?.message || e),
        version: VERSION
      }, { status: 500 });
    }
  }
};
