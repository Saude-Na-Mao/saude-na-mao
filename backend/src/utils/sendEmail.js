const nodemailer = require("nodemailer");

const sendEmail = async ({ to, subject, text, html }) => {
  console.log("\n📧 === EMAIL DE RECUPERAÇÃO ===");
  console.log(`Para: ${to}`);
  console.log(`Assunto: ${subject}`);
  console.log(`Conteúdo: ${text}`);
  console.log("=============================\n");

  if (process.env.NODE_ENV === "test") {
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Saúde Na Mão" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html: html || text,
    });
  } catch (error) {
    console.error("❌ Erro ao enviar e-mail real:", error.message);
  }
};

module.exports = sendEmail;
