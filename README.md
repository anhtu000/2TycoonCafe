# 2TycoonCafe – Tiny Tails Cafe Tycoon

Game #2: tycoon 2D, quán cozy 3 tầng do thú vận hành (CLAUDE.md mục 5, 5a). Đường phát hành: thử Poki trước. Phaser 4 + TypeScript, dựng bằng Vite.

## Code của game (`src/`)

| Chỗ | Việc |
| --- | --- |
| `src/content/*.json` | Mọi con số: tầng, món, mốc cấp, giới hạn cấp trước Dessert Bar, khách, thú (Snow Fox chỉ có từ quà ngày 7), nâng cấp (Night Shift mở sau 5 sao), quà 7 ngày, món của ngày, quảng cáo (`cafe.json`, `staff.json`, `upgrades.json`, `decor.json`); chuỗi nhiệm vụ ngắn và nhiệm vụ ngày sau 5 sao (`tasks.json`: `tasks` mỗi lúc một nhiệm vụ, `orders` 3 nhiệm vụ mỗi ngày, thưởng theo giây thu nhập) |
| `src/logic/cafe.ts` | Toàn bộ kinh tế một lượt chơi, không dùng Phaser. Màn chơi và bộ mô phỏng cùng chạy class `Cafe` |
| `src/logic/daily.ts` | Luật chuỗi quà 7 ngày của game này: bỏ lỡ ngày thì chuỗi dừng chờ, không về ngày 1 (bộ khung `core/` giữ luật về ngày 1 cho game #1) |
| `src/logic/cafe.test.ts`, `daily.test.ts` | Test logic (chạy bằng `npm test`) |
| `src/render/` | Vẽ thú, món, máy, phòng, đồ trang trí bằng Canvas 2D rồi lưu thành texture |
| `src/ui/Floor.ts` | Một tầng quán: vẽ theo trạng thái mỗi khung hình |
| `src/ui/ShopList.ts` | Dải nâng cấp (dọc trên máy tính, ngang trên điện thoại) |
| `src/ui/panels.ts` | Bảng nhận nuôi, Staff, menu, Decor, kỷ lục, về đích |
| `src/scenes/PlayScene.ts`, `HomeScene.ts` | Màn chơi và màn menu cho người đã có save |
| `src/i18n/*.json` | Chữ trong game, 6 ngôn ngữ: en, fr, it, de, es, tr (kể cả chữ của `core/` mà `core/` chưa dịch). Trên Poki ngôn ngữ lấy từ `PokiSDK.getLanguage()` (`src/main.ts`); người chơi đổi trong menu. `src/i18n/i18n.test.ts` kiểm đủ khoá và đúng `{biến}`. Bản dịch do Claude làm, cần người bản ngữ đọc lại |
| `src/game/music.ts` | Nhạc nền: tải sau khi vào quán, lặp liền, theo nút tắt tiếng |
| `src/game/page.ts` | Chặn phím cuộn trang portal ngay từ lúc tải: mũi tên, Space, PageUp/PageDown, **Home, End** và con lăn. `core/` chỉ chặn sau khi game chạy và chưa chặn Home/End; sửa ở đây để không đụng game #1 |
| `src/game/measure.ts` | Sự kiện phễu cho Poki (`PokiSDK.measure`, chỉ bản Poki): từng bước hướng dẫn, sao, nhiệm vụ, mở tầng và món, thú mới, quà ngày, đơn hàng ngày, trang trí, lượt tính giờ, đổi ngôn ngữ |
| `src/ui/notice.ts` | Thông báo cuối màn hình theo hàng đợi, không bao giờ đè lên nhau (thay `toast` của `core/` trong code game; cùng hình dáng) |
| `index.html` | Màn tải trước khi code game tải xong: tên game, cốc cà phê, thanh chạy (viết thẳng trong file, không tải thêm) |
| `store/poki_listing.md` | Nội dung trang game trên Poki: tên, thể loại, mô tả, điểm khác biệt, điều khiển, lộ trình cập nhật |
| `src/game/presets.ts` | Trạng thái dựng sẵn để thử (chỉ bản web): `#staff`, `#dessert`, `#finish`, `#daily` (đã 5 sao: nhiệm vụ ngày, món của ngày, Night Shift), `#giftrare`, `#giftfox` (quà ngày 3, ngày 7), `#giftpause` (nhận ngày 5 cách đây 3 ngày: hôm nay là ngày 6); `#reset` xoá save thử |
| `tools/make_sfx.py`, `tools/make_music.py` | Tạo tiếng hiệu ứng và nhạc nền (vòng lặp liền, `music.ogg` cho Chrome/Firefox/Android, `music.mp3` cho Safari) bằng code: `python3 tools/make_music.py public/audio` (cần numpy, scipy, ffmpeg) |
| `tools/sim/` | Mô phỏng kinh tế: `npm run sim` (200 lượt mỗi kiểu người chơi), `npm run sim:quick -- 1000 active none` (một lượt chi tiết theo phút), `npm run sim:pacing` (nhịp theo phút: số lần chạm, đưa món, mua, nhiệm vụ, thứ mới, thời gian không có việc; 3 kiểu người chơi × không quảng cáo / Poki / xem mọi quảng cáo; thêm `--json out.json` để xuất số liệu), `npm run sim:daily` (7 ngày sau 5 sao: mỗi ngày vắng 20 giờ rồi chơi 12 phút; nhiệm vụ ngày xong lúc nào, thu nhập khi vắng, quà 7 ngày; `--session 12 --away 20`) |

## Cài đặt

1. Cài Node.js 22 LTS (https://nodejs.org). Kiểm tra bằng `node -v`, cần 22.12 trở lên.
2. Trong thư mục repo chạy `npm install`.

## Lệnh

| Lệnh | Việc |
| --- | --- |
| `npm run dev` | Chạy thử, không có SDK portal. Mở link `Local` trên máy tính |
| `npm run dev:cg` | Chạy thử với SDK CrazyGames v3 ở chế độ local (quảng cáo hiện dòng chữ thay cho quảng cáo thật) |
| `npm run build` | Build cho CrazyGames vào `dist/crazygames`, rồi kiểm tra kích thước và request ra ngoài |
| `npm run build:poki` | Build cho Poki vào `dist/poki` (nạp Poki SDK v2 trong `<head>`); báo `FAIL` nếu tổng trên 8 MB |
| `npm run dev:poki` | Chạy thử với Poki SDK (thử quảng cáo bằng Poki Inspector) |
| `npm run build:single` | Gói bản web thành một file HTML (`dist/single/`) để mở trên điện thoại hoặc đăng artifact |
| `npm run sim` | Mô phỏng kinh tế (CLAUDE.md mục 5a) |
| `npm run sim:pacing` | Nhịp chơi theo phút và khoảng trống dài nhất (CLAUDE.md mục 5a) |
| `npm run sim:daily` | Các ngày sau 5 sao: nhiệm vụ ngày, món của ngày, quà 7 ngày, Night Shift (CLAUDE.md mục 5a) |
| `npm run build:web` | Build không có SDK vào `dist/web` (để đăng artifact, chạy thử trên điện thoại) |
| `npm run preview` | Phục vụ bản build CrazyGames để thử |
| `npm test` | Test các hàm định dạng số, thời gian, quà hằng ngày |
| `npm run typecheck` | Kiểm tra lỗi TypeScript |
| `npm run sync-core` | Chép bộ khung sang repo game kia (xem mục Bộ khung dùng chung) |

Nộp lên CrazyGames: tải lên nội dung của `dist/crazygames`, với `index.html` nằm ở gốc. Cách tải lên cụ thể (zip hay thư mục) kiểm tra lại trên trang developer lúc nộp.

## Chạy thử trên điện thoại

- Cách nhanh: máy tính và điện thoại cùng Wi-Fi, chạy `npm run dev`, mở link `Network` (dạng `http://192.168.x.x:5173`) trên điện thoại. Windows có thể hỏi cho phép Node qua tường lửa, chọn mạng Private.
- Không cùng mạng: build `npm run build:web` rồi đăng `dist/web` thành artifact riêng tư.

Tham số URL để thử (thêm vào cuối link, ví dụ `?debug&fps=144`):

| Tham số | Tác dụng |
| --- | --- |
| `?debug` | Bảng thông số ở góc dưới: fps, kích thước, độ phân giải, trạng thái tạm dừng, kết quả quảng cáo, dung lượng save. Không sửa được URL (ví dụ trong artifact) thì chạm 5 lần liên tiếp vào tên game ở menu |
| `?fps=144` | Giả lập màn hình 144 Hz để kiểm tra tốc độ không phụ thuộc fps (cũng thử `30`) |
| `?ads=fail` | Quảng cáo luôn báo không có quảng cáo |
| `?ads=none` | Không có SDK quảng cáo, nút quảng cáo tự ẩn |
| `?ads=basic` | Giả lập Basic Launch của CrazyGames: quảng cáo tắt, nút thưởng vẫn cho thưởng |
| `?muteAudio=true` | Portal ép tắt tiếng, nút âm thanh bị khoá |
| `?lang=de` | Ép ngôn ngữ (en, fr, it, de, es, tr) |

## Cấu trúc

```
core/        Bộ khung chung. Giống hệt nhau ở 2 repo
  app.ts       Khởi động game, các dịch vụ dùng chung (app.audio, app.save, app.ads, app.t ...)
  viewport.ts  Co giãn 16:9 và màn dọc, nét ở mọi devicePixelRatio
  platform/    Adapter portal: crazygames.ts (SDK v3), poki.ts (SDK v2), local.ts (chạy thử, giả lập quảng cáo)
  ads.ts       Quảng cáo có thưởng và quảng cáo giữa chừng, tạm dừng và tắt tiếng khi chạy
  save.ts      Lưu tiến trình, tự lưu, đổi phiên bản dữ liệu
  i18n.ts      Chuỗi chữ theo ngôn ngữ, tự nhận ngôn ngữ (RU/BE/KK/UK/UZ dùng tiếng Nga)
  audio.ts     Âm thanh, tắt/bật, tôn trọng lệnh tắt tiếng của portal
  pause.ts     Tạm dừng khi chuyển tab hoặc khi có quảng cáo
  fx.ts        Số bay lên, nảy, hạt, rung
  format.ts    Số dạng K/M/B/T, thời lượng, đồng hồ
  time.ts      Thu nhập khi vắng mặt, quà hằng ngày, bước cố định cho kinh tế
  scenes/      Màn loading, menu, tạm dừng, lớp BaseScene
  ui/          Nút, nút quảng cáo có thưởng, nút âm thanh, thông báo ngắn, icon, hình vẽ sẵn thành texture (shapes.ts)
src/         Code riêng của game này
  game.json    id, tên, màu nền. Không đổi id sau khi phát hành, nếu không save cũ sẽ mất
  main.ts      Cấu hình game: scene, ngôn ngữ, asset, theme
  save.ts      Kiểu dữ liệu lưu
  scenes/      Các màn chơi
  i18n/        File ngôn ngữ (en.json bắt buộc)
public/      Asset (âm thanh, hình). Đóng gói sẵn trong build
scripts/     Kiểm tra build, đồng bộ bộ khung
tests/       Test cho các hàm thuần
tools/       Công cụ tạo asset (âm thanh demo)
```

## Viết một màn chơi

```ts
export class PlayScene extends BaseScene {
  constructor() {
    super('Play', { gameplay: true }); // gameplay: true gửi gameplayStart/Stop cho portal
  }
  protected build() {
    // tạo đối tượng một lần
  }
  protected layout(vp: ViewportInfo) {
    // đặt vị trí theo màn hình hiện tại; chạy lại mỗi lần xoay hoặc đổi kích thước
  }
  update(_time: number, delta: number) {
    // mọi chuyển động nhân với delta (ms), không tính theo số khung hình
  }
}
```

Hệ toạ độ: đơn vị thiết kế. Vùng an toàn luôn là 1280×720 (màn ngang) hoặc 720×1280 (màn dọc), nằm giữa màn hình và luôn hiện đủ. Cạnh dài hơn được thêm chỗ. Đặt UI quan trọng trong `vp.safe`, trải nền ra `vp.width` × `vp.height`. Nút tối thiểu cao 88 đơn vị, chữ tối thiểu 28 để còn đọc được khi khung game nhỏ trên máy tính.

Các dịch vụ dùng qua `app`:

- `app.t('key', { n: 5 })` lấy chuỗi theo ngôn ngữ.
- `app.audio.play('coin', { pitchJitter: 100 })` phát âm thanh.
- `save.data.coins += 10` sửa dữ liệu, bộ khung tự lưu mỗi 5 giây, khi chuyển tab và khi đóng trang.
- `rewardButton(scene, x, y, { label, onReward })` nút xem quảng cáo có thưởng. Thưởng chỉ được trao khi xem xong.
- `app.ads.midgame()` quảng cáo giữa chừng, chỉ gọi ở điểm nghỉ (bộ khung đã gọi khi quay về menu).
- `app.openPause(scene)`, `app.toMenu()` mở màn tạm dừng, về menu.
- `app.platform.happyTime()` khi người chơi đạt thành tích lớn, dùng ít.
- `setShape(image, key, w, h, (g) => ...)`, `shapeImage(...)` vẽ hình tĩnh (nút, thẻ, khung) một lần thành texture rồi hiện bằng Image. Đừng để Graphics tĩnh trên màn hình: Phaser dựng lại Graphics mỗi khung, trên điện thoại tầm trung chỉ còn khoảng 20 fps (đo 12/10).
- Trên điện thoại, `core/quality.ts` tự hạ độ phân giải canvas khi khung hình chậm hơn khoảng 50 fps, và màn 120 Hz được vẽ ở 60 khung/giây. Hộp debug (`?debug`): chạm vào để tự hạ mức, dòng `render` và `gpu` cho biết mức đang dùng và chip đồ hoạ. `?fixedres` tắt bộ tự hạ.

## Bộ khung dùng chung

Hai game ở 2 repo riêng, mỗi repo có một bản `core/`. Quy ước: chỉ sửa `core/` ở repo Game1_Clicker, rồi chạy `npm run sync-core` trong Game1 để chép sang `../Game2_Tycoon_cafe`. Lệnh này chép `core/`, `scripts/`, `tests/`, `tsconfig.json`, `vite.config.ts` và không đụng vào `src/`.

## Trước khi nộp

- `npm run build` không được có dòng `FAIL`. Lệnh này báo `FAIL` khi quá 1.500 file, quá 250 MB, hoặc tên file có dấu cách hay ký tự ngoài ASCII. Nó báo `WARN` khi tổng trên 8 MB hoặc trong code có tên miền lạ (cần xem có request ra ngoài không).
- Đối chiếu mục 4 và mục 6 trong `CLAUDE.md` của project.
- Ghi nguồn mọi asset mới vào `ASSETS.md`.
