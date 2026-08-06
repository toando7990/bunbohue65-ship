// Runtime environment loader.
//
// env.json is copied verbatim into dist/ at build time (see package.json
// `copy:env`). At app boot we fetch it from the deployed origin so the same
// bundle can run against different environments without rebuilding. The loader
// MUST resolve before React renders — see main.tsx.
//
// Five keys are required. If any is missing, empty, or the literal string
// "undefined" (the placeholder written into env.json before deployment), the
// loader throws and the app refuses to boot with a clear message instead of
// silently calling the backend with garbage.

export interface EnvConfig {
  backend_host: string;
  backend_canister_id: string;
  project_id: string;
  ii_derivation_origin: string;
  storage_gateway_url: string;
}

const REQUIRED_KEYS = [
  "backend_host",
  "backend_canister_id",
  "project_id",
  "ii_derivation_origin",
  "storage_gateway_url",
] as const satisfies ReadonlyArray<keyof EnvConfig>;

// A value is invalid if it is not a string, empty after trim, or the literal
// "undefined" placeholder that the build pipeline writes before real values
// are injected at deploy time.
function isInvalidValue(value: unknown): boolean {
  return (
    typeof value !== "string" ||
    value.trim() === "" ||
    value.trim() === "undefined"
  );
}

// Validate a raw parsed object against the required-key contract. Returns the
// list of offending keys so the caller can surface them in the error message.
function findInvalidKeys(raw: unknown): string[] {
  if (typeof raw !== "object" || raw === null) {
    return [...REQUIRED_KEYS];
  }
  const record = raw as Record<string, unknown>;
  const invalid: string[] = [];
  for (const key of REQUIRED_KEYS) {
    if (!(key in record) || isInvalidValue(record[key])) {
      invalid.push(key);
    }
  }
  return invalid;
}

let cachedConfig: EnvConfig | null = null;

// Fetch and validate /env.json. Resolves to a typed config object. Throws an
// Error with a human-readable message if the file cannot be loaded or any
// required key is missing/empty/"undefined". Safe to call multiple times —
// the first successful result is cached for the lifetime of the page.
export async function loadEnv(): Promise<EnvConfig> {
  if (cachedConfig) return cachedConfig;

  let response: Response;
  try {
    response = await fetch("/env.json", { cache: "no-store" });
  } catch {
    throw new Error(
      "Không thể tải cấu hình môi trường (env.json). Vui lòng kiểm tra kết nối mạng và tải lại trang.",
    );
  }

  if (!response.ok) {
    throw new Error(
      `Không tìm thấy tệp cấu hình env.json (HTTP ${response.status}). Vui lòng liên hệ quản trị viên.`,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(
      "Tệp env.json không hợp lệ (lỗi định dạng JSON). Vui lòng liên hệ quản trị viên.",
    );
  }

  const invalid = findInvalidKeys(raw);
  if (invalid.length > 0) {
    throw new Error(
      `Cấu hình môi trường chưa được thiết lập đầy đủ. Các khoá còn thiếu hoặc không hợp lệ: ${invalid.join(", ")}. Vui lòng liên hệ quản trị viên để cấu hình trước khi sử dụng ứng dụng.`,
    );
  }

  const record = raw as Record<string, string>;
  cachedConfig = {
    backend_host: record.backend_host.trim(),
    backend_canister_id: record.backend_canister_id.trim(),
    project_id: record.project_id.trim(),
    ii_derivation_origin: record.ii_derivation_origin.trim(),
    storage_gateway_url: record.storage_gateway_url.trim(),
  };

  return cachedConfig;
}

// Synchronous accessor for the already-loaded config. Returns null if
// loadEnv() has not yet resolved. Components should prefer awaiting loadEnv()
// at boot; this accessor is a convenience for code paths that run only after
// the app has booted (and can reasonably throw on null).
export function getEnv(): EnvConfig | null {
  return cachedConfig;
}
