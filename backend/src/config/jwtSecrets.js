/**
 * JWT usado na emissão (authService) e na verificação (middlewares) deve usar o mesmo segredo.
 * Em desenvolvimento, permite arrancar sem .env com valores apenas locais.
 */
function getJwtSecrets() {
  const isProd = process.env.NODE_ENV === "production";
  const JWT_SECRET =
    process.env.JWT_SECRET ||
    (!isProd ? "local-dev-ssm-jwt-secret-não-use-em-produção" : undefined);
  const JWT_REFRESH_SECRET =
    process.env.JWT_REFRESH_SECRET ||
    (!isProd ? "local-dev-ssm-refresh-secret-não-use-em-produção" : undefined);

  if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
    const err = new Error("Defina JWT_SECRET e JWT_REFRESH_SECRET no ambiente");
    err.statusCode = 500;
    throw err;
  }

  return { JWT_SECRET, JWT_REFRESH_SECRET };
}

module.exports = { getJwtSecrets };
