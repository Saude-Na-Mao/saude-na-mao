const multer = require("multer");
const fs = require("fs");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = "uploads/perfil/";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const filename = `perfil-${req.user.id}-${timestamp}${ext}`;
    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error("Apenas imagens JPG, PNG ou WEBP são permitidas");
    error.statusCode = 400;
    cb(error, false);
  }
};

const limits = {
  fileSize: 5 * 1024 * 1024,
};

module.exports = multer({ storage, fileFilter, limits }).single("foto");
