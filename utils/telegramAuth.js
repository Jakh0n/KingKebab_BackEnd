const crypto = require("crypto");

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

/**
 * Validates Telegram Mini App initData and returns the parsed user.
 * @param {string} initData
 * @param {string} botToken
 * @returns {{ id: number, first_name?: string, last_name?: string, username?: string, language_code?: string } | null}
 */
function validateTelegramWebAppData(initData, botToken) {
  if (!initData || typeof initData !== "string" || !botToken) {
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const calculatedBuffer = Buffer.from(calculatedHash, "hex");

  if (
    hashBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(hashBuffer, calculatedBuffer)
  ) {
    return null;
  }

  const authDate = parseInt(params.get("auth_date") || "0", 10);
  if (
    !authDate ||
    Math.floor(Date.now() / 1000) - authDate > MAX_AUTH_AGE_SECONDS
  ) {
    return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw);
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
}

module.exports = {
  validateTelegramWebAppData,
  MAX_AUTH_AGE_SECONDS,
};
