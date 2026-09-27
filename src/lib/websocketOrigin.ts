/** 明示許可の既定値。ローカル開発用の許可はポートと独立して判定する。 */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://youdays.github.io",
];

/**
 * 環境変数を使うと、フォークしたGitHub Pagesなどの公開元も明示して許可できる。
 * 未指定時は誤って任意のWebサイトを許可しないよう、既定値だけを使う。
 */
export const getAllowedOrigins = (
  allowedOrigins = process.env["ALLOWED_ORIGINS"]
): ReadonlySet<string> => {
  const configuredOrigins = allowedOrigins
    ?.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set(
    configuredOrigins && configuredOrigins.length > 0
      ? configuredOrigins
      : DEFAULT_ALLOWED_ORIGINS
  );
};

/** Originヘッダーのない接続も拒否し、ブラウザー経由の許可元を厳密に確認する。 */
export const isAllowedOrigin = (
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>
): boolean => {
  if (origin === undefined) return false;
  if (allowedOrigins.has(origin)) return true;

  try {
    const url = new URL(origin);
    // URLの正規化で別表記のIPやパス付きURLまで許可しないよう、Originの形も確認する。
    return (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:[0-9]+)?$/.test(origin)
    );
  } catch {
    return false;
  }
};
