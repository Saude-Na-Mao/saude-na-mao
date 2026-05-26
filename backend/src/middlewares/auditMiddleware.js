const AuditLog = require("../models/AuditLog");

function resolveIp(req) {
  const forwardedFor = req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "desconhecido";
}

async function registrarLog(
  req,
  res,
  acao,
  recurso,
  responseData,
  opcoes = {},
) {
  try {
    const ip = resolveIp(req);
    const status = res.statusCode < 400 ? "sucesso" : "falha";

    const log = {
      usuario_id: req.user?.id || req.user?._id || null,
      usuario_email: req.user?.email || "sistema",
      usuario_tipo: req.user?.tipo_usuario || "sistema",
      ip_origem: ip,
      user_agent: req.headers["user-agent"],
      acao,
      recurso,
      recurso_id: opcoes.recurso_id || req.params?.id || null,
      valores_anteriores: opcoes.valores_anteriores || null,
      valores_novos: opcoes.valores_novos || responseData?.data || null,
      descricao: opcoes.descricao || acao,
      status,
      motivo_falha: res.statusCode >= 400 ? responseData?.message : null,
    };

    AuditLog.create(log).catch((error) => {
      console.error("Erro ao registrar log de auditoria:", error);
    });
  } catch (error) {
    console.error("Erro ao preparar log de auditoria:", error);
  }
}

function audit(acao, recurso, opcoes = {}) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = function (data) {
      void registrarLog(req, res, acao, recurso, data, opcoes);
      return originalJson(data);
    };

    next();
  };
}

async function logManual({
  acao,
  recurso,
  recurso_id,
  usuario_id,
  ip,
  valores_anteriores,
  valores_novos,
  descricao,
  status,
}) {
  try {
    const log = await AuditLog.create({
      usuario_id: usuario_id || null,
      usuario_email: "sistema",
      usuario_tipo: "sistema",
      ip_origem: ip || "sistema",
      acao,
      recurso,
      recurso_id: recurso_id || null,
      valores_anteriores: valores_anteriores || null,
      valores_novos: valores_novos || null,
      descricao: descricao || acao,
      status: status || "sucesso",
    });

    return log;
  } catch (error) {
    console.error("Erro ao registrar log manual de auditoria:", error);
    return null;
  }
}

module.exports = { audit, logManual };
