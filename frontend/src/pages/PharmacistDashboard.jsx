import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore, useUiStore } from '../stores/store';
import { ManageReceitasTab } from '../components/ManageReceitasTab';
import FarmaciaEnderecoPanel from '../components/FarmaciaEnderecoPanel';
import { prescriptionService, orderService, pharmacistService } from '../services/api';
import api from '../services/api';
import Modal from '../components/Modal';
import PrescriptionChat from '../components/PrescriptionChat';
import { io } from 'socket.io-client';
import { MessageCircle, Image as ImageIcon, CheckCircle, XCircle, Eye, Send, ClipboardList, FileText } from 'lucide-react';
import { supportService } from '../services/api';
import { getSocketUrl, SOCKET_TRANSPORTS } from '../config/env';
import {
  buildDashboardStats,
  contentDedupeKey,
  formatMediaRespostaDisplay,
  mergeTicketWithMessage,
  messageKey,
  normalizeSupportMessage,
  replaceOptimisticOrAppend,
} from '../utils/supportMessageUtils';
import './PharmacistDashboard.css';
import {
  getOrderProgressSteps,
  orderHasPrescriptionItem,
  getOrderCancellationReason,
} from '../utils/orderStatusDisplay';
import { isSngpcProduct } from '../utils/compliance';

const REFRESH_INTERVAL = 30000; // 30 segundos

const STATUS_OPCOES = [
  { valor: 'todos', label: 'Todas', cor: 'bg-gray-200 text-gray-800' },
  { valor: 'Pendente', label: 'Pendentes', cor: 'bg-yellow-100 text-yellow-700' },
  { valor: 'Em Análise', label: 'Em análise', cor: 'bg-blue-100 text-blue-700' },
  { valor: 'Aprovada', label: 'Aprovadas', cor: 'bg-green-100 text-green-700' },
  { valor: 'Rejeitada', label: 'Rejeitadas', cor: 'bg-red-100 text-red-700' },
];

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

const NO_CONTROLLED_BATCH_CLIENT_REASON =
  'Não foi possível aprovar sua receita porque o medicamento sujeito ao SNGPC não possui lote disponível nesta farmácia. Escolha outra farmácia ou aguarde reposição.';

const NO_CONTROLLED_BATCH_PHARMACY_REASON =
  'Esta receita não possui pedido sujeito ao SNGPC vinculado com lotes disponíveis. Sem lote disponível, a rastreabilidade ANVISA/SNGPC não pode ser registrada.';

function objectIdValue(value) {
  const raw = value?._id || value?.id || value;
  return raw ? String(raw) : '';
}

function normalizeFileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.pathname.startsWith('/uploads/')) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return raw;
    }
    return raw;
  }
  return `/${raw.replace(/^\/+/, '').replace(/\\/g, '/')}`;
}

function productFromOrderItem(item) {
  return item?.id_produto || item?.produto || {};
}

function isControlledOrderItem(item) {
  const product = productFromOrderItem(item);
  return Boolean(isSngpcProduct(item) || isSngpcProduct(product));
}

function linkedOrderFromPrescription(receita, orders = []) {
  const direct = receita?.id_pedido_utilizado || receita?.id_pedido_vinculado;
  if (direct && typeof direct === 'object') return direct;
  const directId = objectIdValue(direct);
  if (directId) {
    const match = orders.find((order) => objectIdValue(order) === directId);
    if (match) return match;
  }
  const linkedIds = Array.isArray(receita?.pedidos_vinculados)
    ? receita.pedidos_vinculados.map((item) => objectIdValue(item?.id_pedido)).filter(Boolean)
    : [];
  return orders.find((order) => linkedIds.includes(objectIdValue(order))) || null;
}

function controlledItemForPrescription(receita, order) {
  if (!order) return null;
  const prescriptionId = objectIdValue(receita);
  const items = order?.itens || [];
  return (
    items.find((item) => objectIdValue(item?.id_receita) === prescriptionId && isControlledOrderItem(item)) ||
    items.find(isControlledOrderItem) ||
    null
  );
}

function productFromPrescription(receita) {
  return receita?.id_produto && typeof receita.id_produto === 'object'
    ? receita.id_produto
    : receita?.produto || null;
}

function prescriptionRequiresControlledFlow(receita, order, controlledItem) {
  if (controlledItem) return true;
  if ((order?.itens || []).some(isControlledOrderItem)) return true;
  if (isSngpcProduct(productFromPrescription(receita))) return true;
  return ['especial_c1', 'especial_b', 'antimicrobiano'].includes(String(receita?.tipo_receita || '').trim());
}

function digitalSignatureCodeFromPrescription(receita) {
  const ocr = receita?.dados_ocr || {};
  return (
    receita?.digitalSignatureCode ||
    receita?.codigo_validacao_assinatura ||
    receita?.hash_assinatura ||
    ocr?.codigo_validacao_assinatura ||
    ocr?.hash_assinatura ||
    receita?.hash_arquivo ||
    ''
  );
}

function availableBatchesForItem(item) {
  const product = productFromOrderItem(item);
  const now = new Date();
  return [...(product?.batches || [])]
    .filter((batch) => {
      if (batch?.active === false || Number(batch?.quantity || 0) <= 0) return false;
      if (batch?.expirationDate && new Date(batch.expirationDate) < now) return false;
      return true;
    })
    .sort((a, b) => new Date(a.expirationDate || 0) - new Date(b.expirationDate || 0));
}

/**
 * Lotes já comprometidos por outros pedidos ativos (dispensação registrada),
 * para não oferecer o mesmo lote duas vezes. Pedido rejeitado/cancelado libera
 * o lote (o backend restaura a quantidade), então não entra aqui.
 */
function committedBatchNumbers(orders, { excludeOrderId = null, productId = null } = {}) {
  const set = new Set();
  const exclude = excludeOrderId ? String(excludeOrderId) : null;
  const pid = productId ? String(productId) : null;
  for (const o of orders || []) {
    if (['cancelado', 'rejeitado'].includes(String(o?.status || '').trim())) continue;
    if (exclude && String(o?._id) === exclude) continue;
    const sd = o?.sngpcData;
    if (sd?.selectedBatchNumber) {
      const sameProduct = !pid || String(sd.productId || '') === pid;
      if (sameProduct) set.add(String(sd.selectedBatchNumber).trim());
    }
    for (const it of o?.itens || []) {
      const lote = it?.lote_consumido?.batchNumber;
      if (!lote) continue;
      const itemPid = String(it?.id_produto?._id || it?.id_produto || '');
      if (!pid || itemPid === pid) set.add(String(lote).trim());
    }
  }
  return set;
}

function formatBatchDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function OrderProgressMini({ order }) {
  if (['cancelado', 'rejeitado'].includes(String(order?.status || '').trim())) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {getOrderProgressSteps(order).map((step) => (
        <div
          key={step.id}
          className={`rounded-lg px-2.5 py-2 text-[11px] font-semibold border ${
            step.state === 'completed'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : step.state === 'current'
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-gray-50 border-gray-200 text-gray-500'
          }`}
        >
          {step.label}
        </div>
      ))}
    </div>
  )
}

function isSameDay(dateA, dateB) {
  if (!dateA || !dateB) return false;
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function sortTicketsByUpdatedDesc(tickets = []) {
  return [...tickets].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
  );
}

function getLastStatusChangeAt(receita, targetStatuses = []) {
  const historico = Array.isArray(receita?.historico_status)
    ? [...receita.historico_status]
    : [];
  const filtered = historico
    .filter(
      (h) =>
        h?.status &&
        (targetStatuses.length === 0 || targetStatuses.includes(h.status)) &&
        h?.alterado_em,
    )
    .sort((a, b) => new Date(b.alterado_em) - new Date(a.alterado_em));
  return filtered[0]?.alterado_em || null;
}

function buildStatsFromReceitas(receitas = []) {
  const now = new Date();
  const pendentes = receitas.filter((r) =>
    ['Pendente', 'Em Análise'].includes(r?.status),
  );

  const alertasAtivos = pendentes.filter((r) => {
    const createdAt = r?.createdAt ? new Date(r.createdAt) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
    const diffMin = Math.floor((now - createdAt) / 60000);
    return diffMin >= 30 || r?.modo_validacao === 'chat_ao_vivo';
  });

  const validadasHoje = receitas.filter((r) => {
    if (!['Aprovada', 'Rejeitada'].includes(r?.status)) return false;
    const validadoEm = r?.validado_em
      ? new Date(r.validado_em)
      : r?.updatedAt
        ? new Date(r.updatedAt)
        : null;
    const histAt = getLastStatusChangeAt(r, ['Aprovada', 'Rejeitada']);
    const dateRef = histAt ? new Date(histAt) : validadoEm;
    return dateRef && !Number.isNaN(dateRef.getTime()) && isSameDay(dateRef, now);
  });

  const temposResposta = validadasHoje
    .map((r) => {
      const createdAt = r?.createdAt ? new Date(r.createdAt) : null;
      const histAt = getLastStatusChangeAt(r, ['Aprovada', 'Rejeitada']);
      const finalAt = histAt
        ? new Date(histAt)
        : r?.validado_em
          ? new Date(r.validado_em)
          : r?.updatedAt
            ? new Date(r.updatedAt)
            : null;
      if (!createdAt || !finalAt) return null;
      if (Number.isNaN(createdAt.getTime()) || Number.isNaN(finalAt.getTime())) return null;
      const diffMin = Math.max(0, Math.floor((finalAt - createdAt) / 60000));
      return diffMin;
    })
    .filter((v) => Number.isFinite(v));

  const mediaResposta =
    temposResposta.length > 0
      ? Math.round(
          temposResposta.reduce((sum, value) => sum + value, 0) / temposResposta.length,
        )
      : 0;

  return {
    validacoes_pendentes: pendentes.length,
    alertas_ativos: alertasAtivos.length,
    receitas_validadas_hoje: validadasHoje.length,
    atendimentos_media_resposta: mediaResposta,
    _temposResposta: temposResposta,
  };
}

