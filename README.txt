rev-worker-schedule-realdata bridge版

目的:
- 既存の rev-worker-schedule-full を出馬表・オッズ取得エンジンとして使う
- この Worker はアプリ用の /api/schedule /api/history-grades /api/race をまとめる

デプロイ先:
- Cloudflare Worker: rev-worker-schedule-realdata

確認URL:
- /api/health
- /api/schedule
- /api/schedule?raceId=202605020101
- /api/race?raceId=202605020101
- /api/history-grades

注意:
- /api/schedule 単体は開催一覧テンプレート
- 出馬表・オッズ取得は raceId 指定時に rev-worker-schedule-full を呼び出す
