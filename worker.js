
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const raceId = url.searchParams.get("raceId") || "202605020101";

    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({
        ok: true,
        mode: "bridge",
        engine: "schedule-full"
      }), { headers: { "content-type": "application/json" } });
    }

    if (url.pathname === "/api/schedule" || url.pathname === "/api/race") {
      const target = `https://rev-worker-schedule-full.umeparis0317.workers.dev/api/schedule?raceId=${raceId}`;
      const res = await fetch(target);
      const data = await res.json();

      return new Response(JSON.stringify({
        ok: true,
        mode: "bridge",
        raceId,
        race: data.race,
        horses: data.horses,
        oddsCount: data.oddsCount,
        oddsStatus: data.oddsStatus
      }), { headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: false, error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" }
    });
  }
};
