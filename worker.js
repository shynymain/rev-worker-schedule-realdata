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

const PLACE_NAMES = Object.fromEntries(Object.entries(PLACE_CODES).map(([k, v]) => [v, k]));

function pad2(n) { return String(n).padStart(2, "0"); }
function ymdSlash(d) { return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`; }
function ymdCompact(d) { return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function nextWeekend(base = new Date()) {
  const day = base.getDay();
  const toSat = day === 6 ? 0 : (6 - day + 7) % 7;
  const sat = addDays(base, toSat);
  return [sat, addDays(sat, 1)];
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSurface(text) {
  if (/芝|Turf|T\b/.test(text)) return "芝";
  if (/ダ|Dirt|D\b/.test(text)) return "ダート";
  return "";
}
function normalizeDistance(text) {
  const m = String(text || "").match(/(?:芝|ダ|T|D)?\s*(\d{3,4})m?/i);
  return m ? `${m[1]}m` : "";
}
function normalizeGrade(text) {
  if (/G1|GI|Grade\s*1/i.test(text)) return "G1";
  if (/G2|GII|Grade\s*2/i.test(text)) return "G2";
  if (/G3|GIII|Grade\s*3/i.test(text)) return "G3";
  if (/Listed|\bL\b/i.test(text)) return "L";
  if (/OP|Open/i.test(text)) return "OP";
  if (/3勝|3 Win/i.test(text)) return "3勝";
  if (/2勝|2 Win/i.test(text)) return "2勝";
  if (/1勝|1 Win|Alw/i.test(text)) return "1勝";
  if (/未勝利|Maiden/i.test(text)) return "未勝利";
  if (/新馬|Debut/i.test(text)) return "新馬";
  return "";
}
function normalizeAge(text) {
  if (/4歳以上|4yo\+/i.test(text)) return "4歳以上";
  if (/3歳以上|3yo\+/i.test(text)) return "3歳以上";
  if (/3歳|3yo/i.test(text)) return "3歳";
  if (/2歳|2yo/i.test(text)) return "2歳";
  return "";
}
function normalizeCondition(text) {
  if (/ハンデ|Hcap|Handicap/i.test(text)) return "ハンデ";
  if (/別定/i.test(text)) return "別定";
  if (/定量/i.test(text)) return "定量";
  return "";
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Rev-VAN RealData Worker",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8"
    }
  });
  if (!res.ok) throw new Error(`fetch failed ${res.status} ${url}`);
  return await res.text();
}

function extractRaceLinks(html) {
  const links = [];
  const re = /race_id=(\d{12})/g;
  let m;
  while ((m = re.exec(html))) {
    if (!links.includes(m[1])) links.push(m[1]);
  }
  return links;
}

function parseRaceBasicFromText(text, fallback) {
  const t = String(text || "");
  let raceName = "";

  const raceNamePatterns = [
    /\b\d{1,2}R\s+([^|｜]+?)\s+(?:Racing Information|Racecard|Odds|Results)/i,
    /Racecard\s+([^|｜]+?)\s+(?:\d{4}|Turf|Dirt)/i,
    /([^\s|｜]{2,40}(?:ステークス|賞|特別|カップ|記念|S|C))\s+/i
  ];
  for (const p of raceNamePatterns) {
    const m = t.match(p);
    if (m && m[1]) { raceName = m[1].trim(); break; }
  }

  const surface = normalizeSurface(t);
  const distance = normalizeDistance(t);
  const grade = normalizeGrade(t);
  const age = normalizeAge(t);
  const condition = normalizeCondition(t);

  return {
    date: fallback.date || "",
    place: fallback.place || "",
    raceNo: String(fallback.raceNo || ""),
    raceName: raceName || `${fallback.place}${fallback.raceNo}R`,
    grade,
    condition,
    age,
    sex: /牝|Fillies|Mares/i.test(t) ? "牝馬" : "混合",
    surface,
    distance,
    headcount: ""
  };
}

function parseHorsesFromText(text) {
  const horses = [];
  const clean = String(text || "").replace(/\s+/g, " ");

  // netkeiba EN newspaper often exposes frame, no, horse name in a loose text stream.
  const re = /(?:^|\s)([1-8])\s+(\d{1,2})\s+([A-Za-z][A-Za-z0-9' .\-]{2,40}?)(?=\s+(?:\d{1,2}\s+)?(?:[MFHC]\d|\d{2,3}\.\d|[-*]|Jockey|Trainer|Odds|Weight|\d{1,2}\s+[A-Za-z]))/g;
  let m;
  while ((m = re.exec(clean))) {
    const frame = m[1];
    const no = m[2];
    const name = m[3].trim().replace(/\s{2,}/g, " ");
    if (!horses.some(h => h.no === no) && Number(no) >= 1 && Number(no) <= 18) {
      horses.push({ frame, no, name, last1: "", last2: "", last3: "", odds: "", popularity: "" });
    }
  }

  return horses.sort((a, b) => Number(a.no) - Number(b.no));
}

function addPopularityByOdds(horses) {
  const valid = horses
    .map(h => ({ h, odds: Number(h.odds) }))
    .filter(x => Number.isFinite(x.odds) && x.odds > 0)
    .sort((a, b) => a.odds - b.odds);

  let rank = 1;
  let prev = null;
  valid.forEach((x, i) => {
    if (prev !== null && x.odds !== prev) rank = i + 1;
    x.h.popularity = String(rank);
    prev = x.odds;
  });

  horses.forEach(h => { if (!h.popularity) h.popularity = ""; });
  return horses;
}

async function parseRaceFromRaceId(raceId) {
  const year = raceId.slice(0, 4);
  const month = raceId.slice(4, 6);
  const day = raceId.slice(6, 8);
  const placeCode = raceId.slice(8, 10);
  const raceNo = Number(raceId.slice(10, 12));
  const place = PLACE_NAMES[placeCode] || "";
  const date = `${year}/${month}/${day}`;

  const urls = [
    `https://en.netkeiba.com/race/newspaper.html?race_id=${raceId}`,
    `https://en.netkeiba.com/race/racecard.html?race_id=${raceId}`
  ];

  let html = "";
  let usedUrl = urls[0];
  for (const u of urls) {
    try {
      html = await fetchText(u);
      usedUrl = u;
      if (html && html.length > 500) break;
    } catch (_) {}
  }

  const text = stripHtml(html);
  const race = parseRaceBasicFromText(text, { date, place, raceNo });
  const horses = addPopularityByOdds(parseHorsesFromText(text));
  race.headcount = horses.length ? String(horses.length) : "";

  return {
    id: `${date.replaceAll("/", "-")}_${place}_${pad2(raceNo)}_${raceId}`,
    race,
    horses,
    source: "netkeiba-en-realdata",
    sourceRaceId: raceId,
    sourceUrl: usedUrl
  };
}

