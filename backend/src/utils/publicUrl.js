const PUBLIC_BASE_URL = (
  process.env.PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  ""
).replace(/\/$/, "");

function buildPublicImageUrl(urlArquivo) {
  if (!urlArquivo) return null;

  let pathPart = String(urlArquivo)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  if (pathPart.startsWith("http://") || pathPart.startsWith("https://")) {
    return pathPart;
  }

  return `${PUBLIC_BASE_URL}/${pathPart}`;
}

module.exports = { buildPublicImageUrl, PUBLIC_BASE_URL };
