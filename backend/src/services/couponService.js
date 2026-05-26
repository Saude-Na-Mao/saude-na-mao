const Coupon = require("../models/Coupon");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function validateCoupon(codigo, userId, subtotal = 0) {
  const cupom = await Coupon.findOne({
    codigo: codigo.toUpperCase().trim(),
    ativo: true,
  });

  if (!cupom) {
    throw createError("Cupom não encontrado ou inativo", 404);
  }

  if (new Date() > cupom.validade) {
    throw createError("Cupom expirado", 400);
  }

  if (cupom.limite_uso !== null && cupom.usos >= cupom.limite_uso) {
    throw createError("Cupom esgotado", 400);
  }

  if (subtotal < cupom.minimo_pedido) {
    throw createError(
      `Pedido mínimo de R$ ${cupom.minimo_pedido.toFixed(2)} para este cupom`,
      400,
    );
  }

  if (userId && cupom.limite_por_usuario) {
    const usoUsuario = cupom.usuarios_utilizaram.find(
      (u) => u.id_usuario.toString() === userId.toString(),
    );

    if (usoUsuario && usoUsuario.quantidade >= cupom.limite_por_usuario) {
      throw createError("Você já utilizou este cupom", 400);
    }
  }

  let desconto = 0;
  if (cupom.tipo_desconto === "percentual") {
    desconto = (subtotal * cupom.valor) / 100;
    if (cupom.desconto_maximo && desconto > cupom.desconto_maximo) {
      desconto = cupom.desconto_maximo;
    }
  } else {
    desconto = Math.min(cupom.valor, subtotal);
  }

  return {
    cupom: {
      id: cupom._id,
      codigo: cupom.codigo,
      tipo_desconto: cupom.tipo_desconto,
      valor: cupom.valor,
      descricao: cupom.descricao,
      frete_gratis: cupom.frete_gratis,
    },
    desconto: Number(desconto.toFixed(2)),
    frete_gratis: cupom.frete_gratis,
  };
}

async function applyCoupon(couponId, userId) {
  const cupom = await Coupon.findById(couponId);
  if (!cupom) {
    throw createError("Cupom não encontrado", 404);
  }

  cupom.usos += 1;

  const usoExistente = cupom.usuarios_utilizaram.find(
    (u) => u.id_usuario.toString() === userId.toString(),
  );

  if (usoExistente) {
    usoExistente.quantidade += 1;
  } else {
    cupom.usuarios_utilizaram.push({ id_usuario: userId, quantidade: 1 });
  }

  await cupom.save();
  return cupom;
}

async function listCoupons({ page = 1, limit = 20, ativo } = {}) {
  const filtro = {};
  if (ativo !== undefined) filtro.ativo = ativo;

  const skip = (page - 1) * limit;
  const [cupons, total] = await Promise.all([
    Coupon.find(filtro).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Coupon.countDocuments(filtro),
  ]);

  return {
    cupons,
    total,
    pagina: page,
    totalPaginas: Math.ceil(total / limit) || 1,
  };
}

async function listActiveCoupons() {
  const agora = new Date();
  const cupons = await Coupon.find({
    ativo: true,
    validade: { $gt: agora },
    $or: [
      { limite_uso: null },
      { $expr: { $lt: ["$usos", "$limite_uso"] } },
    ],
  })
    .select("codigo tipo_desconto valor desconto_maximo minimo_pedido descricao frete_gratis validade")
    .sort({ createdAt: -1 });

  return cupons;
}

async function createCoupon(dados) {
  const existe = await Coupon.findOne({
    codigo: dados.codigo.toUpperCase().trim(),
  });
  if (existe) {
    throw createError("Código de cupom já existe", 400);
  }

  const cupom = new Coupon({
    ...dados,
    codigo: dados.codigo.toUpperCase().trim(),
  });
  await cupom.save();
  return cupom;
}

module.exports = {
  validateCoupon,
  applyCoupon,
  listCoupons,
  listActiveCoupons,
  createCoupon,
};
