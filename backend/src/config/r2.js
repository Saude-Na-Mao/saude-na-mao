// Armazenamento de arquivos no Cloudflare R2 (S3-compatível).
// Usado para persistir receitas/comprovantes — o disco do Render é efêmero.
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");

function isR2Enabled() {
  return Boolean(
    R2_ACCESS_KEY_ID &&
      R2_SECRET_ACCESS_KEY &&
      R2_BUCKET &&
      R2_ENDPOINT &&
      R2_PUBLIC_URL,
  );
}

let client = null;
function getClient() {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return client;
}

function publicUrl(key) {
  return `${R2_PUBLIC_URL}/${String(key).replace(/^\/+/, "")}`;
}

/** Envia um arquivo local para o R2 e devolve a URL pública. */
async function uploadFileToR2(localPath, key, contentType) {
  const Body = fs.readFileSync(localPath);
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return publicUrl(key);
}

/** Envia um buffer para o R2 e devolve a URL pública. */
async function uploadBufferToR2(buffer, key, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return publicUrl(key);
}

module.exports = {
  isR2Enabled,
  uploadFileToR2,
  uploadBufferToR2,
  publicUrl,
  _basename: path.basename,
};
