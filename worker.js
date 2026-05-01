const VERSION = "realdata-bridge-full-worker-2026-05-02";

const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const PLACES = [
  { code: "01", name: "札幌" }, { code: "02", name: "函館" }, { code: "03", name: "福島" },
  { code: "04", name: "新潟" }, { code: "05", name: "東京" }, { code: "06", name: "中山" },
  { code: "07", name: "中京" }, { code: "08", name: "京都" }, { code: "09", name: "阪神" }, { code: "10", name: "小倉" }
];
const PLACE_BY_NAME = Object.fromEntries(PLACES.map(p => [p.name, p.code]));
const PLACE_BY_CODE = Object.fromEntries(PLACES.map(p => [p.code, p.name]));

function json(data, init = {}) {
  return new Response(JSON.stringify(data), { ...init, headers });
}
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}
function ymdCompact(dateText) {
  return String(dateText || "").replace(/\D/g, "").slice(0, 8);
}
function nextSaturday(base = new Date()) {
  const d = new Date(base);
  const add = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + add);
  return d;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function raceIdFrom(dateText, place, raceNo) {
  const code = PLACE_BY_NAME[place] || place;
  return `${ymdCompact(dateText)}${code}${String(raceNo).padStart(2, "0")}`;
}
function baseRace(dateText, place, raceNo) {
  const id = raceIdFrom(dateText, place, raceNo);
  return {
    id,
    race: {
      date: dateText,
      place,
      raceNo: String(raceNo),
      raceName: `${place}${raceNo}R`,
      grade: "",
      condition: "",
      surface: "",
      age: "",
      distance: "",
      headcount: ""
    },
    horses: [],
    source: "realdata-bridge-template",
    sourceRaceId: id,
    status: "schedule_only"
  };
}
function makeScheduleTemplates() {
  const sat = nextSaturday(new Date());
  const sun = addDays(sat, 1);
  const places = ["東京", "京都", "新潟"];
  const dates = [ymd(sat), ymd(sun)];
  const races = [];
  for (const date of dates) {
    for (const place of places) {
      for (let r = 1; r <= 12; r++) races.push(baseRace(date, place, r));
    }
  }
  return races;
}
function normalizeFullResponse(data, fallbackId = "") {
  const race = data?.race?.race ? data.race : data?.race;
  if (race && race.race && Array.isArray(race.horses)) return race;
  if (data?.race && Array.isArray(data?.horses)) {
    const raceObj = {
      id: data.race.id || `${data.race.date}_${data.race.place}_${String(data.race.raceNo || "").padStart(2, "0")}`,
      race: data.race,
      horses: data.horses,
      source: "schedule-full-bridge",
      sourceRaceId: fallbackId,
      oddsCount: data.oddsCount || 0,
      oddsStatus: data.oddsStatus || "",
      status: data.status || "ok",
      warnings: data.warnings || []
    };
    return raceObj;
  }
  return null;
}
async function fetchFull(env, raceId) {
  const base = (env.FULL_WORKER_BASE || "https://rev-worker-schedule-full.umeparis0317.workers.dev").replace(/\/$/, "");
  const target = `${base}/api/schedule?raceId=${encodeURIComponent(raceId)}`;
  const res = await fetch(target, { headers: { accept: "application/json" } });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: "full_worker_non_json", raw: text.slice(0, 500) }; }
  if (!res.ok || !data.ok) return { ok: false, raceId, sourceUrl: target, status: res.status, error: data.error || `full worker ${res.status}`, raw: data };
  const race = normalizeFullResponse(data, raceId);
  if (!race) return { ok: false, raceId, sourceUrl: target, error: "full_worker_shape_unexpected", raw: data };
  race.source = "rev-worker-schedule-full";
  race.sourceRaceId = raceId;
  race.bridgeSourceUrl = target;
  return { ok: true, raceId, race };
}
async function fetchManyFull(env, ids) {
  const limited = ids.filter(Boolean).slice(0, 12);
  const results = await Promise.allSettled(limited.map(id => fetchFull(env, id)));
  const races = [];
  const errors = [];
  for (const r of results) {
    const v = r.status === "fulfilled" ? r.value : { ok: false, error: String(r.reason) };
    if (v.ok) races.push(v.race); else errors.push(v);
  }
  return { races, errors, requested: ids.length, fetched: limited.length };
}
function historyGrades() {
  // 保存・分析用の入口。実データ詳細は /api/race?raceId=... または /api/schedule?raceIds=... で full worker から取得する。
  const items = [
    { date: "2025/12/28", place: "中山", raceNo: "11", raceName: "ホープフルステークス", grade: "G1", surface: "芝", distance: "2000m" },
    { date: "2025/12/27", place: "阪神", raceNo: "11", raceName: "阪神カップ", grade: "G2", surface: "芝", distance: "1400m" },
    { date: "2025/12/21", place: "中山", raceNo: "11", raceName: "有馬記念", grade: "G1", surface: "芝", distance: "2500m" },
    { date: "2025/12/14", place: "阪神", raceNo: "11", raceName: "朝日杯フューチュリティステークス", grade: "G1", surface: "芝", distance: "1600m" },
    { date: "2025/12/07", place: "中京", raceNo: "11", raceName: "チャンピオンズカップ", grade: "G1", surface: "ダート", distance: "1800m" },
    { date: "2025/11/30", place: "東京", raceNo: "12", raceName: "ジャパンカップ", grade: "G1", surface: "芝", distance: "2400m" },
    { date: "2025/11/23", place: "京都", raceNo: "11", raceName: "マイルチャンピオンシップ", grade: "G1", surface: "芝", distance: "1600m" },
    { date: "2025/11/16", place: "京都", raceNo: "11", raceName: "エリザベス女王杯", grade: "G1", surface: "芝", distance: "2200m" },
    { date: "2025/11/02", place: "東京", raceNo: "11", raceName: "天皇賞（秋）", grade: "G1", surface: "芝", distance: "2000m" },
    { date: "2025/10/26", place: "京都", raceNo: "11", raceName: "菊花賞", grade: "G1", surface: "芝", distance: "3000m" },
    { date: "2025/10/19", place: "京都", raceNo: "11", raceName: "秋華賞", grade: "G1", surface: "芝", distance: "2000m" },
    { date: "2025/10/05", place: "東京", raceNo: "11", raceName: "毎日王冠", grade: "G2", surface: "芝", distance: "1800m" }
  ];
  return items.map(x => ({
    id: raceIdFrom(x.date, x.place, x.raceNo),
    race: { ...x, condition: "", age: "", headcount: "" },
    horses: [],
    source: "history-grades-index",
    sourceRaceId: raceIdFrom(x.date, x.place, x.raceNo),
    status: "history_index_only"
  }));
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return json({ ok: true });
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/" || path === "/api/health") {
        return json({
          ok: true,
          app: "rev-worker-schedule-realdata",
          version: VERSION,
          fullWorkerBase: (env.FULL_WORKER_BASE || "https://rev-worker-schedule-full.umeparis0317.workers.dev").replace(/\/$/, ""),
          endpoints: [
            "/api/schedule",
            "/api/schedule?raceId=202605020101",
            "/api/schedule?raceIds=202605020101,202605020102",
            "/api/race?raceId=202605020101",
            "/api/history-grades",
            "/api/results",
            "/api/import-json"
          ]
        });
      }

      if (path === "/api/race") {
        const raceId = url.searchParams.get("raceId") || url.searchParams.get("id") || "";
        if (!/^\d{12}$/.test(raceId)) return json({ ok: false, error: "raceId must be 12 digits" }, { status: 400 });
        const got = await fetchFull(env, raceId);
        if (!got.ok) return json(got, { status: 502 });
        return json({ ok: true, version: VERSION, raceId, race: got.race, horses: got.race.horses || [] });
      }

      if (path === "/api/schedule") {
        const raceId = url.searchParams.get("raceId") || url.searchParams.get("id") || "";
        const raceIds = (url.searchParams.get("raceIds") || "").split(",").map(s => s.trim()).filter(Boolean);
        if (raceId) raceIds.unshift(raceId);

        if (raceIds.length) {
          const got = await fetchManyFull(env, raceIds);
          return json({
            ok: got.errors.length === 0,
            version: VERSION,
            mode: "full-worker-detail",
            count: got.races.length,
            races: got.races,
            errors: got.errors,
            requested: got.requested,
            fetched: got.fetched
          }, got.races.length ? {} : { status: 502 });
        }

        return json({
          ok: true,
          version: VERSION,
          mode: "upcoming-index",
          source: "realdata-bridge-template",
          note: "一覧は開催テンプレートです。出馬表・オッズは /api/schedule?raceId=12桁ID または raceIds 指定時に rev-worker-schedule-full から取得します。",
          count: makeScheduleTemplates().length,
          races: makeScheduleTemplates()
        });
      }

      if (path === "/api/history-grades") {
        return json({
          ok: true,
          version: VERSION,
          mode: "history-grade-index",
          note: "過去重賞の入口一覧です。詳細取得は各 sourceRaceId を /api/race?raceId=... に渡してください。",
          count: historyGrades().length,
          races: historyGrades()
        });
      }

      if (path === "/api/results") {
        return json({ ok: true, version: VERSION, mode: "results-placeholder", results: [], note: "結果取得Workerを統合する場合はここへ接続します。" });
      }

      if (path === "/api/import-json") {
        if (request.method !== "POST") return json({ ok: false, error: "POST only" }, { status: 405 });
        const body = await request.json().catch(() => null);
        const races = Array.isArray(body?.races) ? body.races : (body?.race ? [body] : []);
        return json({ ok: true, version: VERSION, importedCount: races.length, races });
      }

      return json({ ok: false, error: "not found", path }, { status: 404 });
    } catch (e) {
      return json({ ok: false, error: String(e.message || e), version: VERSION }, { status: 500 });
    }
  }
};
