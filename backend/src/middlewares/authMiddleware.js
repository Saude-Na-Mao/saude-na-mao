const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/User");
const { getJwtSecrets } = require("../config/jwtSecrets");

function normalizeLinkedPharmacyId(value) {
  if (value == null) return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
}

exports.protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ success: false, message: "Não autenticado" });
  }
  try {
    const { JWT_SECRET } = getJwtSecrets();
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select("-senha");
    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Usuário não encontrado" });
    }
    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ success: false, message: "Token inválido ou expirado" });
  }
};

exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.tipo_usuario)) {
      return res
        .status(403)
        .json({ success: false, message: "Sem permissão para este recurso" });
    }
    next();
  };
};

/** Dono, farmacêutico vinculado ou administrador podem agir em nome da farmácia. */
exports.assertPharmacyStaffAccess = (paramName = "id") => {
  return (req, res, next) => {
    const targetId = req.params[paramName];
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, message: "ID da farmácia inválido" });
    }
    const user = req.user;
    if (user.tipo_usuario === "administrador") {
      return next();
    }
    const ownerFarm = normalizeLinkedPharmacyId(user.dados_dono_farmacia?.id_farmacia);
    const pharmacistFarm = normalizeLinkedPharmacyId(user.dados_farmaceutico?.id_farmacia);
    if (ownerFarm === String(targetId) || pharmacistFarm === String(targetId)) {
      return next();
    }
    return res.status(403).json({ success: false, message: "Sem permissão para editar esta farmácia" });
  };
};