function PharmacistPresenceToggle() {
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await pharmacistService.getMe();
        const ph = res.data?.data?.pharmacist;
        if (!cancelled && ph) {
          setOnline(Boolean(ph.logado && ph.disponivel_chat !== false));
        }
      } catch {
        if (!cancelled) setOnline(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      pharmacistService.setPresence(false).catch(() => {});
    };
  }, []);

  useEffect(() => {
    if (!online) return undefined;

    const refreshPresence = () => {
      pharmacistService.setPresence(true).catch(() => {});
    };

    const intervalId = window.setInterval(refreshPresence, 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshPresence();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [online]);

  const onToggle = async () => {
    const next = !online;
    setSaving(true);
    setOnline(next); // resposta imediata; reconcilia com o servidor abaixo
    try {
      const res = await pharmacistService.setPresence(next);
      const ph = res.data?.data?.pharmacist;
      if (ph) setOnline(Boolean(ph.logado && ph.disponivel_chat !== false));
    } catch {
      setOnline(!next); // falhou: volta ao estado anterior
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <span className="text-sm text-gray-500">Carregando status...</span>
    );
  }

  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <span
        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          online ? 'bg-emerald-500' : 'bg-gray-400'
        }`}
      />
      <span className="text-sm font-medium text-gray-800">
        {online ? 'Disponível para chat' : 'Indisponível para chat'}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={online}
        disabled={saving}
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          online ? 'bg-emerald-600' : 'bg-gray-300'
        } ${saving ? 'opacity-60' : ''}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            online ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </label>
  );
}

export function PharmacistDashboard() {
  const { token, user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState({
    validacoes_pendentes: 0,
    alertas_ativos: 0,
    receitas_validadas_hoje: 0,
    atendimentos_media_resposta: 0,
  });

  const [pendingValidations, setPendingValidations] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [validatingId, setValidatingId] = useState(null);

  // Filtros e paginação
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [buscaReceitas, setBuscaReceitas] = useState('');
  const [buscaAlertas, setBuscaAlertas] = useState('');

  // Modal de validação detalhada
  const [selectedReceita, setSelectedReceita] = useState(null);
  const [observacoes, setObservacoes] = useState('');
  // 'aprovar' | 'rejeitar' (decisão pretendida no modal)
  const [intencao, setIntencao] = useState(null);
  const [sngpcForm, setSngpcForm] = useState({
    productId: '',
    doctorName: '',
    doctorCrm: '',
    doctorUf: '',
    digitalSignatureCode: '',
    selectedBatchNumber: '',
  });
  const [sngpcSaving, setSngpcSaving] = useState(false);
  const [sngpcReadyByPrescription, setSngpcReadyByPrescription] = useState({});
  const [rejectingPrescription, setRejectingPrescription] = useState(false);
  const [prescriptionRejectReason, setPrescriptionRejectReason] = useState('');
  const [autoRejectingPrescriptionId, setAutoRejectingPrescriptionId] = useState(null);
  // Lightbox para visualização da imagem/PDF da receita
  const [imagemAberta, setImagemAberta] = useState(null);

  // Pedidos de chat ao vivo recebidos via socket
  const [chatRequests, setChatRequests] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [supportTickets, setSupportTickets] = useState([]);
  const [supportLoading, setSupportLoading] = useState(false);
  const [selectedSupportTicket, setSelectedSupportTicket] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportMessageText, setSupportMessageText] = useState('');
  const [supportSending, setSupportSending] = useState(false);
  const [supportClosing, setSupportClosing] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [rejectingOrder, setRejectingOrder] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingOrderAction, setSubmittingOrderAction] = useState(false);
  const [codigoRetiradaPorPedido, setCodigoRetiradaPorPedido] = useState({});
  const [codigoReceitaRetornoPorPedido, setCodigoReceitaRetornoPorPedido] = useState({});
  const [codigoColetaPorPedido, setCodigoColetaPorPedido] = useState({});
  const socketRef = useRef(null);
  const receitasStatsRef = useRef([]);
  const supportTicketsRef = useRef([]);
  const supportMessagesEndRef = useRef(null);
  const optimisticKeyRef = useRef(null);
  const selectedSupportTicketIdRef = useRef(null);
  const processedMessageKeysRef = useRef(new Map());
  const userId = user?.id || user?._id;
  const farmaciaId =
    user?.id_farmacia ||
    user?.dados_farmaceutico?.id_farmacia ||
    user?.dados_dono_farmacia?.id_farmacia ||
    null;
  const [farmaciaIdEfetiva, setFarmaciaIdEfetiva] = useState(farmaciaId);

  useEffect(() => {
    if (farmaciaId) {
      setFarmaciaIdEfetiva(farmaciaId);
      return;
    }

    const resolverFarmacia = async () => {
      try {
        const res = await api.get('/pharmacists/me');
        const resolved =
          res?.data?.data?.pharmacist?.id_farmacia?._id ||
          res?.data?.data?.pharmacist?.id_farmacia ||
          user?.dados_dono_farmacia?.id_farmacia ||
          null;
        if (resolved) setFarmaciaIdEfetiva(resolved);
      } catch {
        // Sem fallback de farmácia; a seção de pedidos ficará vazia.
      }
    };

    if (token) resolverFarmacia();
  }, [token, farmaciaId, user?.dados_dono_farmacia?.id_farmacia]);
  const liveChatAlerts = pendingValidations.filter((receita) => {
    const status = receita?.status;
    return (
      receita?.modo_validacao === 'chat_ao_vivo' &&
      (status === 'Pendente' || status === 'Em Análise')
    );
  });
  const termoReceitas = buscaReceitas.trim().toLowerCase();
  const receitasFiltradas = pendingValidations.filter((receita) => {
    if (!termoReceitas) return true;
    const blob = [
      receita?._id,
      receita?.status,
      receita?.nome_arquivo,
      receita?.id_usuario?.nome,
      receita?.id_usuario?.email,
      receita?.id_usuario?.telefone,
      receita?.id_farmacia?.nome,
      receita?.id_farmacia?.cidade,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termoReceitas);
  });

  const termoAlertas = buscaAlertas.trim().toLowerCase();
  const liveChatAlertsFiltrados = liveChatAlerts.filter((receita) => {
    if (!termoAlertas) return true;
    const blob = [
      receita?._id,
      receita?.status,
      receita?.id_usuario?.nome,
      receita?.id_usuario?.email,
      receita?.id_farmacia?.nome,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termoAlertas);
  });
  const alertsFiltrados = alerts.filter((alert) => {
    if (!termoAlertas) return true;
    const blob = [alert?.titulo, alert?.descricao, alert?.severidade]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termoAlertas);
  });

  const supportOpenTickets = supportTickets.filter(
    (t) => t?.status && !['encerrada'].includes(String(t.status)),
  );
  const supportTicketsToAnswer = sortTicketsByUpdatedDesc(supportOpenTickets);
  const supportTicketsPast = sortTicketsByUpdatedDesc(
    supportTickets.filter((t) => String(t?.status) === 'encerrada'),
  );
  const suporteAlertasFiltrados = supportOpenTickets.filter((t) => {
    if (!termoAlertas) return true;
    const blob = [
      t?._id,
      t?.assunto,
      t?.categoria,
      t?.status,
      t?.origem,
      t?.id_usuario?.nome,
      t?.id_usuario?.email,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termoAlertas);
  });

  useEffect(() => {
    supportTicketsRef.current = supportTickets;
  }, [supportTickets]);

  const applyDashboardStats = useCallback((tickets) => {
    const list = tickets ?? supportTicketsRef.current;
    setStats(
      buildDashboardStats(buildStatsFromReceitas(receitasStatsRef.current), list),
    );
  }, []);

  const fetchData = useCallback(async () => {
    if (!token) return;

    try {
      setError(null);
      const [resList, resAll] = await Promise.all([
        prescriptionService.getAllForPharmacist({
          status: filtroStatus,
          page: 1,
          limit: 50,
        }),
        prescriptionService.getAllForPharmacist({
          status: 'todos',
          page: 1,
          limit: 300,
        }),
      ]);
      const listData = resList.data?.data;
      const lista = Array.isArray(listData)
        ? listData
        : listData?.receitas || listData?.docs || [];
      const allData = resAll.data?.data;
      const listaCompleta = Array.isArray(allData)
        ? allData
        : allData?.receitas || allData?.docs || [];

      setPendingValidations(lista);
      receitasStatsRef.current = listaCompleta;
      applyDashboardStats();

      // Alertas "gerais" da aba: pendências antigas (>= 60 min), excluindo chat_ao_vivo
      const now = new Date();
      const alertasGerais = listaCompleta
        .filter(
          (r) =>
            ['Pendente', 'Em Análise'].includes(r?.status) &&
            r?.modo_validacao !== 'chat_ao_vivo',
        )
        .map((r) => {
          const created = r?.createdAt ? new Date(r.createdAt) : null;
          const ageMin =
            created && !Number.isNaN(created.getTime())
              ? Math.max(0, Math.floor((now - created) / 60000))
              : 0;
          return { receita: r, ageMin };
        })
        .filter(({ ageMin }) => ageMin >= 60)
        .slice(0, 10)
        .map(({ receita, ageMin }) => ({
          _id: receita._id,
          titulo: 'Receita aguardando há muito tempo',
          descricao: `Receita #${String(receita._id || '').slice(-6)} em ${receita.status} há ${Math.floor(ageMin / 60)}h.`,
          severidade: ageMin >= 180 ? 'GRAVE' : 'MODERADA',
          criado_em: receita.createdAt,
        }));

      setAlerts(alertasGerais);
    } catch (err) {
      // Diagnóstico — mostra status, mensagem e payload
      console.error('[Receitas] Status HTTP:', err.response?.status || err.status);
      console.error('[Receitas] Mensagem da API:', err.response?.data || err.data);
      console.error('[Receitas] Erro completo:', err);
      const apiMsg = err.response?.data?.message || err.message;
      const httpStatus = err.response?.status || err.status;
      setError(
        `Erro ao carregar receitas${httpStatus ? ` (HTTP ${httpStatus})` : ''}: ${
          apiMsg || 'verifique o console'
        }`,
      );
    } finally {
      setLoading(false);
    }
  }, [token, filtroStatus, applyDashboardStats]);

  const fetchSupportTickets = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!token) return;
    try {
      if (!silent) setSupportLoading(true);
      const res = await supportService.getAllTickets({ limit: 100 });
      const data = res.data?.data;
      const tickets = Array.isArray(data?.tickets) ? data.tickets : [];
      setSupportTickets(tickets);
      applyDashboardStats(tickets);
    } catch (err) {
      if (!silent) {
        const apiMsg = err.response?.data?.message || err.message;
        setError(apiMsg || 'Erro ao carregar chats de suporte');
      }
    } finally {
      if (!silent) setSupportLoading(false);
    }
  }, [token, applyDashboardStats]);

  const shouldSkipProcessedMessage = (evtTicketId, normalized) => {
    const dedupeId = `${evtTicketId}|${contentDedupeKey(normalized)}`;
    const now = Date.now();
    const last = processedMessageKeysRef.current.get(dedupeId);
    if (last && now - last < 3000) return true;
    processedMessageKeysRef.current.set(dedupeId, now);
    if (processedMessageKeysRef.current.size > 200) {
      const cutoff = now - 3000;
      for (const [k, v] of processedMessageKeysRef.current.entries()) {
        if (v < cutoff) processedMessageKeysRef.current.delete(k);
      }
    }
    return false;
  };

  const handleTicketUpdated = useCallback(
    (payload = {}) => {
      const evtTicketId = payload.ticketId ? String(payload.ticketId) : null;
      const normalized = normalizeSupportMessage(payload.mensagem);
      if (!evtTicketId || !normalized) return;

      const extra = payload.status ? { status: payload.status } : {};
      setSupportTickets((prev) => {
        const next = prev.map((t) =>
          String(t._id) === evtTicketId
            ? mergeTicketWithMessage(t, normalized, extra)
            : t,
        );
        supportTicketsRef.current = next;
        applyDashboardStats(next);
        return next;
      });
    },
    [applyDashboardStats],
  );

  const handleIncomingSupportMessage = useCallback(
    (mensagem, meta = {}) => {
      const evtTicketId = meta.ticketId ? String(meta.ticketId) : null;
      const normalized = normalizeSupportMessage(mensagem);
      if (!normalized || !evtTicketId) return;
      if (shouldSkipProcessedMessage(evtTicketId, normalized)) return;

      const remetenteId = mensagem?.remetenteId ?? mensagem?.id_remetente;
      const isOwnMessage =
        remetenteId && userId && String(remetenteId) === String(userId);

      const extra = meta.status ? { status: meta.status } : {};
      setSupportTickets((prev) => {
        const next = prev.map((t) =>
          String(t._id) === evtTicketId
            ? mergeTicketWithMessage(t, normalized, extra)
            : t,
        );
        supportTicketsRef.current = next;
        applyDashboardStats(next);
        return next;
      });

      setSelectedSupportTicket((prev) => {
        if (!prev || String(prev._id) !== evtTicketId) return prev;
        return mergeTicketWithMessage(prev, normalized, extra);
      });

      const selectedId = selectedSupportTicketIdRef.current;
      if (!selectedId || String(selectedId) !== evtTicketId) return;
      if (isOwnMessage) return;

      setSupportMessages((prev) => replaceOptimisticOrAppend(prev, normalized));
    },
    [applyDashboardStats, userId],
  );

  useEffect(() => {
    selectedSupportTicketIdRef.current = selectedSupportTicket?._id
      ? String(selectedSupportTicket._id)
      : null;
  }, [selectedSupportTicket?._id]);

  useEffect(() => {
    supportMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [supportMessages]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !userId || !selectedSupportTicket?._id) return undefined;
    const tid = String(selectedSupportTicket._id);
    const joinRoom = () => {
      socket.emit('join:support', { ticketId: tid, userId });
    };
    if (socket.connected) joinRoom();
    socket.on('connect', joinRoom);
    return () => {
      socket.off('connect', joinRoom);
    };
  }, [userId, selectedSupportTicket?._id]);

  const fetchOrders = useCallback(async (opts = {}) => {
    const silent = Boolean(opts.silent);
    if (!token || !farmaciaIdEfetiva) return;
    try {
      if (!silent) setOrdersLoading(true);
      const res = await orderService.getPharmacyOrders(farmaciaIdEfetiva, {
        page: 1,
        limit: 50,
      });
      const data = res.data?.data;
      const list = Array.isArray(data?.pedidos) ? data.pedidos : [];
      setOrders(list);
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao carregar pedidos da farmácia');
    } finally {
      if (!silent) setOrdersLoading(false);
    }
  }, [token, farmaciaIdEfetiva]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!token) return;
    fetchSupportTickets({ silent: false });
    const interval = setInterval(() => fetchSupportTickets({ silent: true }), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [token, fetchSupportTickets]);

  useEffect(() => {
    if (activeTab !== 'pedidos') return;
    fetchOrders();
    const interval = setInterval(() => fetchOrders({ silent: true }), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [activeTab, fetchOrders]);

  // Socket: recebe pedidos de chat ao vivo da farmácia do farmacêutico
  useEffect(() => {
    if (!token || !user?.id) return;

    const socket = io(getSocketUrl(), {
      auth: { token },
      transports: SOCKET_TRANSPORTS,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (farmaciaIdEfetiva) {
        const pid = String(farmaciaIdEfetiva);
        socket.emit('join:pharmacy', { pharmacyId: pid });
        socket.emit('join:pharmacy:prescriptions', { pharmacyId: pid });
        socket.emit('join:pharmacy:support', {
          pharmacyId: pid,
          userId: user?.id,
        });
      } else {
        socket.emit('join:admin:prescriptions');
      }
    });

    socket.on('pharmacy:order:pending', () => {
      useUiStore.getState().addNotification({
        type: 'warning',
        title: 'Pedido na fila da farmácia',
        message: 'Abra a aba Pedidos para confirmar ou rejeitar o pedido.',
        duration: 9000,
      });
      fetchOrders({ silent: true });
    });

    // Atualiza a lista de pedidos em tempo real (entregador aceitou, coleta
    // liberada, pedido entregue, etc.) sem esperar o polling.
    socket.on('pharmacy:order:updated', () => {
      fetchOrders({ silent: true });
    });

    socket.on('prescription:chat_request', (payload) => {
      setChatRequests((prev) => {
        if (prev.some((r) => r.prescriptionId === payload.prescriptionId)) {
          return prev;
        }
        return [...prev, payload];
      });
    });

    socket.on('prescription:new', () => {
      fetchData();
    });

    socket.on('support:new_ticket', () => {
      fetchSupportTickets({ silent: true });
      useUiStore.getState().addNotification({
        type: 'info',
        title: 'Nova dúvida de cliente',
        message: 'Há um novo ticket de suporte na sua farmácia.',
        duration: 8000,
      });
    });

    socket.on('support:message', (payload = {}) => {
      if (!payload?.mensagem) return;
      handleIncomingSupportMessage(payload.mensagem, {
        ticketId: payload.ticketId,
        status: payload.status,
      });
    });

    socket.on('support:ticket_updated', (payload = {}) => {
      handleTicketUpdated(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    token,
    user?.id,
    farmaciaIdEfetiva,
    fetchData,
    fetchSupportTickets,
    fetchOrders,
    handleIncomingSupportMessage,
    handleTicketUpdated,
  ]);

  const aprovarPedido = async (orderId) => {
    if (!farmaciaIdEfetiva || submittingOrderAction) return;
    const oid = orderId != null ? String(orderId) : '';
    if (!oid || oid === 'undefined') return;
    try {
      setSubmittingOrderAction(true);
      await orderService.approveByPharmacist(oid, String(farmaciaIdEfetiva));
      await fetchOrders({ silent: true });
      setError(null);
      useUiStore.getState().addNotification({
        type: 'success',
        title: 'Compra confirmada',
        message: `O pedido #${oid.slice(-8).toUpperCase()} foi confirmado e a lista foi atualizada.`,
        duration: 6500,
      });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao aprovar pedido');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const isRetiradaOuDriveThru = (order) =>
    ['retirada', 'drive-thru'].includes(String(order?.tipo_entrega || '').trim());

  const marcarSeparado = async (orderId) => {
    if (!farmaciaIdEfetiva || submittingOrderAction) return;
    const oid = orderId != null ? String(orderId) : '';
    if (!oid) return;
    try {
      setSubmittingOrderAction(true);
      await orderService.markReady(oid, String(farmaciaIdEfetiva));
      await fetchOrders({ silent: true });
      setError(null);
      useUiStore.getState().addNotification({
        type: 'success',
        title: 'Pedido separado',
        message: 'Pedido pronto para retirada — liberado para os entregadores.',
        duration: 5000,
      });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao marcar pedido como separado');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const confirmarColeta = async (orderId) => {
    if (!farmaciaIdEfetiva || submittingOrderAction) return;
    const oid = orderId != null ? String(orderId) : '';
    if (!oid) return;
    const codigo = String(codigoColetaPorPedido[oid] ?? '').trim();
    if (codigo.length !== 8) {
      setError('Informe o código de 8 dígitos que o entregador apresentou.');
      return;
    }
    try {
      setSubmittingOrderAction(true);
      await orderService.confirmPickupCode(oid, String(farmaciaIdEfetiva), codigo);
      setCodigoColetaPorPedido((prev) => {
        const next = { ...prev };
        delete next[oid];
        return next;
      });
      await fetchOrders({ silent: true });
      setError(null);
      useUiStore.getState().addNotification({
        type: 'success',
        title: 'Coleta liberada',
        message: 'Pedido a caminho do cliente.',
        duration: 5000,
      });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao confirmar a coleta');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const marcarRetiradaEntregue = async (orderId) => {
    if (!farmaciaIdEfetiva || submittingOrderAction) return;
    const oid = orderId != null ? String(orderId) : '';
    if (!oid) return;
    const codigo = String(codigoRetiradaPorPedido[oid] ?? codigoRetiradaPorPedido[orderId] ?? '').trim();
    if (!codigo) {
      setError('Informe o código de retirada que o cliente mostra em Meus pedidos.');
      return;
    }
    try {
      setSubmittingOrderAction(true);
      await orderService.completePharmacyPickup(oid, {
        pharmacyId: String(farmaciaIdEfetiva),
        codigo,
      });
      setCodigoRetiradaPorPedido((prev) => {
        const next = { ...prev };
        delete next[oid];
        delete next[orderId];
        return next;
      });
      await fetchOrders({ silent: true });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao marcar retirada como entregue');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const confirmarReceitaRetornoNaFarmacia = async (orderId) => {
    if (!farmaciaIdEfetiva || submittingOrderAction) return;
    const oid = orderId != null ? String(orderId) : '';
    if (!oid) return;
    const codigo = String(codigoReceitaRetornoPorPedido[oid] ?? codigoReceitaRetornoPorPedido[orderId] ?? '').trim();
    if (!codigo) {
      setError('Informe o mesmo código de 6 dígitos que o cliente passou ao entregador.');
      return;
    }
    try {
      setSubmittingOrderAction(true);
      await orderService.confirmReceiptReturnAtPharmacy(oid, {
        pharmacyId: String(farmaciaIdEfetiva),
        codigo,
      });
      setCodigoReceitaRetornoPorPedido((prev) => {
        const next = { ...prev };
        delete next[oid];
        delete next[orderId];
        return next;
      });
      await fetchOrders({ silent: true });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao confirmar receita na farmácia');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const pedidoNaFilaDaFarmacia = (o) => {
    const st = String(o?.status || '').trim();
    if (['cancelado', 'entregue', 'rejeitado'].includes(st)) return false;
    if (st === 'aguardando_confirmacao_receita_farmacia') return true;
    if (st === 'em_processamento') return true;
    if (st === 'confirmado') return true;
    return (
      st === 'aguardando_pagamento' &&
      String(o?.status_pagamento || '').trim() === 'aprovado'
    );
  };

  const pedidoAguardandoValidacaoDigital = (order) =>
    String(order?.status || '').trim() === 'aguardando_confirmacao_receita_farmacia' &&
    String(order?.status_pagamento || '').trim() !== 'aprovado' &&
    orderHasPrescriptionItem(order);

  const pedidosPendentesAprovacao = orders.filter(pedidoNaFilaDaFarmacia);
  const historicoPedidos = orders.filter((o) => !pedidoNaFilaDaFarmacia(o));
  const termoPedidos = ordersSearch.trim().toLowerCase();
  const historicoPedidosFiltrado = historicoPedidos.filter((order) => {
    if (!termoPedidos) return true;
    const blob = [
      order?._id,
      order?.status,
      order?.id_usuario?.nome,
      order?.id_usuario?.telefone,
      order?.total,
      ...(order?.itens || []).map((i) => i?.nome_produto || i?.nome || ''),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(termoPedidos);
  });

  const rejeitarPedido = async () => {
    if (!farmaciaIdEfetiva || !rejectingOrder || submittingOrderAction) return;
    const motivo = rejectReason.trim();
    if (!motivo) {
      setError('Informe um motivo obrigatório para cancelar o pedido.');
      return;
    }
    try {
      setSubmittingOrderAction(true);
      await orderService.rejectByPharmacist(
        String(rejectingOrder._id),
        String(farmaciaIdEfetiva),
        motivo,
      );
      setRejectingOrder(null);
      setRejectReason('');
      await fetchOrders({ silent: true });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao cancelar pedido');
    } finally {
      setSubmittingOrderAction(false);
    }
  };

  const openSupportTicket = async (ticketId) => {
    try {
      const res = await supportService.getById(ticketId);
      const ticket = res.data?.data?.ticket;
      if (!ticket) return;
      setSelectedSupportTicket(ticket);
      setSupportMessages(Array.isArray(ticket.mensagens) ? ticket.mensagens : []);
      setSupportMessageText('');
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao abrir chat de suporte');
    }
  };

  const sendSupportMessage = async () => {
    const texto = supportMessageText.trim();
    if (!texto || !selectedSupportTicket?._id || supportSending) return;

    const ticketId = String(selectedSupportTicket._id);
    const optimistic = {
      ...normalizeSupportMessage({
        tipo_remetente: 'farmaceutico',
        texto,
        enviado_em: new Date().toISOString(),
        id_remetente: userId,
      }),
      _optimistic: true,
    };
    optimisticKeyRef.current = messageKey(optimistic);

    setSupportMessageText('');
    setSupportMessages((prev) => replaceOptimisticOrAppend(prev, optimistic));
    setSelectedSupportTicket((prev) =>
      prev ? mergeTicketWithMessage(prev, optimistic) : prev,
    );
    setSupportTickets((prev) => {
      const next = prev.map((t) =>
        String(t._id) === ticketId ? mergeTicketWithMessage(t, optimistic) : t,
      );
      supportTicketsRef.current = next;
      applyDashboardStats(next);
      return next;
    });

    try {
      setSupportSending(true);
      await supportService.sendMessage(ticketId, { texto });
      void fetchSupportTickets({ silent: true });
    } catch (err) {
      optimisticKeyRef.current = null;
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao enviar mensagem no chat');
      setSupportMessages((prev) =>
        prev.filter((m) => messageKey(m) !== messageKey(optimistic)),
      );
      await openSupportTicket(ticketId);
    } finally {
      setSupportSending(false);
    }
  };

  const handleCloseSupportTicket = async () => {
    if (!selectedSupportTicket?._id || supportClosing) return;
    try {
      setSupportClosing(true);
      setError(null);
      await supportService.closeTicket(selectedSupportTicket._id);
      setSelectedSupportTicket(null);
      setSupportMessages([]);
      setSupportMessageText('');
      await fetchSupportTickets({ silent: true });
      applyDashboardStats();
      useUiStore.getState().addNotification({
        type: 'success',
        title: 'Atendimento encerrado',
        message: 'O ticket foi fechado com sucesso.',
        duration: 5000,
      });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Não foi possível encerrar o atendimento');
    } finally {
      setSupportClosing(false);
    }
  };

  const buildSngpcForm = (receita) => {
    const order = linkedOrderFromPrescription(receita, orders);
    const item = controlledItemForPrescription(receita, order);
    const batches = availableBatchesForItem(item);
    const committed = committedBatchNumbers(orders, {
      excludeOrderId: order?._id,
      productId: objectIdValue(item?.id_produto),
    });
    const livres = batches.filter(
      (b) => !committed.has(String(b.batchNumber).trim()),
    );
    const ocr = receita?.dados_ocr || {};
    return {
      productId: objectIdValue(item?.id_produto),
      doctorName: ocr?.nome_medico || '',
      doctorCrm: ocr?.crm || '',
      doctorUf: String(ocr?.uf_crm || '').toUpperCase(),
      digitalSignatureCode: digitalSignatureCodeFromPrescription(receita),
      selectedBatchNumber: (livres[0] || batches[0])?.batchNumber || '',
    };
  };

  const openValidationModal = (receita, intencaoInicial = null) => {
    const linkedOrder = linkedOrderFromPrescription(receita, orders);
    const controlledItem = controlledItemForPrescription(receita, linkedOrder);
    const batches = availableBatchesForItem(controlledItem);
    const requiresControlledFlow = prescriptionRequiresControlledFlow(
      receita,
      linkedOrder,
      controlledItem,
    );
    const hasRegisteredSngpc =
      Boolean(linkedOrder?.sngpcData?.validatedAt) ||
      Boolean(receita?._id && sngpcReadyByPrescription[receita._id]);
    const shouldAutoReject =
      ['Pendente', 'Em Análise'].includes(receita?.status) &&
      requiresControlledFlow &&
      !hasRegisteredSngpc &&
      (!linkedOrder || !controlledItem || batches.length === 0);

    setSelectedReceita(receita);
    setObservacoes(shouldAutoReject ? NO_CONTROLLED_BATCH_CLIENT_REASON : receita?.observacoes || '');
    setIntencao(null);
    setSngpcForm(buildSngpcForm(receita));
    setRejectingPrescription(false);
    setPrescriptionRejectReason('');

    if (shouldAutoReject) {
      setError(NO_CONTROLLED_BATCH_PHARMACY_REASON);
      setAutoRejectingPrescriptionId(receita?._id || null);
      setTimeout(() => {
        handleValidation(receita._id, false, NO_CONTROLLED_BATCH_CLIENT_REASON)
          .finally(() => setAutoRejectingPrescriptionId(null));
      }, 0);
    }
  };

  const closeValidationModal = () => {
    setSelectedReceita(null);
    setObservacoes('');
    setIntencao(null);
    setRejectingPrescription(false);
    setPrescriptionRejectReason('');
  };

  const confirmSngpcForSelectedPrescription = async () => {
    if (!selectedReceita || sngpcSaving) return;
    const order = linkedOrderFromPrescription(selectedReceita, orders);
    if (!order?._id) {
      setError('Pedido vinculado à receita não encontrado.');
      return;
    }
    if (!farmaciaIdEfetiva) {
      setError('Farmácia vinculada não encontrada.');
      return;
    }

    try {
      setSngpcSaving(true);
      setError(null);
      const res = await orderService.validateSngpc(order._id, {
        pharmacyId: String(farmaciaIdEfetiva),
        ...sngpcForm,
        doctorUf: String(sngpcForm.doctorUf || '').toUpperCase(),
        buyerRg: selectedReceita?.id_usuario?.rg || '',
      });
      const pedido = res.data?.data?.pedido;
      setSngpcReadyByPrescription((prev) => ({
        ...prev,
        [selectedReceita._id]: true,
      }));
      setSelectedReceita((prev) => {
        if (!prev) return prev;
        const key = prev.id_pedido_utilizado ? 'id_pedido_utilizado' : 'id_pedido_vinculado';
        return pedido ? { ...prev, [key]: pedido } : prev;
      });
      await fetchOrders({ silent: true });
    } catch (err) {
      const apiMsg = err.response?.data?.message || err.message;
      setError(apiMsg || 'Erro ao registrar dispensação');
    } finally {
      setSngpcSaving(false);
    }
  };

  const rejectSelectedPrescription = async () => {
    const motivo = prescriptionRejectReason.trim();
    if (!motivo) {
      setError('Informe o motivo da rejeição.');
      return;
    }
    setObservacoes(motivo);
    setRejectingPrescription(false);
    await handleValidation(selectedReceita._id, false, motivo);
  };

  const handleValidation = async (validationId, approved, forcedObservacoes = null) => {
    try {
      const obs = forcedObservacoes != null ? forcedObservacoes.trim() : observacoes.trim();
      if (!approved && !obs) {
        setError('Informe o motivo da rejeição.');
        return;
      }

      setValidatingId(validationId);
      await prescriptionService.validate(validationId, {
        aprovado: approved,
        observacoes: obs || (approved ? 'Receita aprovada pelo farmacêutico.' : ''),
        validade: approved
          ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString()
          : undefined,
      });

      // Atualiza localmente sem recarregar tudo
      setPendingValidations((prev) =>
        prev.map((r) =>
          r._id === validationId
            ? {
                ...r,
                status: approved ? 'Aprovada' : 'Rejeitada',
                observacoes: obs,
              }
            : r,
        ),
      );
      closeValidationModal();
    } catch (err) {
      const apiMsg = err.response?.data?.message;
      console.error('Erro ao validar:', err);
      setError(apiMsg || err.message || 'Erro ao processar validação');
    } finally {
      setValidatingId(null);
    }
  };

  const abrirChatDaReceita = async (prescriptionId, fallbackData = {}) => {
    try {
      const effectiveId =
        prescriptionId ||
        fallbackData?.prescriptionId ||
        fallbackData?._id ||
        null;
      if (!effectiveId) {
        setError('Não foi possível identificar a receita do chat ao vivo.');
        return;
      }

      const res = await prescriptionService.getForChat(effectiveId);
      const receita = res.data?.data?.receita;
      if (receita) {
        setActiveChat({
          prescriptionId: receita._id,
          chatSessaoId: receita.chat_sessao_id || fallbackData.chat_sessao_id,
          urlImagem: receita.url_imagem_publica || fallbackData.url_imagem_publica,
          usuario: receita.id_usuario || fallbackData.usuario,
        });
      }
    } catch (err) {
      const apiMsg = err.response?.data?.message;
      setError(apiMsg || err.message || 'Erro ao abrir o chat');
    }
  };

  const aceitarChatRequest = async (request) => {
    await abrirChatDaReceita(request.prescriptionId, request);
    setChatRequests((prev) =>
      prev.filter((r) => r.prescriptionId !== request.prescriptionId),
    );
  };

  const selectedLinkedOrder = selectedReceita
    ? linkedOrderFromPrescription(selectedReceita, orders)
    : null;
  const selectedControlledItem = selectedReceita
    ? controlledItemForPrescription(selectedReceita, selectedLinkedOrder)
    : null;
  const selectedProductFromPrescription = selectedReceita
    ? productFromPrescription(selectedReceita)
    : null;
  const selectedBatches = selectedControlledItem
    ? availableBatchesForItem(selectedControlledItem)
    : availableBatchesForItem({ id_produto: selectedProductFromPrescription });
  const selectedCommittedBatches = committedBatchNumbers(orders, {
    excludeOrderId: selectedLinkedOrder?._id,
    productId:
      objectIdValue(selectedControlledItem?.id_produto) ||
      objectIdValue(selectedProductFromPrescription?._id),
  });
  // Lotes oferecidos: tira os já escolhidos por outro pedido ativo, mas mantém
  // o lote atualmente selecionado nesta tela.
  const selectableBatches = selectedBatches.filter(
    (b) =>
      !selectedCommittedBatches.has(String(b.batchNumber).trim()) ||
      String(b.batchNumber).trim() === String(sngpcForm.selectedBatchNumber).trim(),
  );
  const selectedRequiresControlledFlow = selectedReceita
    ? prescriptionRequiresControlledFlow(
        selectedReceita,
        selectedLinkedOrder,
        selectedControlledItem,
      )
    : false;
  const selectedHasSngpcRegistered = Boolean(
    selectedLinkedOrder?.sngpcData?.validatedAt ||
      (selectedReceita?._id && sngpcReadyByPrescription[selectedReceita._id]),
  );
  const selectedNeedsSngpc = Boolean(
    selectedRequiresControlledFlow &&
      selectedLinkedOrder &&
      selectedControlledItem &&
      (selectedBatches.length > 0 || selectedHasSngpcRegistered),
  );
  const selectedMissingControlledBatch = Boolean(
    selectedReceita &&
      selectedRequiresControlledFlow &&
      !selectedHasSngpcRegistered &&
      !selectedNeedsSngpc,
  );
  const selectedSngpcReady =
    !selectedRequiresControlledFlow ||
    (selectedNeedsSngpc && selectedHasSngpcRegistered);
  const selectedPrescriptionFileUrl = normalizeFileUrl(
    selectedReceita?.url_imagem_publica || selectedReceita?.url_arquivo,
  );
  const selectedPrescriptionIsPdf =
    String(selectedReceita?.tipo_arquivo || selectedPrescriptionFileUrl)
      .toLowerCase()
      .includes('pdf');
  const selectedPrescriptionIsXml =
    String(selectedReceita?.tipo_arquivo || selectedPrescriptionFileUrl)
      .toLowerCase()
      .includes('xml');
  const openedPrescriptionKind = String(imagemAberta || '').toLowerCase();
  const openedPrescriptionIsPdf =
    openedPrescriptionKind.endsWith('.pdf') ||
    openedPrescriptionKind.includes('application/pdf');
  const openedPrescriptionIsXml =
    openedPrescriptionKind.endsWith('.xml') ||
    openedPrescriptionKind.includes('application/xml') ||
    openedPrescriptionKind.includes('text/xml');

  if (loading) {
    return (
      <div className="pharmacist-dashboard">
        <SkeletonHeader />
        <SkeletonStatsGrid />
        <SkeletonContent />
      </div>
    );
  }

  return (
    <div className="pharmacist-dashboard">
      <header className="dashboard-header">
        <div>
          <h1>🧑‍⚕️ Dashboard do Farmacêutico</h1>
          {error && (
            <div className="error-banner">
              <span>⚠️ {error}</span>
              <button onClick={fetchData} className="retry-btn">Tentar Novamente</button>
            </div>
          )}
        </div>
        <div className="status-indicator flex items-center">
          <PharmacistPresenceToggle />
        </div>
      </header>

      {/* Banner de chat ao vivo solicitado pelo paciente */}
      {chatRequests.length > 0 && (
        <div className="space-y-2 mb-4">
          {chatRequests.map((req) => (
            <div
              key={req.prescriptionId}
              className="bg-green-500 text-white rounded-xl p-4 flex items-center gap-3 shadow-lg animate-pulse"
            >
              <MessageCircle className="w-6 h-6 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">
                  💬 Paciente aguarda chat ao vivo
                </p>
                <p className="text-xs opacity-90 truncate">
                  {req.usuario?.nome || 'Cliente'}
                  {req.usuario?.email ? ` — ${req.usuario.email}` : ''}
                </p>
              </div>
              <button
                onClick={() => aceitarChatRequest(req)}
                className="px-4 py-2 bg-white text-green-700 rounded-lg text-sm font-bold hover:bg-green-50"
              >
                Atender chat
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="stats-grid">
        <StatCard
          title="Validações Pendentes"
          value={stats.validacoes_pendentes}
          icon="⏳"
          color="orange"
        />
        <StatCard
          title="Alertas Ativos"
          value={stats.alertas_ativos}
          icon="🚨"
          color="red"
        />
        <StatCard
          title="Receitas Respondidas Hoje"
          value={stats.receitas_validadas_hoje}
          icon="✓"
          color="green"
        />
        <StatCard
          title="Tempo Médio de Resposta"
          value={formatMediaRespostaDisplay(stats)}
          icon="⏱️"
          color="blue"
        />
      </div>

      {/* Abas de navegação */}
      <div className="mt-6 border-b border-gray-200">
        <div className="flex gap-8">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'dashboard'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab('receitas')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'receitas'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📋 Gerenciar Receitas
          </button>
          <button
            onClick={() => setActiveTab('chats')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'chats'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            💬 Chats da Farmácia
          </button>
          <button
            onClick={() => setActiveTab('pedidos')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'pedidos'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📦 Pedidos
          </button>
          <button
            onClick={() => setActiveTab('endereco')}
            className={`pb-4 px-2 font-medium transition-colors ${
              activeTab === 'endereco'
                ? 'border-b-2 border-primary text-primary'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📍 Endereço da loja
          </button>
        </div>
      </div>

      {/* Conteúdo das abas */}
      {activeTab === 'dashboard' ? (
        <div className="dashboard-content mt-6">
          <section className="validations-section">
            <h2>📋 Receitas Recebidas</h2>

            {/* Filtros por status */}
            <div className="flex flex-wrap gap-2 mb-4">
              {STATUS_OPCOES.map((op) => (
                <button
                  key={op.valor}
                  onClick={() => setFiltroStatus(op.valor)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    filtroStatus === op.valor
                      ? `${op.cor} ring-2 ring-offset-1 ring-current`
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={buscaReceitas}
                onChange={(e) => setBuscaReceitas(e.target.value)}
                placeholder="Pesquisar receitas por cliente, e-mail, arquivo, status..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {receitasFiltradas.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📋</div>
                <p>Nenhuma receita encontrada</p>
                <small>
                  {buscaReceitas.trim()
                    ? 'Tente ajustar o termo de pesquisa.'
                    : filtroStatus === 'todos'
                    ? 'Aguardando novas receitas dos pacientes.'
                    : 'Tente outro filtro ou aguarde novas receitas.'}
                </small>
              </div>
            ) : (
              <div className="validations-list">
                {receitasFiltradas.map(validation => (
                  <ValidationCard
                    key={validation._id}
                    validation={validation}
                    onOpen={openValidationModal}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="alerts-section">
            <h2>🚨 Alertas Recentes</h2>
            <div className="mb-4">
              <input
                type="text"
                value={buscaAlertas}
                onChange={(e) => setBuscaAlertas(e.target.value)}
                placeholder="Pesquisar por suporte, assunto, cliente, receita, status..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {suporteAlertasFiltrados.length === 0 &&
            liveChatAlertsFiltrados.length === 0 &&
            alertsFiltrados.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">✨</div>
                <p>Nenhum alerta encontrado</p>
                <small>
                  {buscaAlertas.trim()
                    ? 'Tente ajustar o termo de pesquisa.'
                    : 'Sistema funcionando perfeitamente.'}
                </small>
              </div>
            ) : (
              <div className="alerts-list space-y-3">
                {suporteAlertasFiltrados.map((ticket) => (
                  <div key={`suporte-${ticket._id}`} className="alert-card">
                    <div
                      className="left-border"
                      style={{ borderColor: '#0ea5e9' }}
                    />
                    <div className="content">
                      <h4>Dúvida de cliente (suporte)</h4>
                      <p className="text-sm font-medium text-gray-900">
                        {ticket.assunto || 'Ticket sem assunto'}
                      </p>
                      <p className="text-xs text-gray-600">
                        Cliente: {ticket.id_usuario?.nome || 'Não informado'}
                        {ticket.id_usuario?.email ? ` (${ticket.id_usuario.email})` : ''}
                      </p>
                      <span className="time text-xs">
                        Status: {ticket.status || '—'}
                        {ticket.categoria ? ` · ${ticket.categoria}` : ''}
                      </span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveTab('chats');
                            openSupportTicket(ticket._id);
                          }}
                          className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700"
                        >
                          Abrir chat
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {liveChatAlertsFiltrados.map((receita) => (
                  <div key={receita._id} className="alert-card">
                    <div
                      className="left-border"
                      style={{ borderColor: '#10b981' }}
                    />
                    <div className="content">
                      <h4>Chat ao vivo aguardando atendimento</h4>
                      <p>
                        Cliente: {receita?.id_usuario?.nome || 'Não informado'}
                        {receita?.id_usuario?.email
                          ? ` (${receita.id_usuario.email})`
                          : ''}
                      </p>
                      <span className="time">
                        Receita #{(receita?._id || '').toString().slice(-6)} ·{' '}
                        {receita?.status || 'Pendente'}
                      </span>
                      <div className="mt-2">
                        <button
                          onClick={() => abrirChatDaReceita(receita._id, { usuario: receita?.id_usuario })}
                          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700"
                        >
                          Entrar no chat ao vivo
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {alertsFiltrados.map((alert) => (
                  <AlertCard key={alert._id} alert={alert} />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : activeTab === 'receitas' ? (
        <div className="mt-6">
          <ManageReceitasTab id_farmacia={user?.dados_farmaceutico?.id_farmacia || user?.id_farmacia} />
        </div>
      ) : activeTab === 'chats' ? (
        <div className="mt-6 bg-white border border-gray-100 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Chats da farmácia</h2>
            <button
              type="button"
              onClick={() => fetchSupportTickets({ silent: false })}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Atualizar
            </button>
          </div>

          {supportLoading ? (
            <p className="text-sm text-gray-500">Carregando chats...</p>
          ) : supportTickets.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
              Nenhum chat aberto para seu atendimento no momento.
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-3">Chats para responder</h3>
                {supportTicketsToAnswer.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                    Nenhum chat aguardando resposta.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supportTicketsToAnswer.map((ticket) => (
                      <SupportTicketCard
                        key={ticket._id}
                        ticket={ticket}
                        onOpen={openSupportTicket}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-800 mb-3">Atendimentos passados</h3>
                {supportTicketsPast.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                    Nenhum atendimento encerrado ainda.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supportTicketsPast.map((ticket) => (
                      <SupportTicketCard
                        key={ticket._id}
                        ticket={ticket}
                        onOpen={openSupportTicket}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'endereco' ? (
        <div className="mt-6">
          <FarmaciaEnderecoPanel
            pharmacyId={farmaciaIdEfetiva}
            resolvingPharmacy={loading && !farmaciaIdEfetiva}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="bg-white border border-gray-100 rounded-xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">
              Pedidos aguardando ação da farmácia
            </h2>
            <button
              type="button"
              onClick={() => fetchOrders()}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Atualizar
            </button>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Após pagamento concluído, confirme que o pedido está separado para liberar a entrega.
            Se houver SNGPC, encerre com o código após registrar a baixa digital do lote.
          </p>

          {ordersLoading ? (
            <p className="text-sm text-gray-500">Carregando pedidos...</p>
          ) : orders.length === 0 ? (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
              Nenhum pedido pendente de confirmação no momento.
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                {pedidosPendentesAprovacao.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                    Nenhum pedido aguardando aprovação farmacêutica.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {[...pedidosPendentesAprovacao]
                      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                      .map((order) => {
                      const waiting = formatOrderWaiting(order.createdAt);
                      return (
                      <div
                        key={order._id}
                        className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Pedido #{String(order._id || '').slice(-8).toUpperCase()}
                            </p>
                            <p className="text-xs text-gray-500">
                              Cliente: {order.id_usuario?.nome || 'Não informado'}
                              {order.id_usuario?.telefone
                                ? ` · ${order.id_usuario.telefone}`
                                : ''}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-primary">
                            R$ {Number(order.total || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-2 items-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${waiting.tone}`}>
                            {waiting.label}
                          </span>
                          {order.tipo_entrega && (
                            <span className="text-xs text-gray-600">
                              Tipo: <strong className="text-gray-800">{order.tipo_entrega}</strong>
                            </span>
                          )}
                        </div>

                        {String(order?.status || '').trim() === 'aguardando_pagamento' &&
                          String(order?.status_pagamento || '').trim() === 'aprovado' && (
                          <p className="text-xs text-teal-900 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2">
                            Pagamento concluído. Confirme que o pedido está pronto para entrega.
                          </p>
                        )}

                        {pedidoAguardandoValidacaoDigital(order) ? (
                          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            Valide a receita em Gerenciar Receitas antes de confirmar ou cancelar o pedido.
                          </p>
                        ) : String(order?.status || '').trim() ===
                          'aguardando_confirmacao_receita_farmacia' ? (
                          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            O entregador confirmou o código com o cliente. Registre a baixa digital do lote e digite o
                            mesmo código de 6 dígitos para encerrar o pedido.
                          </p>
                        ) : null}

                        {['em_processamento', 'confirmado'].includes(String(order?.status || '').trim()) &&
                          !isRetiradaOuDriveThru(order) && (
                          <>
                            {!order.separado_em ? (
                              <p className="text-xs text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                                Pagamento concluído. Marque o pedido como <strong>separado / pronto para retirada</strong> para liberar a entrega.
                              </p>
                            ) : !order.entregador?.nome ? (
                              <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                                Pedido separado. Aguardando um entregador aceitar a corrida.
                              </p>
                            ) : (
                              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                Entregador <strong>{order.entregador.nome}</strong> a caminho da farmácia. Confira o
                                <strong> código de 8 dígitos</strong> que ele apresentar para liberar a coleta.
                              </p>
                            )}
                          </>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {(order.itens || []).slice(0, 4).map((item, idx) => (
                            <span
                              key={`${item.id_produto || idx}-${idx}`}
                              className="text-xs bg-gray-100 px-2 py-1 rounded"
                            >
                              {item.nome_produto || item.nome || `Item ${idx + 1}`} x{item.quantidade || 1}
                            </span>
                          ))}
                        </div>

                        <OrderProgressMini order={order} />

                        <div className="flex flex-col gap-3">
                          {['em_processamento', 'confirmado'].includes(String(order?.status || '').trim()) &&
                            !isRetiradaOuDriveThru(order) &&
                            !order.separado_em && (
                            <div className="flex justify-end">
                              <button
                                type="button"
                                onClick={() => marcarSeparado(order._id)}
                                className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                                disabled={submittingOrderAction}
                              >
                                Marcar separado / pronto para retirada
                              </button>
                            </div>
                          )}
                          {['em_processamento', 'confirmado'].includes(String(order?.status || '').trim()) &&
                            !isRetiradaOuDriveThru(order) &&
                            order.separado_em &&
                            order.entregador?.nome && (
                            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center sm:justify-end">
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={8}
                                placeholder="Código de 8 dígitos do entregador"
                                value={codigoColetaPorPedido[order._id] ?? ''}
                                onChange={(e) =>
                                  setCodigoColetaPorPedido((prev) => ({
                                    ...prev,
                                    [order._id]: e.target.value.replace(/\D/g, '').slice(0, 8),
                                  }))
                                }
                                className="px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono tracking-widest min-w-[12rem] max-w-[14rem]"
                              />
                              <button
                                type="button"
                                onClick={() => confirmarColeta(order._id)}
                                className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-60"
                                disabled={submittingOrderAction}
                              >
                                Liberar coleta (pedido a caminho)
                              </button>
                            </div>
                          )}
                          {!pedidoAguardandoValidacaoDigital(order) &&
                            String(order?.status || '').trim() ===
                            'aguardando_confirmacao_receita_farmacia' && (
                            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center sm:justify-end">
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="Código dado pelo cliente ao entregador"
                                value={codigoReceitaRetornoPorPedido[order._id] ?? ''}
                                onChange={(e) =>
                                  setCodigoReceitaRetornoPorPedido((prev) => ({
                                    ...prev,
                                    [order._id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                                  }))
                                }
                                className="px-3 py-2 border border-amber-300 rounded-lg text-sm font-mono tracking-widest min-w-[10rem] max-w-[12rem]"
                              />
                              <button
                                type="button"
                                onClick={() => confirmarReceitaRetornoNaFarmacia(order._id)}
                                className="px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                                disabled={submittingOrderAction}
                              >
                                Confirmar receita na farmácia
                              </button>
                            </div>
                          )}
                          {isRetiradaOuDriveThru(order) &&
                            String(order?.status || '').trim() === 'em_processamento' && (
                            <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center sm:justify-end">
                              <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="Código no celular do cliente"
                                value={codigoRetiradaPorPedido[order._id] ?? ''}
                                onChange={(e) =>
                                  setCodigoRetiradaPorPedido((prev) => ({
                                    ...prev,
                                    [order._id]: e.target.value.replace(/\D/g, '').slice(0, 6),
                                  }))
                                }
                                className="px-3 py-2 border border-emerald-200 rounded-lg text-sm font-mono tracking-widest min-w-[10rem] max-w-[12rem]"
                              />
                              <button
                                type="button"
                                onClick={() => marcarRetiradaEntregue(order._id)}
                                className="px-3 py-2 bg-white border border-emerald-600 text-emerald-900 rounded-lg text-sm font-medium hover:bg-emerald-50"
                                disabled={submittingOrderAction}
                              >
                                Confirmar retirada com código
                              </button>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2 justify-end">
                            {!pedidoAguardandoValidacaoDigital(order) && (
                              <button
                                onClick={() => {
                                  setRejectingOrder(order);
                                  setRejectReason('');
                                }}
                                className="px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-100"
                                disabled={submittingOrderAction}
                              >
                                Cancelar pedido
                              </button>
                            )}
                            {String(order?.status || '').trim() !==
                                'aguardando_confirmacao_receita_farmacia' &&
                              String(order?.status || '').trim() === 'aguardando_pagamento' &&
                              String(order?.status_pagamento || '').trim() === 'aprovado' && (
                              <button
                                type="button"
                                onClick={() => aprovarPedido(order._id)}
                                className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-gray-600 disabled:opacity-70 disabled:hover:bg-gray-600"
                                disabled={submittingOrderAction}
                              >
                                Pedido pronto para entrega
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                )}
              </div>
            </div>
          )}
          </div>

          <div className="bg-white border border-gray-100 rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-gray-900">Histórico de Pedidos</h2>
              <input
                type="text"
                value={ordersSearch}
                onChange={(e) => setOrdersSearch(e.target.value)}
                placeholder="Pesquisar por pedido, cliente, item, status..."
                className="w-full max-w-md px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            {ordersLoading ? (
              <p className="text-sm text-gray-500">Carregando histórico...</p>
            ) : historicoPedidosFiltrado.length === 0 ? (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4">
                {termoPedidos
                  ? 'Nenhum pedido encontrado para esse termo.'
                  : 'Nenhum pedido no histórico ainda.'}
              </div>
            ) : (
              <div className="space-y-3">
                {[...historicoPedidosFiltrado]
                  .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                  .map((order) => {
                    const resolvedAt =
                      getOrderStatusChangedAt(order, order.status) ||
                      order.entregue_em ||
                      order.cancelado_em ||
                      order.updatedAt ||
                      null;
                    const waiting = formatOrderWaiting(order.createdAt, resolvedAt);
                    const cancelReason =
                      order.status === 'cancelado' || order.status === 'rejeitado'
                        ? getOrderCancellationReason(order)
                        : null;
                    return (
                      <div
                        key={order._id}
                        className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              Pedido #{String(order._id || '').slice(-8).toUpperCase()}
                            </p>
                            <p className="text-xs text-gray-500">
                              Cliente: {order.id_usuario?.nome || 'Não informado'}
                              {order.id_usuario?.telefone
                                ? ` · ${order.id_usuario.telefone}`
                                : ''}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-primary">
                            R$ {Number(order.total || 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                              {String(order.status || '—').replace(/_/g, ' ')}
                            </span>
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${waiting.tone}`}>
                              {waiting.label}
                            </span>
                          </div>
                          <OrderProgressMini order={order} />
                          {cancelReason && (
                            <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-2">
                              <span className="font-semibold text-gray-700">Motivo:</span> {cancelReason}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="refresh-indicator">
        ↻ Próxima atualização em {Math.round(REFRESH_INTERVAL / 1000)}s
      </div>

      {/* Modal de validação detalhada da receita */}
      <Modal
        isOpen={!!selectedReceita}
        onClose={closeValidationModal}
        title={
          selectedReceita?.status === 'Aprovada'
            ? 'Receita aprovada — alterar status'
            : selectedReceita?.status === 'Rejeitada'
              ? 'Receita rejeitada — alterar status'
              : 'Validar Receita'
        }
        size="full"
      >
        {selectedReceita && (
          <div className="flex h-full min-h-0 flex-col gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <p>
                <strong>Cliente:</strong>{' '}
                {selectedReceita.id_usuario?.nome || '—'}
                {selectedReceita.id_usuario?.email
                  ? ` (${selectedReceita.id_usuario.email})`
                  : ''}
              </p>
              {selectedReceita.id_usuario?.telefone && (
                <p>
                  <strong>Telefone:</strong>{' '}
                  {selectedReceita.id_usuario.telefone}
                </p>
              )}
              <p>
                <strong>Status atual:</strong> {selectedReceita.status}
              </p>
              <p>
                <strong>Enviada em:</strong>{' '}
                {selectedReceita.createdAt
                  ? new Date(selectedReceita.createdAt).toLocaleString('pt-BR')
                  : '—'}
              </p>
              {selectedReceita.modo_validacao === 'chat_ao_vivo' && (
                <p className="text-green-700 font-semibold">
                  💬 Paciente solicitou chat ao vivo
                </p>
              )}
            </div>

            <div className="grid min-h-[620px] flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(460px,540px)]">
              <div className="flex min-h-0 flex-col rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Documento da prescrição</p>
                    <p className="text-xs text-gray-500 truncate">
                      {selectedReceita.nome_arquivo || 'Arquivo da receita'}
                    </p>
                  </div>
                  {selectedPrescriptionFileUrl && (
                    <button
                      type="button"
                      onClick={() => setImagemAberta(selectedPrescriptionFileUrl)}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4" />
                      Abrir
                    </button>
                  )}
                </div>
                <div className="min-h-[460px] flex-1 rounded-lg border border-gray-200 bg-white overflow-hidden flex items-center justify-center">
                  {selectedPrescriptionFileUrl ? (
                    selectedPrescriptionIsPdf ? (
                      <iframe
                        src={selectedPrescriptionFileUrl}
                        className="w-full h-full"
                        title="Prescrição em PDF"
                      />
                    ) : selectedPrescriptionIsXml ? (
                      <div className="text-center px-6">
                        <FileText className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-gray-800">Receita digital em XML</p>
                        <button
                          type="button"
                          onClick={() => setImagemAberta(selectedPrescriptionFileUrl)}
                          className="mt-3 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                        >
                          Abrir XML
                        </button>
                      </div>
                    ) : (
                      <img
                        src={selectedPrescriptionFileUrl}
                        alt="Prescrição"
                        className="w-full h-full object-contain"
                      />
                    )
                  ) : (
                    <div className="text-center text-sm text-gray-500 px-6">
                      <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      Documento não disponível
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-emerald-100 bg-white p-4 space-y-4 overflow-y-auto">
                <div>
                  <h3 className="font-bold text-gray-900">Registro de Dispensação ANVISA / SNGPC</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Receita digital ICP-Brasil validada antes da decisão farmacêutica.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-emerald-800">
                    Entra: tarja preta, controle especial e antimicrobianos.
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600">
                    Não entra: tarja vermelha comum, MIPs e genérico sem ativo controlado.
                  </div>
                </div>

                {selectedNeedsSngpc ? (
                  <>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Comprador</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <ReadonlySngpcField label="Nome completo" value={selectedReceita.id_usuario?.nome || selectedLinkedOrder?.id_usuario?.nome || '—'} />
                        <ReadonlySngpcField label="CPF" value={selectedReceita.id_usuario?.cpf || '—'} />
                        <ReadonlySngpcField
                          label="RG + órgão emissor"
                          value={selectedReceita.id_usuario?.rg || selectedLinkedOrder?.id_usuario?.rg || '—'}
                        />
                        <ReadonlySngpcField
                          label="Telefone"
                          value={selectedReceita.id_usuario?.telefone || selectedLinkedOrder?.id_usuario?.telefone || '—'}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                        Paciente {selectedReceita.receita_de_terceiro ? '(receita de terceiro)' : '(mesmo do comprador)'}
                      </p>
                      {selectedReceita.receita_de_terceiro ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <ReadonlySngpcField label="Nome completo" value={selectedReceita.paciente?.nome || '—'} />
                          <ReadonlySngpcField label="CPF" value={selectedReceita.paciente?.cpf || '—'} />
                          <ReadonlySngpcField label="RG" value={selectedReceita.paciente?.rg || '—'} />
                        </div>
                      ) : (
                        <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                          O comprador é o próprio paciente.
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Prescritor</p>
                      <div className="space-y-2">
                        <SngpcInput
                          label="Nome do médico"
                          value={sngpcForm.doctorName}
                          placeholder={selectedReceita.dados_ocr?.nome_medico || 'Dr. Marcelo Andrade'}
                          onChange={(value) => setSngpcForm((prev) => ({ ...prev, doctorName: value }))}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <SngpcInput
                            label="CRM"
                            value={sngpcForm.doctorCrm}
                            placeholder={selectedReceita.dados_ocr?.crm || '18452'}
                            onChange={(value) => setSngpcForm((prev) => ({ ...prev, doctorCrm: value }))}
                          />
                          <div>
                            <label className="text-xs text-gray-500">UF do conselho</label>
                            <select
                              value={sngpcForm.doctorUf}
                              onChange={(e) => setSngpcForm((prev) => ({ ...prev, doctorUf: e.target.value }))}
                              className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                            >
                              <option value="">{selectedReceita.dados_ocr?.uf_crm || 'UF'}</option>
                              {UF_OPTIONS.map((uf) => (
                                <option key={uf} value={uf}>{uf}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <SngpcInput
                          label="Código da assinatura digital ICP-Brasil"
                          value={sngpcForm.digitalSignatureCode}
                          placeholder={(selectedReceita.hash_arquivo || '').slice(0, 32) || 'Hash ICP-Brasil'}
                          onChange={(value) => setSngpcForm((prev) => ({ ...prev, digitalSignatureCode: value }))}
                        />
                      </div>
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Medicamento e lote</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <ReadonlySngpcField
                          label="Medicamento"
                          value={
                            productFromOrderItem(selectedControlledItem)?.nome ||
                            selectedControlledItem?.nome_produto ||
                            selectedReceita.dados_ocr?.principio_ativo ||
                            '—'
                          }
                        />
                        <ReadonlySngpcField
                          label="Quantidade de caixas"
                          value={String(selectedControlledItem?.quantidade || 1)}
                        />
                      </div>
                      <label className="block text-xs text-gray-500 mt-2">Número do lote selecionado</label>
                      <select
                        value={sngpcForm.selectedBatchNumber}
                        onChange={(e) => setSngpcForm((prev) => ({ ...prev, selectedBatchNumber: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                      >
                        <option value="">Selecione um lote</option>
                        {selectableBatches.map((batch) => (
                          <option key={batch.batchNumber} value={batch.batchNumber}>
                            {batch.batchNumber} · validade {formatBatchDate(batch.expirationDate)} · {batch.quantity} un.
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-gray-500 mt-2">
                        Regra FEFO: vencimento mais próximo primeiro.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={confirmSngpcForSelectedPrescription}
                      disabled={
                        sngpcSaving ||
                        selectedSngpcReady ||
                        !sngpcForm.doctorName ||
                        !sngpcForm.doctorCrm ||
                        !sngpcForm.doctorUf ||
                        !sngpcForm.digitalSignatureCode ||
                        !sngpcForm.selectedBatchNumber
                      }
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <ClipboardList className="w-4 h-4" />
                      {selectedSngpcReady
                        ? 'Rastreabilidade registrada'
                        : sngpcSaving
                          ? 'Registrando...'
                          : 'Confirmar Dispensação e Rastreabilidade'}
                    </button>
                  </>
                ) : selectedRequiresControlledFlow ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
                    <p>{NO_CONTROLLED_BATCH_PHARMACY_REASON}</p>
                    {['Pendente', 'Em Análise'].includes(selectedReceita.status) && (
                      <p className="font-semibold text-gray-800">
                        {autoRejectingPrescriptionId === selectedReceita._id
                          ? 'Rejeição automática em andamento.'
                          : 'A receita será rejeitada automaticamente.'}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                    Esta receita não exige registro ANVISA/SNGPC.
                  </div>
                )}
              </div>
            </div>

            {/* Aviso de re-validação */}
            {(selectedReceita.status === 'Aprovada' ||
              selectedReceita.status === 'Rejeitada') && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded p-2">
                Esta receita já foi {selectedReceita.status.toLowerCase()} e está
                bloqueada para alteração.
              </div>
            )}

            {/* Campo de observações */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações para o usuário
                <span className="text-red-500"> * (obrigatório na rejeição)</span>
              </label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Ex: assinatura digital inválida ou CRM divergente no arquivo."
                className="w-full border rounded-lg p-2 text-sm resize-none h-32 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Botões de ação — variam conforme status atual e intenção */}
            {['Pendente', 'Em Análise'].includes(selectedReceita.status) ? (
              <div className="space-y-3">
                {selectedNeedsSngpc && !selectedSngpcReady && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Registre a dispensação e o lote antes de aprovar ou rejeitar a receita.
                  </p>
                )}
                {selectedMissingControlledBatch && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {NO_CONTROLLED_BATCH_PHARMACY_REASON}
                  </p>
                )}
                <div className="flex gap-3 justify-end flex-wrap">
                  <button
                    onClick={() => handleValidation(selectedReceita._id, true)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50 inline-flex items-center gap-2"
                    disabled={validatingId === selectedReceita._id || !selectedSngpcReady || selectedMissingControlledBatch}
                  >
                    <CheckCircle className="w-4 h-4" />
                    Aprovar receita
                  </button>

                  <button
                    onClick={() => {
                      setPrescriptionRejectReason(observacoes || '');
                      setRejectingPrescription(true);
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
                    disabled={
                      validatingId === selectedReceita._id || !selectedSngpcReady || selectedMissingControlledBatch
                    }
                  >
                    <XCircle className="w-4 h-4" />
                    Rejeitar Notificação
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500 text-right">
                Receita finalizada: disponível apenas para consulta.
              </p>
            )}

            {intencao === 'rejeitar' && !observacoes.trim() && (
              <p className="text-xs text-red-600">
                Para rejeitar é obrigatório informar o motivo.
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={rejectingPrescription}
        onClose={() => setRejectingPrescription(false)}
        title="Rejeitar Notificação"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo
            </label>
            <textarea
              value={prescriptionRejectReason}
              onChange={(e) => setPrescriptionRejectReason(e.target.value)}
              placeholder="Informe o motivo regulatório ou operacional"
              className="w-full border rounded-lg p-2 text-sm resize-none h-28 focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRejectingPrescription(false)}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={rejectSelectedPrescription}
              disabled={validatingId === selectedReceita?._id}
              className="px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar rejeição
            </button>
          </div>
        </div>
      </Modal>

      {/* Lightbox: visualização do documento da receita em tela cheia */}
      <Modal
        isOpen={!!imagemAberta}
        onClose={() => setImagemAberta(null)}
        title="Receita médica"
        size="xl"
      >
        <div className="flex flex-col items-center gap-3">
          {openedPrescriptionIsPdf ? (
            <iframe
              src={imagemAberta}
              className="w-full rounded border"
              style={{ height: '75vh' }}
              title="Receita em PDF"
            />
          ) : openedPrescriptionIsXml ? (
            <div className="w-full rounded border bg-white p-8 text-center">
              <FileText className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-800">Receita digital em XML</p>
              <p className="mt-1 text-xs text-gray-500 break-all">{imagemAberta}</p>
              <a
                href={imagemAberta}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
              >
                Abrir XML
              </a>
            </div>
          ) : (
            <>
              <div
                className="overflow-auto w-full flex justify-center"
                style={{ maxHeight: '75vh' }}
              >
                <img
                  src={imagemAberta}
                  alt="Receita médica em tamanho real"
                  className="max-w-full h-auto rounded shadow-md"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none'
                    const fb = e.currentTarget
                      .closest('div.flex.flex-col')
                      ?.querySelector('[data-fallback]')
                    if (fb) fb.style.display = 'flex'
                  }}
                />
              </div>

              {/* Fallback exibido apenas se o navegador não conseguir carregar a imagem */}
              <div
                data-fallback
                style={{ display: 'none' }}
                className="flex-col items-center gap-3 p-6 bg-red-50 border border-red-200 rounded-lg text-center"
              >
                <span className="text-red-500 text-4xl">⚠️</span>
                <p className="text-red-700 font-medium text-sm">
                  Não foi possível carregar a imagem
                </p>
                <p className="text-red-500 text-xs break-all">{imagemAberta}</p>
                <a
                  href={imagemAberta}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline text-xs"
                >
                  Tentar abrir em nova aba
                </a>
              </div>
            </>
          )}

          <button
            onClick={() => setImagemAberta(null)}
            className="mt-2 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition-colors"
          >
            Fechar
          </button>
        </div>
      </Modal>

      {/* Modal de chat ao vivo com o paciente */}
      <Modal
        isOpen={!!activeChat}
        onClose={() => setActiveChat(null)}
        title="Chat ao vivo com o paciente"
        size="xl"
      >
        {activeChat && (
          <PrescriptionChat
            prescriptionId={activeChat.prescriptionId}
            chatSessaoId={activeChat.chatSessaoId}
            urlImagemReceita={activeChat.urlImagem}
            outroUsuario={activeChat.usuario}
            onEncerrar={() => {
              setActiveChat(null);
              fetchData();
            }}
          />
        )}
      </Modal>

      <Modal
        isOpen={!!selectedSupportTicket}
        onClose={() => {
          setSelectedSupportTicket(null);
          setSupportMessages([]);
          setSupportMessageText('');
        }}
        title={`Chat de suporte${selectedSupportTicket?.assunto ? ` - ${selectedSupportTicket.assunto}` : ''}`}
        size="xl"
      >
        {selectedSupportTicket && (
          <div className="flex flex-col gap-3">
            <div className="text-xs text-gray-500">
              Cliente: {selectedSupportTicket.id_usuario?.nome || 'Não informado'}
              {selectedSupportTicket.id_usuario?.email
                ? ` (${selectedSupportTicket.id_usuario.email})`
                : ''}
            </div>

            <div className="max-h-[48vh] overflow-y-auto bg-gray-50 rounded-lg border border-gray-100 p-3 space-y-2">
              {supportMessages.map((m, i) => {
                const tipo = m.tipo_remetente ?? m.tipoRemetente;
                const ehFarmaceutico =
                  tipo !== 'usuario' && tipo !== 'sistema';
                const ehSistema = tipo === 'sistema';
                return (
                  <div
                    key={messageKey(m) || `${i}`}
                    className={`flex ${
                      ehSistema
                        ? 'justify-center'
                        : ehFarmaceutico
                          ? 'justify-end'
                          : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                        ehSistema
                          ? 'bg-gray-200 text-gray-600 text-xs italic'
                          : ehFarmaceutico
                            ? 'bg-primary text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                      {m.texto}
                    </div>
                  </div>
                );
              })}
              <div ref={supportMessagesEndRef} />
            </div>

            {selectedSupportTicket.status !== 'encerrada' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={supportMessageText}
                    onChange={(e) => setSupportMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendSupportMessage();
                      }
                    }}
                    placeholder="Digite sua resposta..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={sendSupportMessage}
                    disabled={!supportMessageText.trim() || supportSending}
                    className="bg-primary text-white p-2 rounded-xl hover:bg-secondary transition disabled:bg-gray-300"
                    aria-label="Enviar resposta"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCloseSupportTicket}
                    disabled={supportClosing}
                    className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {supportClosing ? 'Encerrando…' : 'Encerrar atendimento'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!rejectingOrder}
        onClose={() => {
          setRejectingOrder(null);
          setRejectReason('');
        }}
        title="Cancelar pedido"
        size="md"
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Informe um motivo obrigatório. Esse aviso será mostrado ao usuário.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Ex.: Produto indisponível na farmácia no momento."
            className="w-full border border-gray-200 rounded-lg p-2 text-sm h-24 resize-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setRejectingOrder(null);
                setRejectReason('');
              }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
            >
              Voltar
            </button>
            <button
              onClick={rejeitarPedido}
              disabled={!rejectReason.trim() || submittingOrderAction}
              className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
            >
              Confirmar cancelamento
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colorClass = `color-${color}`;
  return (
    <div className={`stat-card ${colorClass}`}>
      <div className="icon">{icon}</div>
      <div className="content">
        <p className="label">{title}</p>
        <p className="value">{value}</p>
      </div>
    </div>
  );
}

const STATUS_BADGE_STYLES = {
  Pendente: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '⏳' },
  'Em Análise': { bg: 'bg-blue-100', text: 'text-blue-700', icon: '🔎' },
  Aprovada: { bg: 'bg-green-100', text: 'text-green-700', icon: '✅' },
  Rejeitada: { bg: 'bg-red-100', text: 'text-red-700', icon: '❌' },
  Expirada: { bg: 'bg-gray-100', text: 'text-gray-600', icon: '⌛' },
  Cancelada: { bg: 'bg-gray-100', text: 'text-gray-500', icon: '🚫' },
};

function ReadonlySngpcField({ label, value }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-1 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-800 min-h-[38px]">
        {value || '—'}
      </div>
    </div>
  );
}

function SngpcInput({ label, value, placeholder, onChange }) {
  return (
    <div>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
      />
    </div>
  );
}

function SupportTicketCard({ ticket, onOpen }) {
  const ultimaMensagem =
    Array.isArray(ticket.mensagens) && ticket.mensagens.length > 0
      ? ticket.mensagens[ticket.mensagens.length - 1]
      : null;

  return (
    <div className="border border-gray-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {ticket.assunto || 'Ticket sem assunto'}
        </p>
        <p className="text-xs text-gray-500">
          Cliente: {ticket.id_usuario?.nome || 'Não informado'}
        </p>
        <p className="text-xs text-gray-500">
          Status: {ticket.status}
          {ticket.categoria ? ` · ${ticket.categoria}` : ''}
        </p>
        {ultimaMensagem?.texto && (
          <p className="text-xs text-gray-600 mt-1 line-clamp-1">
            Última mensagem: {ultimaMensagem.texto}
          </p>
        )}
      </div>
      <button
        onClick={() => onOpen(ticket._id)}
        className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-secondary"
      >
        Abrir chat
      </button>
    </div>
  );
}

function ValidationCard({ validation, onOpen }) {
  const cliente = validation?.id_usuario || {}
  const farmacia = validation?.id_farmacia || {}
  const dataEnvio = validation?.createdAt
    ? new Date(validation.createdAt).toLocaleString('pt-BR')
    : null
  const status = validation?.status || 'Pendente'
  const badge = STATUS_BADGE_STYLES[status] || STATUS_BADGE_STYLES.Pendente

  const isPendente = status === 'Pendente' || status === 'Em Análise'
  const isRejeitada = status === 'Rejeitada'

  return (
    <div className="validation-card">
      <div className="header">
        <h3>Receita #{(validation?._id || '').toString().slice(-6)}</h3>
        <span
          className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}
        >
          {badge.icon} {status}
        </span>
      </div>

      <div className="cliente-info">
        <p>
          <strong>Cliente:</strong> {cliente.nome || '—'}
          {cliente.email ? ` (${cliente.email})` : ''}
        </p>
        {cliente.telefone && (
          <p>
            <strong>Telefone:</strong> {cliente.telefone}
          </p>
        )}
        {farmacia.nome && (
          <p>
            <strong>Farmácia:</strong> {farmacia.nome}
            {farmacia.cidade ? ` — ${farmacia.cidade}` : ''}
          </p>
        )}
        {dataEnvio && (
          <p>
            <strong>Enviada em:</strong> {dataEnvio}
          </p>
        )}
        {validation?.nome_arquivo && (
          <p>
            <strong>Arquivo:</strong> {validation.nome_arquivo}
          </p>
        )}
        {isRejeitada && validation?.observacoes && (
          <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <strong>Motivo:</strong> {validation.observacoes}
          </p>
        )}
      </div>

      {validation?.modo_validacao === 'chat_ao_vivo' && (
        <div className="medicamentos">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
            💬 Modo: Chat ao vivo
          </span>
        </div>
      )}

      <div className="actions flex flex-wrap gap-2">
        <button
          className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-100"
          onClick={() => onOpen(validation, null)}
        >
          🔍 Ver detalhes
        </button>
      </div>
    </div>
  );
}

function AlertCard({ alert }) {
  const severityColors = {
    LEVE: '#10b981',
    MODERADA: '#f59e0b',
    GRAVE: '#ef4444',
    CONTRAINDICADA: '#8b5cf6',
  };

  return (
    <div className="alert-card">
      <div
        className="left-border"
        style={{ borderColor: severityColors[alert.severidade] }}
      />
      <div className="content">
        <h4>{alert.titulo}</h4>
        <p>{alert.descricao}</p>
        <span className="time">{formatTime(alert.criado_em)}</span>
      </div>
    </div>
  );
}

function formatTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'Agora mesmo';
  if (diff < 3600) return `Há ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `Há ${Math.floor(diff / 3600)}h`;
  return date.toLocaleDateString('pt-BR');
}

function getOrderStatusChangedAt(order, status) {
  const historico = Array.isArray(order?.historico_status)
    ? [...order.historico_status]
    : [];
  const match = historico
    .filter((h) => h?.status === status && h?.alterado_em)
    .sort((a, b) => new Date(b.alterado_em) - new Date(a.alterado_em))[0];
  return match?.alterado_em || null;
}

function formatOrderWaiting(createdAt, resolvedAt = null) {
  if (!createdAt) return { label: 'Sem horário', tone: 'bg-gray-100 text-gray-600' };
  const created = new Date(createdAt);
  const end = resolvedAt ? new Date(resolvedAt) : new Date();
  const diffMin = Math.max(0, Math.floor((end - created) / 60000));
  const isResolved = Boolean(resolvedAt);

  if (diffMin <= 10) {
    return {
      label: isResolved ? '🟢 Resolvido rapidamente' : '🟢 Novo',
      tone: 'bg-green-100 text-green-700',
    };
  }
  if (diffMin < 60) {
    return {
      label: isResolved ? `✅ Aguardou ${diffMin} min` : `⏳ Aguardando há ${diffMin} min`,
      tone: isResolved ? 'bg-gray-100 text-gray-700' : 'bg-amber-100 text-amber-700',
    };
  }
  const diffH = Math.floor(diffMin / 60);
  return {
    label: isResolved ? `✅ Aguardou ${diffH}h` : `⏰ Aguardando há ${diffH}h`,
    tone: isResolved ? 'bg-gray-100 text-gray-700' : 'bg-red-100 text-red-700',
  };
}

// Skeleton Loaders para melhor UX durante carregamento
function SkeletonHeader() {
  return (
    <div className="skeleton-header">
      <div className="skeleton-text skeleton-title"></div>
    </div>
  );
}

function SkeletonStatsGrid() {
  return (
    <div className="skeleton-stats-grid">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="skeleton-card"></div>
      ))}
    </div>
  );
}

function SkeletonContent() {
  return (
    <div className="skeleton-content">
      <div className="skeleton-section">
        <div className="skeleton-text skeleton-heading"></div>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton-card skeleton-validation"></div>
        ))}
      </div>
      <div className="skeleton-section">
        <div className="skeleton-text skeleton-heading"></div>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="skeleton-card skeleton-alert"></div>
        ))}
      </div>
    </div>
  );
}

export default PharmacistDashboard
