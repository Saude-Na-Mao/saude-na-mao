const couponService = require("../services/couponService");

async function validateCoupon(req, res, next) {
  try {
    const { codigo, subtotal } = req.body;
    const userId = req.user?.id;
    const resultado = await couponService.validateCoupon(
      codigo,
      userId,
      subtotal,
    );
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function listActiveCoupons(req, res, next) {
  try {
    const cupons = await couponService.listActiveCoupons();
    res.json({ success: true, data: { cupons } });
  } catch (error) {
    next(error);
  }
}

async function listCoupons(req, res, next) {
  try {
    const { page, limit, ativo } = req.query;
    const resultado = await couponService.listCoupons({ page, limit, ativo });
    res.json({ success: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

async function createCoupon(req, res, next) {
  try {
    const cupom = await couponService.createCoupon(req.body);
    res.status(201).json({ success: true, data: { cupom } });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  validateCoupon,
  listActiveCoupons,
  listCoupons,
  createCoupon,
};
