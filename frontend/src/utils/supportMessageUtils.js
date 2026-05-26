const STAFF_TYPES = new Set(['farmaceutico', 'admin', 'sistema']);

export function normalizeTipoRemetente(msg) {
  const raw = msg?.tipo_remetente ?? msg?.tipoRemetente ?? 'usuario';
  return String(raw).toLowerCase();
}

export function normalizeSupportMessage(msg) {
  if (!msg) return null;
  const tipo = normalizeTipoRemetente(msg);
  const enviadoEm = msg.enviado_em || msg.enviadoEm || new Date().toISOString();
  return {
    id_remetente: msg.id_remetente ?? msg.remetenteId ?? null,
    tipo_remetente: tipo,
    texto: msg.texto || '',
    enviado_em: enviadoEm,
  };
}

export function contentDedupeKey(msg) {
  const n = normalizeSupportMessage(msg);
  if (!n) return '';
  return `${n.tipo_remetente}|${String(n.texto).trim()}`;
}

export function messageKey(msg) {
  const n = normalizeSupportMessage(msg);
  if (!n) return '';
  return `${n.tipo_remetente}|${n.texto}|${new Date(n.enviado_em).getTime()}`;
}

export function replaceOptimisticOrAppend(messages, incoming) {
  const normalized = normalizeSupportMessage(incoming);
  if (!normalized) return messages || [];
  const list = [...(messages || [])];
  const contentKey = contentDedupeKey(normalized);

  const last = list[list.length - 1];
  if (last?._optimistic && contentDedupeKey(last) === contentKey) {
    list[list.length - 1] = normalized;
    return list;
  }

  if (list.some((m) => contentDedupeKey(m) === contentKey)) {
    return list;
  }

  return [...list, incoming?._optimistic ? incoming : normalized];
}

export function appendMessageDeduped(messages, incoming) {
  return replaceOptimisticOrAppend(messages, incoming);
}

export function isStaffMessage(msg) {
  const tipo = normalizeTipoRemetente(msg);
  return STAFF_TYPES.has(tipo);
}

export function countOpenSupportTickets(tickets = []) {
  return tickets.filter((t) => {
    const status = String(t?.status || '');
    return !['encerrada', 'resolvida'].includes(status);
  }).length;
}

export function ticketNeedsPharmacistAttention(ticket) {
  const status = String(ticket?.status || '');
  if (['encerrada', 'resolvida'].includes(status)) return false;
  if (!['aberta', 'em_atendimento', 'respondida'].includes(status)) return false;

  const msgs = Array.isArray(ticket?.mensagens) ? ticket.mensagens : [];
  if (msgs.length === 0) return status === 'aberta';

  const last = msgs[msgs.length - 1];
  const lastTipo = normalizeTipoRemetente(last);
  return lastTipo === 'usuario' || status === 'aberta';
}

export function computeSupportResponseMinutes(ticket) {
  return computeSupportResponseMinutesFromTicket(ticket);
}

export function computeSupportResponseMinutesFromTicket(ticket) {
  const replyAt = ticket?.primeira_resposta_em
    ? new Date(ticket.primeira_resposta_em)
    : null;
  const startAt = ticket?.aberta_em
    ? new Date(ticket.aberta_em)
    : ticket?.createdAt
      ? new Date(ticket.createdAt)
      : null;

  if (replyAt && startAt && !Number.isNaN(replyAt.getTime()) && !Number.isNaN(startAt.getTime())) {
    return Math.max(0, Math.floor((replyAt - startAt) / 60000));
  }

  const msgs = Array.isArray(ticket?.mensagens) ? ticket.mensagens : [];
  const firstUser = msgs.find((m) => normalizeTipoRemetente(m) === 'usuario');
  const firstStaff = msgs.find((m) => {
    const t = normalizeTipoRemetente(m);
    return t === 'farmaceutico' || t === 'admin';
  });

  const startFromMsg = firstUser?.enviado_em
    ? new Date(firstUser.enviado_em)
    : startAt;
  const replyFromMsg = firstStaff?.enviado_em ? new Date(firstStaff.enviado_em) : null;

  if (!startFromMsg || !replyFromMsg) return null;
  if (Number.isNaN(startFromMsg.getTime()) || Number.isNaN(replyFromMsg.getTime())) return null;
  return Math.max(0, Math.floor((replyFromMsg - startFromMsg) / 60000));
}

export function mergeTicketWithMessage(ticket, mensagem, extraFields = {}) {
  if (!ticket) return ticket;
  const normalized = normalizeSupportMessage(mensagem);
  const mensagens = replaceOptimisticOrAppend(ticket.mensagens || [], mensagem);
  const isStaff = normalized && isStaffMessage(normalized);
  return {
    ...ticket,
    ...extraFields,
    mensagens,
    updatedAt: normalized?.enviado_em || ticket.updatedAt,
    primeira_resposta_em:
      extraFields.primeira_resposta_em ??
      ticket.primeira_resposta_em ??
      (isStaff && !ticket.primeira_resposta_em ? normalized.enviado_em : ticket.primeira_resposta_em),
    status: extraFields.status ?? ticket.status,
  };
}

function isSameDay(dateA, dateB) {
  if (!dateA || !dateB) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

/**
 * Mescla métricas de receitas (base) com tickets de suporte.
 */
export function buildDashboardStats(baseStats, supportTickets = []) {
  const openSupportCount = countOpenSupportTickets(supportTickets);
  const alertas_ativos = (baseStats?.alertas_ativos || 0) + openSupportCount;

  const now = new Date();
  const supportTemposHoje = (supportTickets || [])
    .map((ticket) => {
      const mins = computeSupportResponseMinutesFromTicket(ticket);
      if (mins == null) return null;
      const replyAt = ticket?.primeira_resposta_em
        ? new Date(ticket.primeira_resposta_em)
        : (() => {
            const msgs = Array.isArray(ticket.mensagens) ? ticket.mensagens : [];
            const firstStaff = msgs.find((m) => {
              const t = normalizeTipoRemetente(m);
              return t === 'farmaceutico' || t === 'admin';
            });
            return firstStaff?.enviado_em ? new Date(firstStaff.enviado_em) : null;
          })();
      if (!replyAt || Number.isNaN(replyAt.getTime()) || !isSameDay(replyAt, now)) {
        return null;
      }
      return mins;
    })
    .filter((v) => Number.isFinite(v));

  const allTempos = [...(baseStats?._temposResposta || []), ...supportTemposHoje];
  const atendimentos_media_resposta =
    allTempos.length > 0
      ? Math.round(allTempos.reduce((s, v) => s + v, 0) / allTempos.length)
      : 0;

  const { _temposResposta, ...rest } = baseStats || {};
  void _temposResposta;
  return {
    ...rest,
    alertas_ativos,
    atendimentos_media_resposta,
    _amostras_tempo: allTempos.length,
  };
}

export function formatMediaRespostaDisplay(stats) {
  const media = stats?.atendimentos_media_resposta ?? 0;
  const amostras = stats?._amostras_tempo ?? 0;
  if (amostras === 0 && media === 0) return '—';
  return `${Math.round(media)}min`;
}
