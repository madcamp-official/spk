# 배포 노트 (camp-15 VM)

> `/api/track` 추가에 따라 **서버 쪽에서 손봐야 하는 것**만 적는다.
> 아래 nginx·systemd 스니펫은 VM에서 검증하지 못했다 (로컬에는 VM이 없다).
> 코드 자체(`counter.js` + 클라이언트)는 실제로 띄워서 브라우저로 검증했다.

## 1. systemd — 이벤트 파일 경로

`counter.js`는 `EVENTS_FILE`이 없으면 `/var/lib/life-reroll/events.jsonl`에 쓴다
(`COUNTER_FILE`과 같은 디렉터리라 별도 권한 작업은 없을 것이다).
경로를 바꾸고 싶을 때만 유닛에 추가한다:

```ini
[Service]
Environment=EVENTS_FILE=/var/lib/life-reroll/events.jsonl
Environment=TRACK_RATE_PER_MIN=240
```

디렉터리 쓰기 권한 확인:

```bash
sudo -u <counter-user> touch /var/lib/life-reroll/events.jsonl && echo ok
```

## 2. nginx — `/api/track` 전용 레이트리밋

⚠️ **`/api/`에 걸린 기존 `limit_req`를 그대로 물려받으면 안 된다.**
counter는 요청 1건 = 증가 1회지만, `/api/track`은 한 번에 최대 50개를 싣고
`pagehide` 때 몰려서 나간다. counter 기준으로 좁게 잡힌 존을 쓰면 **정상 배치가
503으로 잘리고, 하필 `exit`·마지막 `dwell`이 통째로 사라진다** (그 시점에만 존재하므로).

```nginx
# http 블록
limit_req_zone $binary_remote_addr zone=track:10m rate=30r/m;

# server 블록 — 기존 /api/ 프록시보다 먼저 (더 구체적인 location이 우선)
location = /api/track {
    limit_req zone=track burst=20 nodelay;
    client_max_body_size 16k;          # counter.js MAX_BODY=8192 보다 넉넉히
    proxy_pass http://127.0.0.1:1558;
    proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;
}
```

`CF-Connecting-IP`가 그대로 전달되는지 반드시 확인한다 — 이게 없으면 모든 방문자가
`127.0.0.1` 하나로 뭉쳐서 ① 고유 방문자 수가 1이 되고 ② 레이트리밋이 전체를 막는다.

```bash
# 확인: 이벤트를 하나 쏘고 ip_h가 서로 다른지
tail -2 /var/lib/life-reroll/events.jsonl | jq .ip_h
```

## 3. 배포

```bash
cd ~/spk && git pull
install -m 644 index.html og-image.png TwemojiCountryFlags.woff2 /var/www/life-reroll/
sudo chown -R www-data:www-data /var/www/life-reroll
sudo install -m 644 server/counter.js /opt/life-reroll/counter.js
sudo systemctl restart life-reroll-counter
sudo nginx -t && sudo systemctl reload nginx
```

## 4. 배포 직후 검증 3종

```bash
# 1) 이벤트가 쌓이는가 — 사이트에서 리롤 2~3회
tail -f /var/lib/life-reroll/events.jsonl

# 2) 탭을 닫아도 exit이 도착하는가 (pagehide 배치)
jq -r 'select(.e=="exit")' /var/lib/life-reroll/events.jsonl | tail -1

# 3) 각인이 살아 있는가 — ?ref=everytime&v=a 로 들어가서
jq -r 'select(.e=="visit") | "\(.p.ref) vin=\(.p.vin)"' /var/lib/life-reroll/events.jsonl | tail -3
```

리롤 체감 확인: DevTools Network를 켜고 리롤 → **클릭에서 결과가 뜰 때까지
`/api/track` 요청이 없어야 한다** (3초 뒤에 한 번에 나간다).

## 5. 로그 로테이션

```
# /etc/logrotate.d/life-reroll-events
/var/lib/life-reroll/events.jsonl {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate      # counter.js가 append 중이므로 create 대신 copytruncate
}
```

`copytruncate`인 이유: `counter.js`는 파일 핸들을 계속 들고 있지 않고 매번
`fs.appendFile`로 열고 닫지만, 로테이션 중 쓰기가 겹칠 수 있어 안전한 쪽을 택한다.

## 남은 것 (코드 아님)

- [ ] Google Search Console 등록 (DNS TXT) → 노출수·클릭수·CTR
- [ ] `?ref=` 규약 엄수하여 채널별 링크 배포 (ref 없는 링크 = 그 채널 성과 영영 못 잼)
- [ ] events.jsonl 백업 (VM 밖 1곳)
