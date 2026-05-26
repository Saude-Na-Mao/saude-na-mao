const multer = require("multer");
const fs = require("fs");
const path = require("path");

const PRODUTOS_DIR = path.join("uploads", "produtos");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const INVALID_FORMAT_MESSAGE = "Apenas imagens JPG, PNG ou WEBP são permitidas";

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(PRODUTOS_DIR)) {
      fs.mkdirSync(PRODUTOS_DIR, { recursive: true });
    }
    cb(null, PRODUTOS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
    const userId = req.user?.id || req.user?._id || "anon";
    cb(null, `produto-${userId}-${Date.now()}${safeExt}`);
  },
});

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }
  const error = new Error(INVALID_FORMAT_MESSAGE);
  error.statusCode = 400;
  cb(error, false);
};

const limits = { fileSize: 5 * 1024 * 1024 };

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "A imagem deve ter no máximo 5MB",
    });
  }
  if (err?.message === INVALID_FORMAT_MESSAGE) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
  return next(err);
}

module.exports = {
  upload: multer({ storage, fileFilter, limits }).single("imagem"),
  handleMulterError,
};
