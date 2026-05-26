const cron = require("node-cron");
const cartService = require("../services/cartService");
const prescriptionService = require("../services/prescriptionService");

function setupCronJobs() {
  cron.schedule("0 0 * * *", async () => {
    try {
      const expiradas = await prescriptionService.expirePrescriptions();
      console.log(`[CRON] ${expiradas} receitas expiradas automaticamente`);
    } catch (error) {
      console.error("[CRON] Erro ao expirar receitas:", error.message);
    }
  });

  cron.schedule("0 * * * *", async () => {
    try {
      const expirados = await cartService.expireAbandonedCarts();
      console.log(`[CRON] ${expirados} carrinhos expirados automaticamente`);
    } catch (error) {
      console.error("[CRON] Erro ao expirar carrinhos:", error.message);
    }
  });
}

module.exports = { setupCronJobs };
