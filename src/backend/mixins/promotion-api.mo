// Public API surface cho hệ thống khuyến mại (KM) — Giai đoạn 1: chỉ có
// đếm/kiểm tra lượt dùng KM trong ngày. Chương trình KM thật (cấu hình Hệ 1
// khung giờ, Hệ 2 tích luỹ chi tiêu) là Giai đoạn 2/3 — sẽ thêm mixin riêng
// khi có, không sửa file này.
//
// tryConsumeKmSlot: HMAC-verified (giống pattern updateStatus/updatePaymentStatus
// ở hmac-api.mo) — chỉ VPS (biết vpsSecret) gọi được, vì đây là ghi dữ liệu
// ảnh hưởng tới việc khách có được áp KM hay không (không phải hành động
// công khai ai cũng gọi được).
//
// getKmUsageCount: query, KHÔNG cần HMAC — chỉ đọc, không có tác dụng phụ,
// dùng để hiển thị "còn N lượt KM hôm nay" phía frontend nếu Giai đoạn 2/3
// cần.

import Result "mo:core/Result";
import Time "mo:core/Time";
import Nat "mo:core/Nat";

import Types "../types/hmac";
import SecretTypes "../types/secret";
import PromotionTypes "../types/promotion";
import HmacLib "../lib/hmac";
import PromotionLib "../lib/promotion";

mixin (
  kmUsage : PromotionTypes.KmUsageStore,
  secretState : SecretTypes.SecretState,
) {
  // Kiểm tra + tăng bộ đếm lượt dùng KM hôm nay của (email, chương trình)
  // TRONG 1 THAO TÁC — nếu đã đạt dailyLimit thì #err, không tăng. HMAC
  // payload: "email|programCode|dailyLimit" (lowercase email, đúng chuẩn
  // usageKey() nội bộ tự lowercase riêng, payload HMAC giữ nguyên case
  // caller gửi lên để VPS tính toán nhất quán ở phía nó).
  public shared func tryConsumeKmSlot(
    email : Text,
    programCode : Text,
    dailyLimit : Nat,
    hmac : Types.Hmac,
  ) : async Result.Result<Nat, Text> {
    let payload = email # "|" # programCode # "|" # Nat.toText(dailyLimit);
    if (not HmacLib.verifyHmac(secretState.vpsSecret, secretState.vpsSecretPrevious, payload, hmac)) {
      return #err("Invalid HMAC");
    };
    PromotionLib.tryConsumeSlot(kmUsage, email, programCode, dailyLimit, Time.now());
  };

  // Đọc số lượt đã dùng hôm nay — không sửa gì, không cần HMAC.
  public query func getKmUsageCount(email : Text, programCode : Text) : async Nat {
    PromotionLib.getUsageCount(kmUsage, email, programCode, Time.now());
  };
};
