const STATUS_LABELS = {
  em_processamento: 'Em Processamento',
  a_caminho: 'A Caminho',
  aguardando_confirmacao_receita_farmacia: 'Aguardando confirmação na farmácia (receita)',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

function buildOrderConfirmationHtml(order) {
  const itens = (order.itens || [])
    .map((i) => `<li>${i.quantidade}x ${i.nome_produto} — R$ ${Number(i.subtotal).toFixed(2)}</li>`)
    .join('');
  return `
    <h2>Pedido Confirmado! 🎉</h2>
    <p>Obrigado pela sua compra. Seu pedido <strong>#${String(order._id).slice(-8).toUpperCase()}</strong> foi recebido.</p>
    <ul>${itens}</ul>
    <p><strong>Total: R$ ${Number(order.total).toFixed(2)}</strong></p>
    <p>Acompanhe o andamento pelo aplicativo Saúde na Mão.</p>
  `;
}

function buildOrderStatusHtml(order, novoStatus) {
  const label = STATUS_LABELS[novoStatus] || novoStatus;
  return `
    <h2>Atualização do Pedido</h2>
    <p>Seu pedido <strong>#${String(order._id).slice(-8).toUpperCase()}</strong> agora está: <strong>${label}</strong>.</p>
    <p>Acompanhe pelo aplicativo Saúde na Mão.</p>
  `;
}

async function sendEmail(to, subject, html) {
  // Quando não há serviço de e-mail configurado, apenas registra no log
  if (!process.env.SMTP_HOST && !process.env.SENDGRID_API_KEY) {
    console.info(`[email] Para: ${to} | Assunto: ${subject} (envio desativado em dev)`);
    return;
  }

  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@saudenamao.com.br',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.warn('[email] Falha ao enviar e-mail:', err.message);
  }
}

async function sendOrderConfirmation(order, email) {
  const subject = `Pedido #${String(order._id).slice(-8).toUpperCase()} confirmado — Saúde na Mão`;
  const html = buildOrderConfirmationHtml(order);
  await sendEmail(email, subject, html);
}

async function sendOrderStatusEmail(order, novoStatus, email) {
  const label = STATUS_LABELS[novoStatus] || novoStatus;
  const subject = `Pedido #${String(order._id).slice(-8).toUpperCase()} — ${label}`;
  const html = buildOrderStatusHtml(order, novoStatus);
  await sendEmail(email, subject, html);
}

module.exports = {
  sendOrderConfirmation,
  sendOrderStatusEmail,
  // templates legados mantidos para compatibilidade
  orderConfirmation: (order) => ({
    subject: `Pedido #${order._id} confirmado`,
    html: buildOrderConfirmationHtml(order),
  }),
  orderShipped: (order) => ({
    subject: `Pedido #${order._id} enviado`,
    html: `<h1>Seu pedido foi enviado!</h1>`,
  }),
  orderDelivered: (order) => ({
    subject: `Pedido #${order._id} entregue`,
    html: `<h1>Pedido Entregue!</h1><p>Sua compra foi entregue com sucesso.</p>`,
  }),
};
