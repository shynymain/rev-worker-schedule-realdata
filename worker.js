const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

const VERSION = "realdata-complete-2026-05-02";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), { status, headers });
}
function clean(v){ return String(v ?? "").trim(); }
function ymd(date){
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}/${m}/${d}`;
}
function makeId(date, place, raceNo){
  return `${String(date).replaceAll("/","")}_${place}_${String(raceNo).padStart(2,"0")}`;
}
function normalizeRace(input = {}){
  const race = input.race || input;
  const date = clean(race.date);
  const place = clean(race.place);
  const raceNo = clean(race.raceNo || race.no || race.r);
  return {
    id: clean(input.id) || makeId(date, place, raceNo),
    race: {
      date,
      place,
      raceNo,
      raceName: clean(race.raceName || race.name),
      grade: clean(race.grade),
      condition: clean(race.condition),
      surface: clean(race.surface),
      age: clean(race.age),
      distance: clean(race.distance),
      headcount: clean(race.headcount || race.horsesCount)
    },
    horses: Array.isArray(input.horses) ? input.horses.map(h => ({
      frame: clean(h.frame),
      no: clean(h.no || h.number),
      name: clean(h.name),
      last1: clean(h.last1),
      last2: clean(h.last2),
      last3: clean(h.last3),
      odds: clean(h.odds),
      popularity: clean(h.popularity)
    })) : [],
    result: input.result || {},
    source: clean(input.source) || "worker"
  };
}

// 過去重賞ベースデータ。必要に応じてここへ追加すれば /api/history-grades で返ります。
// まずはアプリ連携確認用の最小データを入れています。
const HISTORY_GRADES = [
  {
    race:{date:"2025/12/28",place:"中山",raceNo:"11",raceName:"ホープフルステークス",grade:"G1",condition:"2歳",surface:"芝",age:"2歳",distance:"2000m",headcount:""},
    horses:[], result:{}, source:"history-seed"
  },
  {
    race:{date:"2025/12/21",place:"中山",raceNo:"11",raceName:"有馬記念",grade:"G1",condition:"3歳以上",surface:"芝",age:"3歳以上",distance:"2500m",headcount:""},
    horses:[], result:{}, source:"history-seed"
  },
  {
    race:{date:"2025/11/30",place:"東京",raceNo:"12",raceName:"ジャパンカップ",grade:"G1",condition:"3歳以上",surface:"芝",age:"3歳以上",distance:"2400m",headcount:""},
    horses:[], result:{}, source:"history-seed"
  },
  {
    race:{date:"2025/11/23",place:"京都",raceNo:"11",raceName:"マイルチャンピオンシップ",grade:"G1",condition:"3歳以上",surface:"芝",age:"3歳以上",distance:"1600m",headcount:""},
    horses:[], result:{}, source:"history-seed"
  },
  {
    race:{date:"2025/11/16",place:"京都",raceNo:"11",raceName:"エリザベス女王杯",grade:"G1",condition:"3歳以上牝",surface:"芝",age:"3歳以上",distance:"2200m",headcount:""},
    horses:[], result:{}, source:"history-seed"
  }
].map(normalizeRace);

function upcomingSchedule(){
  const today = new Date();
  const day = today.getDay();
  const sat = new Date(today); sat.setDate(today.getDate() + ((6 - day + 7) % 7));
  const sun = new Date(sat); sun.setDate(sat.getDate()+1);
  const places = ["東京","京都","新潟"];
  const races = [];
  for (const d of [sat, sun]) {
    for (const place of places) {
      for (let r=1; r<=12; r++) {
        const surface = r >= 9 ? "芝" : "";
        const grade = r === 11 ? (place === "東京" ? "G2" : "OP") : "";
        const raceName = r === 11 ? `${place}メイン` : `${place}${r}R`;
        races.push(normalizeRace({
          source:"schedule-template",
          race:{date:ymd(d),place,raceNo:String(r),raceName,grade,condition:r>=9?"3歳以上":"",surface,age:r>=9?"3歳以上":"",distance:r>=9?"芝1600m".replace("芝",""):"",headcount:""},
          horses:[]
        }));
      }
    }
  }
  return races;
}

async function readBody(request){
  try { return await request.json(); } catch { return {}; }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return json({ ok:true });
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/" || path === "/api/health") {
      return json({ ok:true, app:"rev-worker-schedule-realdata", version:VERSION, endpoints:["/api/schedule","/api/history-grades","/api/race?id=...","/api/results","/api/import-json"] });
    }

    if (path === "/api/schedule") {
      const mode = url.searchParams.get("mode") || "upcoming";
      const races = upcomingSchedule();
      return json({ ok:true, version:VERSION, mode, source:"schedule-template", note:"実データ取得元を接続するまでは開催予定テンプレートを返します。出馬表JSONを /api/import-json 形式で追加できます。", count:races.length, races });
    }

    if (path === "/api/history-grades") {
      const grade = url.searchParams.get("grade");
      const races = grade ? HISTORY_GRADES.filter(r => r.race.grade === grade) : HISTORY_GRADES;
      return json({ ok:true, version:VERSION, source:"history-seed", note:"過去重賞の全件化はこのHISTORY_GRADES配列へ追記、または外部JSON/KV接続で拡張します。", count:races.length, races });
    }

    if (path === "/api/race") {
      const id = url.searchParams.get("id") || "";
      const all = [...HISTORY_GRADES, ...upcomingSchedule()];
      const found = all.find(r => r.id === id || makeId(r.race.date, r.race.place, r.race.raceNo) === id);
      return found ? json({ ok:true, race:found }) : json({ ok:false, error:"race not found", id }, 404);
    }

    if (path === "/api/results") {
      return json({ ok:true, version:VERSION, source:"result-template", results:[], note:"結果取得Workerを別運用している場合は既存 rev-worker-result のURLを使ってください。後でここへ統合可能です。" });
    }

    if (path === "/api/import-json" && request.method === "POST") {
      const body = await readBody(request);
      const races = Array.isArray(body.races) ? body.races.map(normalizeRace) : (body.race ? [normalizeRace(body)] : []);
      return json({ ok:true, count:races.length, races, note:"このエンドポイントは整形確認用です。永続保存する場合はKV bindingを追加します。" });
    }

    return json({ ok:false, error:"not found", path }, 404);
  }
};
