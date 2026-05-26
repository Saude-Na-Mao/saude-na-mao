const multer = require("multer");
const fs = require("fs");
const path = require("path");

const RECEITAS_DIR = path.join("uploads", "receitas");
const ALLOWED_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const INVALID_FORMAT_MESSAGE = "Formato não permitido. Use JPG, PNG ou PDF";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(RECEITAS_DIR)) {
      fs.mkdirSync(RECEITAS_DIR, { recursive: true });
    }

    cb(null, RECEITAS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const userId = req.user.id;
    cb(null, `receita-${userId}-${timestamp}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
    return;
  }

  const error = new Error(INVALID_FORMAT_MESSAGE);
  error.statusCode = 400;
  cb(error, false);
};

const limits = {
  fileSize: 15 * 1024 * 1024,
};

function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({
      success: false,
      message: "Arquivo muito grande. Máximo 15MB",
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
  upload: multer({ storage, fileFilter, limits }).single("receita"),
  handleMulterError,
};
