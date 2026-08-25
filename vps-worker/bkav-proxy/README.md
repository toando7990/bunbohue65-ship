# bkav-proxy — hướng dẫn triển khai

Service hệ thống riêng, giải mã phản hồi Bkav eHoadon (AES-256-CBC + gzip).
Chạy nội bộ cổng **3000** (KHÔNG đụng cổng 3001 của `vps-worker` chính) — chỉ
truy cập được qua Nginx trên domain **`proxy.bunbohue65.com`** đã có sẵn (đã
có SSL, dùng chung với API chính, không cần domain/chứng chỉ mới).

## Bước 1 — Copy code lên VPS

```bash
scp -r vps-worker/bkav-proxy root@103.149.170.47:/opt/bkav-proxy
```

(Hoặc nếu đã đồng bộ code qua GitHub như quy trình thường lệ, thư mục này
đã có sẵn tại `/root/bunbohue65-ship/vps-worker/bkav-proxy` — copy sang
`/opt/bkav-proxy` để tách biệt hẳn khỏi thư mục source code chính, đúng quy
ước 1 service hệ thống = 1 thư mục riêng dưới `/opt`.)

```bash
cp -r /root/bunbohue65-ship/vps-worker/bkav-proxy /opt/bkav-proxy
```

## Bước 2 — Tạo systemd service

```bash
cat > /etc/systemd/system/bkav-proxy.service << 'EOF'
[Unit]
Description=Bkav Decrypt Proxy
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/bkav-proxy
ExecStart=/usr/bin/node /opt/bkav-proxy/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bkav-proxy
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable bkav-proxy
systemctl restart bkav-proxy
sleep 2
systemctl is-active bkav-proxy
```

Kiểm tra chạy đúng nội bộ:
```bash
curl http://127.0.0.1:3000/bkav-health
# Kỳ vọng: bkav-proxy OK
```

## Bước 3 — Thêm route vào Nginx (KHÔNG tạo server block mới)

Domain `proxy.bunbohue65.com` đã có sẵn 1 server block (đang route API
chính vào `vps-worker`, cổng 3001). Chỉ cần **thêm 3 khối `location` mới**
vào ĐÚNG server block `listen 443 ssl` hiện có của domain đó (không tạo
file cấu hình mới, không tạo server block `listen 443` thứ 2 — 1 domain chỉ
nên có 1 server block SSL để tránh xung đột).

Mở file cấu hình Nginx hiện tại của domain này (thường ở
`/etc/nginx/sites-available/` — tên file tuỳ theo cách bạn đã đặt lúc cấu
hình domain, ví dụ `proxy.bunbohue65.com` hoặc `bunbohue65-vps`):

```bash
nano /etc/nginx/sites-available/<tên-file-hiện-có>
```

Thêm 3 khối sau vào **bên trong** khối `server { listen 443 ssl; ... }`
hiện có (đặt ngay trước dấu `}` đóng cuối cùng của server block đó):

```nginx
    location /bkav-prod {
        proxy_pass          http://127.0.0.1:3000;
        proxy_http_version  1.1;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_pass_request_headers on;
        proxy_pass_header   X-BKAV-KEY;
        proxy_connect_timeout 30s;
        proxy_read_timeout    90s;
        proxy_send_timeout    30s;
    }

    location /bkav-demo {
        proxy_pass          http://127.0.0.1:3000;
        proxy_http_version  1.1;
        proxy_set_header    Host              $host;
        proxy_set_header    X-Real-IP         $remote_addr;
        proxy_set_header    X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_pass_request_headers on;
        proxy_pass_header   X-BKAV-KEY;
        proxy_connect_timeout 30s;
        proxy_read_timeout    90s;
        proxy_send_timeout    30s;
    }

    location /bkav-health {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_read_timeout 5s;
    }
```

Kiểm tra cú pháp rồi reload (KHÔNG restart — reload không làm rớt kết nối
đang chạy của API chính):

```bash
nginx -t
systemctl reload nginx
```

## Bước 4 — Kiểm tra từ ngoài

```bash
curl https://proxy.bunbohue65.com/bkav-health
# Kỳ vọng: bkav-proxy OK
```

Nếu ra đúng, proxy đã sẵn sàng — `vps-worker` (đã sửa ở patch đi kèm) sẽ tự
gọi vào `https://proxy.bunbohue65.com/bkav-prod` / `/bkav-demo`.

## Xem log khi cần debug

```bash
journalctl -u bkav-proxy -f
```

## Lưu ý

- Port 3000 chỉ lắng nghe `127.0.0.1` (không mở ra ngoài) — an toàn, chỉ
  Nginx trên cùng máy gọi vào được.
- Proxy **không lưu bất kỳ thông tin nhạy cảm nào** (không lưu
  `PARTNER_GUID`/`PARTNER_TOKEN`) — chỉ nhận khoá giải mã qua header
  `X-BKAV-KEY` của từng request, dùng xong không giữ lại.