async function getRaceIdsFromList(dateObj) {
  const date = ymdCompact(dateObj);
  const url = `https://en.netkeiba.com/race/race_list.html?date=${date}`;
  const html = await fetchText(url);
  return extractRaceLinks(html);
}

async function getUpcomingRealRaces() {
  const [sat, sun] = nextWeekend(new Date());
  const dates = [sat, sun];
  const ids = [];

  for (const d of dates) {
    try {
      const dayIds = await getRaceIdsFromList(d);
      dayIds.forEach(id => { if (!ids.includes(id)) ids.push(id); });
    } catch (e) {
      console.log("race list failed", ymdSlash(d), e.message);
    }
  }

  const races = [];
  for (const raceId of ids.slice(0, 72)) {
    try {
      const r = await parseRaceFromRaceId(raceId);
      races.push(r);
    } catch (e) {
      console.log("race parse failed", raceId, e.message);
    }
  }
  return races;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(JSON.stringify({ ok: true }), { headers });

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "rev-realdata-schedule-worker",
        source: "netkeiba-en-realdata",
        endpoints: ["/api/schedule"]
      }), { headers });
    }

    if (url.pathname !== "/api/schedule") {
      return new Response(JSON.stringify({ ok: false, error: "not found", path: url.pathname }), { status: 404, headers });
    }

    try {
      const races = await getUpcomingRealRaces();
      return new Response(JSON.stringify({
        ok: true,
        count: races.length,
        generatedAt: new Date().toISOString(),
        source: "netkeiba-en-realdata",
        races
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({
        ok: false,
        error: String(e.message || e),
        source: "netkeiba-en-realdata"
      }), { status: 500, headers });
    }
  }
};
