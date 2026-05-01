const headers = {
  "content-type": "application/json;charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

function ymd(d){
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,'0');
  const day=String(d.getDate()).padStart(2,'0');
  return `${y}/${m}/${day}`;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function nextWeekend(base){
  const day=base.getDay();
  const toSat = day === 6 ? 0 : (6 - day + 7) % 7;
  const sat = addDays(base, toSat);
  const sun = addDays(sat, 1);
  return [sat, sun];
}

function makeRaces(){
  const now = new Date();
  const [sat,sun] = nextWeekend(now);
  const dates=[sat,sun];
  const places=["東京","京都","新潟"];
  const races=[];
  dates.forEach((d)=>{
    places.forEach((place)=>{
      for(let raceNo=1; raceNo<=12; raceNo++){
        const id=`${ymd(d).replaceAll('/','-')}_${place}_${String(raceNo).padStart(2,'0')}`;
        races.push({
          id,
          race:{
            date: ymd(d),
            place,
            raceNo:String(raceNo),
            raceName:`${place}${raceNo}R`,
            grade: raceNo===11 ? "G2" : (raceNo>=9 ? "OP" : "1勝"),
            condition: raceNo<=6 ? "3歳" : "4歳以上",
            age: raceNo<=6 ? "3歳" : "4歳以上",
            surface: raceNo<=4 ? "ダート" : "芝",
            distance: ["1200m","1400m","1600m","1800m","1600m","1800m","2000m","1400m","1800m","2000m","2400m","1600m"][raceNo-1],
            headcount: String(12 + (raceNo % 7))
          },
          horses: [],
          source:"route-test"
        });
      }
    });
  });
  return races;
}

export default {
  async fetch(request) {

    if (request.method === "OPTIONS") {
      return new Response(JSON.stringify({ ok: true }), { headers });
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "rev-realdata-schedule-worker",
        endpoints: ["/api/schedule"]
      }), { headers });
    }

    if (url.pathname === "/api/schedule") {
      const races = makeRaces();
      return new Response(JSON.stringify({
        ok: true,
        count: races.length,
        generatedAt: new Date().toISOString(),
        source: "route-test",
        races
      }), { headers });
    }

    return new Response(JSON.stringify({
      ok: false,
      error: "not found",
      path: url.pathname
    }), { status: 404, headers });
  }
};
