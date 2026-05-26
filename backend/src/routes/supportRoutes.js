const express = require("express");
const supportController = require("../controllers/supportController");
const { protect, authorize } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/", protect, supportController.createTicket);
router.get("/", protect, supportController.getUserTickets);
router.get("/unread", protect, supportController.getUnreadCount);

router.get(
  "/admin/all",
  protect,
  authorize("farmaceutico", "dono_farmacia", "administrador"),
  supportController.getAllTickets,
);

router.post(
  "/admin/:id/assign",
  protect,
  authorize("farmaceutico", "dono_farmacia", "administrador"),
  supportController.assignTicket,
);

router.get("/:id", protect, supportController.getTicketById);
router.post("/:id/message", protect, supportController.sendMessage);
router.post("/:id/close", protect, supportController.closeTicket);
router.post("/:id/rate", protect, supportController.rateSupport);

module.exports = router;
