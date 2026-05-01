REV-VAN 実データ schedule Worker

使い方:
1. Cloudflare Workersで新規Workerを作成
2. このZIP内の worker.js と wrangler.toml をリポジトリ直下に配置
3. Deploy
4. 動作確認:
   https://<worker名>.<subdomain>.workers.dev/api/health
   https://<worker名>.<subdomain>.workers.dev/api/schedule
   https://<worker名>.<subdomain>.workers.dev/api/schedule?date=20260502

AI Bindingは不要です。

注意:
このWorkerは netkeiba の公開HTMLを読み取って実レース一覧・出馬表を取得します。
サイト側のHTML変更・アクセス制限がある場合は取得失敗することがあります。
JRA-VAN DataLab公式連携ではありません。
