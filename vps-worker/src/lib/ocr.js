// lib/ocr.js — đọc chữ trong ảnh (OCR truyền thống, Tesseract) để xác
// nhận thanh toán thủ công khi Tingee webhook không hoạt động (Giai đoạn
// "xác nhận thủ công bằng ảnh").
//
// QUAN TRỌNG: tesseract.js MẶC ĐỊNH tự tải file "trained data" (mô hình
// nhận diện chữ) từ CDN ngoài (cdn.jsdelivr.net) MỖI LẦN KHỞI TẠO worker
// — nếu VPS bị chặn/không truy cập được domain đó (đã xác nhận GẶP LỖI
// 403 khi test), toàn bộ tính năng OCR sẽ THẤT BẠI. Dùng gói npm riêng
// @tesseract.js-data/eng (cài kèm package.json, KHÔNG CẦN MẠNG NGOÀI lúc
// chạy — chỉ cần mạng lúc `npm install` như mọi dependency khác) + chỉ
// định rõ langPath/cachePath trỏ tới thư mục gói này — hoàn toàn không
// phụ thuộc CDN khi vận hành thực tế.

const path = require('path');
const Tesseract = require('tesseract.js');

const LANG_PATH = path.join(
  __dirname, '..', '..', 'node_modules', '@tesseract.js-data', 'eng', '4.0.0_best_int',
);

let workerPromise = null;

// Dùng CHUNG 1 worker (khởi tạo 1 lần, tái sử dụng) — tesseract worker
// xử lý TUẦN TỰ (không đồng thời), nhưng tính năng này chỉ dùng khi nhân
// viên xác nhận thủ công (tần suất thấp, không phải luồng chính), nên
// không cần hàng đợi phức tạp — request thứ 2 tới trong lúc request 1
// đang xử lý sẽ tự đợi (Promise) tới lượt, không lỗi, chỉ chậm hơn chút.
async function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng', 1, {
      langPath: LANG_PATH,
      cachePath: LANG_PATH,
      gzip: true,
    });
  }
  return workerPromise;
}

// Đọc toàn bộ chữ trong ảnh (buffer) — trả về chuỗi text thô, không cấu
// trúc (không phân biệt "đây là số tiền, đây là tên"). Việc tìm giá trị
// cụ thể (số tiền, mã tài khoản) do bên gọi tự tìm trong chuỗi trả về
// (xem routes/manual-payment-photo.js) — cách này AN TOÀN với MỌI bố cục
// ngân hàng khác nhau, vì không cần biết trước "trường nào nằm ở đâu".
async function extractTextFromImage(buffer) {
  const worker = await getWorker();
  const { data: { text } } = await worker.recognize(buffer);
  return text;
}

module.exports = { extractTextFromImage };
