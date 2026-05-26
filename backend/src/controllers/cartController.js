const cartService = require("../services/cartService");

function sendSuccess(res, { statusCode = 200, message = "", data = {} }) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

async function getCart(req, res, next) {
  try {
    const carrinho = await cartService.getOrCreateCart(req.user.id);
    return sendSuccess(res, { data: { carrinho } });
  } catch (error) {
    return next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const { productId, quantidade, receitaId } = req.body;
    const carrinho = await cartService.addItem(req.user.id, {
      productId,
      quantidade,
      receitaId,
    });

    return sendSuccess(res, {
      message: "Item adicionado ao carrinho",
      data: { carrinho },
    });
  } catch (error) {
    return next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const { productId } = req.params;
    const carrinho = await cartService.removeItem(req.user.id, productId);

    return sendSuccess(res, {
      message: "Item removido",
      data: { carrinho },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateItemQuantity(req, res, next) {
  try {
    const { productId } = req.params;
    const { quantidade } = req.body;
    const carrinho = await cartService.updateItemQuantity(
      req.user.id,
      productId,
      quantidade,
    );

    return sendSuccess(res, { data: { carrinho } });
  } catch (error) {
    return next(error);
  }
}

async function clearCart(req, res, next) {
  try {
    await cartService.clearCart(req.user.id);
    return sendSuccess(res, {
      message: "Carrinho esvaziado",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
}

async function setDeliveryOptions(req, res, next) {
  try {
    const { tipoEntrega, enderecoId } = req.body;
    const resultado = await cartService.setDeliveryOptions(req.user.id, {
      tipoEntrega,
      enderecoId,
    });

    const carrinho = resultado?.carrinho || resultado;
    const frete = resultado?.frete || {
      taxa_entrega: carrinho?.taxa_entrega,
      tempo_estimado: null,
    };

    return sendSuccess(res, {
      message: "Entrega configurada",
      data: {
        carrinho,
        frete,
      },
    });
  } catch (error) {
    return next(error);
  }
}

async function getDeliveryOptions(req, res, next) {
  try {
    const opcoes = await cartService.getDeliveryOptions(req.user.id);
    return sendSuccess(res, { data: { opcoes } });
  } catch (error) {
    return next(error);
  }
}

async function checkout(req, res, next) {
  try {
    const pedido = await cartService.checkout(req.user.id);
    return sendSuccess(res, {
      statusCode: 201,
      message: "Pedido criado. Prossiga para o pagamento.",
      data: { pedido },
    });
  } catch (error) {
    return next(error);
  }
}

async function abandonCart(req, res, next) {
  try {
    await cartService.abandonCart(req.user.id);
    return sendSuccess(res, {
      message: "Carrinho abandonado",
      data: {},
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getCart,
  addItem,
  removeItem,
  updateItemQuantity,
  clearCart,
  setDeliveryOptions,
  getDeliveryOptions,
  checkout,
  abandonCart,
};
