# Bộ kiểm tra trước khi nộp Poki (công cụ của Claude, chạy trong máy ảo cloud)

Viết ngày 22/10 cho lượt test toàn bộ game #2, lưu vào repo ngày 26/10. Cần Python + Playwright (Chromium) và Node.
Một số đường dẫn trỏ tới máy ảo của Claude (`/home/claude/tools/build.mjs`, `/opt/npm-tools`, `/home/claude/nm`);
trên máy khác cần sửa lại.

| File | Việc |
| --- | --- |
| `serve.py` | Server tĩnh có gzip (giống CDN của Poki) và trang `host.html` cao 4000 px chứa game trong iframe |
| `check.py` | Chặn cuộn trang (có SDK và SDK bị chặn), ESC, thời gian tải ở 4 mức mạng |
| `build_test.mjs` | Bản build Poki có bật hook `window.__play` cho bot (chỉ để test, không phát hành) |
| `sdkstub.js` | Poki SDK giả: ghi mọi sự kiện, báo lỗi start/start, stop/stop, sự kiện trong lúc quảng cáo |
| `bot.js`, `runbot.py` | Bot chơi trên bản test, đồng hồ game nhanh K lần, ghi heap/texture mỗi 15 giây |
| `short.sh` | 6 lượt bot ngắn: chặn quảng cáo, ẩn danh, quảng cáo không có, nhận x2, tiếng Đức, màn ngang |
| `shots.py`, `gifts.py`, `notice_test.py`, `daily_x2.py` | Ảnh chụp các cỡ màn và 6 ngôn ngữ, quà ngày, hàng đợi thông báo, nút Claim x2 |
| `pack.py` | Đóng gói zip cho Poki (file 0644, thư mục 0755) |
| `ablate.ts` | Tắt từng cơ chế v2 để xem mỗi cái làm nhanh lượt chơi bao nhiêu |
