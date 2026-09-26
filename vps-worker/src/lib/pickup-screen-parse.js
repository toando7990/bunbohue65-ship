// ============================================================
// lib/pickup-screen-parse.js — lọc MÃ ĐƠN + MÃ NHẬN HÀNG từ chữ đọc được
// (OCR) trên ảnh chụp màn hình app tài xế Lalamove
// ============================================================
// Ghi chú gửi Lalamove do CHÍNH app mình viết (routes/create.js):
//   MÃ NHẬN HÀNG: AB23CD
//   Đơn ORD-1727331200123-a1b2c3d4
//   QR nhận hàng (bấm link): https://…/q/ORD-…
// nên biết trước mẫu chữ cần tìm. OCR (Tesseract 'eng') làm MẤT DẤU tiếng
// Việt và hay đọc nhầm O↔0, I/l↔1 — chuẩn hoá trước khi so.
//
// Hàm chỉ trả về ỨNG VIÊN; việc xác nhận thật (đơn có tồn tại, đúng nhà
// hàng, chưa thanh toán, mã khớp) do routes/driver-pickup-lookup.js đối
// chiếu với cơ sở dữ liệu — đọc sai chỉ dẫn tới "không tìm thấy", không
// bao giờ mở nhầm đơn.
// ============================================================

const { ALPHABET, CODE_LENGTH } = require('./pickup-code');

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function isValidPickupCode(code) {
  return (
    typeof code === 'string' &&
    code.length === CODE_LENGTH &&
    [...code].every((ch) => ALPHABET.includes(ch))
  );
}

// OCR hay đọc nhầm các ký tự trông giống nhau (đã gặp khi thử thật:
// "Q2WE8R" đọc thành "Q2WESR"). Mã nhận hàng không dùng 0/O/1/I (xem
// lib/pickup-code.js) nên các ký tự đó chắc chắn là đọc nhầm.
const CONFUSABLE = {
  S: ['8', '5'], 8: ['S', 'B'], 5: ['S'], B: ['8'],
  Z: ['2'], 2: ['Z'], G: ['6'], 6: ['G'],
  O: ['Q', 'D'], 0: ['Q', 'D'], Q: ['D'], D: ['Q'],
  I: ['L', 'J', 'T', '7'], 1: ['L', 'J', 'T', '7'],
};

// Các biến thể của 1 mã đọc được: thay tối đa 2 ký tự dễ nhầm. Chỉ giữ
// biến thể hợp lệ (đúng bảng ký tự) — CSDL sẽ quyết định cái nào có thật.
function codeVariants(raw) {
  const out = new Set();
  const chars = [...raw];
  const visit = (i, cur, changes) => {
    if (i === chars.length) {
      const c = cur.join('');
      if (isValidPickupCode(c)) out.add(c);
      return;
    }
    visit(i + 1, [...cur, chars[i]], changes);
    if (changes < 2) {
      for (const alt of CONFUSABLE[chars[i]] || []) visit(i + 1, [...cur, alt], changes + 1);
    }
  };
  visit(0, [], 0);
  // Bản đọc nguyên văn (nếu hợp lệ) đứng đầu.
  const exact = raw;
  return [...(out.has(exact) ? [exact] : []), ...[...out].filter((c) => c !== exact)];
}

function extractPickupCodes(upperText) {
  const codes = [];
  const add = (c) => {
    if (isValidPickupCode(c) && !codes.includes(c)) codes.push(c);
  };
  // 1) Có nhãn "MA NHAN HANG" ngay trước (ưu tiên nhất) — kèm biến thể.
  const labelRe = /MA\s*NHAN\s*HANG[^A-Z0-9]{0,8}([A-Z0-9]{6})(?![A-Z0-9])/g;
  let m;
  while ((m = labelRe.exec(upperText)) !== null) {
    for (const v of codeVariants(m[1])) add(v);
  }
  // 2) Mọi cụm đúng 6 ký tự đứng riêng (dự phòng khi OCR đọc sai nhãn).
  const tokenRe = /(?<![A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])/g;
  while ((m = tokenRe.exec(upperText)) !== null) add(m[1]);
  return codes;
}

// Mã đơn: ORD-<13 chữ số thời gian>-<8 ký tự hex> (routes/create.js).
// Phần hex hay bị đọc sai khi ảnh mờ (thử thật: "a1b2c3d4" → "a102¢3d4"),
// còn dãy số thời gian thường đọc đúng và gần như duy nhất — nên trả thêm
// orderPrefixes ("ORD-<số>-") để tìm theo tiền tố khi mã đầy đủ không khớp.
function fixDigits(s) {
  return s.replace(/O/g, '0').replace(/[IL]/g, '1');
}

function extractOrderIds(upperText) {
  const ids = [];
  const prefixes = [];
  const re = /ORD\s*[-–—_]\s*([0-9OIL]{12,14})(?:\s*[-–—_]\s*([0-9A-FOIL]{8})(?![0-9A-Z]))?/g;
  let m;
  while ((m = re.exec(upperText)) !== null) {
    const digits = fixDigits(m[1]);
    const prefix = `ORD-${digits}-`;
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
    if (m[2]) {
      const id = `${prefix}${fixDigits(m[2]).toLowerCase()}`;
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return { ids, prefixes };
}

function parsePickupScreenText(rawText) {
  const upper = stripDiacritics(rawText).toUpperCase();
  const { ids, prefixes } = extractOrderIds(upper);
  return {
    orderIds: ids,
    orderPrefixes: prefixes,
    pickupCodes: extractPickupCodes(upper),
  };
}

module.exports = { parsePickupScreenText, isValidPickupCode, codeVariants };
