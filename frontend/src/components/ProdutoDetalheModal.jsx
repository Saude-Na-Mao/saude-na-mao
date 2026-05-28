import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  X,
  ShoppingCart,
  MessageCircle,
  AlertTriangle,
  FileText,
  MapPin,
  Phone,
  Clock,
  Package,
  Loader2,
  Building2,
  Star,
} from "lucide-react";
import { useAuthStore, useCartStore } from "../stores/store";
import api, { supportService, productService } from "../services/api";
import { setActiveSupportTicket } from "../utils/supportTicketStorage";
import { PharmacistStatus } from "./PharmacistStatus";
import { resolveMediaUrl } from "../utils/mediaUrl";
import {
  getDisplayPrice,
  isRemoteCheckoutBlocked,
  requiresPrescription,
  shouldHideProductImage,
  showPromo,
} from "../utils/compliance";

function pickPharmacy(produto) {
  const farm = produto?.id_farmacia;
  if (!farm || typeof farm === "string") {
    return {
      _id: typeof farm === "string" ? farm : null,
      nome: produto?.nome_farmacia || "Farmácia",
      cidade: "",
      estado: "",
      telefone: "",
      bairro: "",
      logradouro: "",
      horario_funcionamento: "",
      avaliacao: null,
    };
  }
  return {
    _id: farm._id || null,
    nome: farm.nome || produto?.nome_farmacia || "Farmácia",
    cidade: farm.cidade || "",
    estado: farm.estado || "",
    telefone: farm.telefone || "",
    bairro: farm.bairro || "",
    logradouro: farm.logradouro || "",
    horario_funcionamento: farm.horario_funcionamento || "",
    avaliacao: typeof farm.avaliacao === "number" ? farm.avaliacao : null,
  };
}

export default function ProdutoDetalheModal({ produto, isOpen, onClose }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { addItem } = useCartStore();

  const [detalhes, setDetalhes] = useState(produto || null);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [farmaciaAvaliacao, setFarmaciaAvaliacao] = useState(null);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [erro, setErro] = useState(null);

  // Carrega detalhes completos do produto ao abrir
  useEffect(() => {
    if (!isOpen || !produto) return;
    setDetalhes(produto);
    setFarmaciaAvaliacao(null);
    const productId = produto._id || produto.id;
    if (!productId) return;

    setLoadingDetalhes(true);
    productService
      .getById(productId)
      .then((res) => {
        const data = res.data?.data?.produto || res.data?.data || res.data;
        if (data) setDetalhes((prev) => ({ ...(prev || {}), ...data }));
      })
      .catch(() => {})
      .finally(() => setLoadingDetalhes(false));
  }, [isOpen, produto]);

  useEffect(() => {
    if (!isOpen || !detalhes) return;
    const farmaciaId =
      typeof detalhes.id_farmacia === "object"
        ? detalhes.id_farmacia?._id
        : detalhes.id_farmacia;
    if (!farmaciaId) return;

    api
      .get(`/avaliacoes/pharmacy/${farmaciaId}`, { params: { page: 1, limit: 1 } })
      .then((res) => {
        const avg = res.data?.data?.avgRating;
        if (typeof avg === "number") {
          setFarmaciaAvaliacao(avg);
        }
      })
      .catch(() => {});
  }, [isOpen, detalhes]);

  // Limpa estado ao fechar
  useEffect(() => {
    if (!isOpen) {
      setErro(null);
      setCreatingTicket(false);
    }
  }, [isOpen]);

  // ESC para fechar
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !detalhes) return null;

  const farmacia = pickPharmacy(detalhes);
  if (farmaciaAvaliacao != null) {
    farmacia.avaliacao = farmaciaAvaliacao;
  }
  const requiresRx = requiresPrescription(detalhes);
  const remoteBlocked = isRemoteCheckoutBlocked(detalhes);
  const hideImage = shouldHideProductImage(detalhes);
  const displayPrice = getDisplayPrice(detalhes);
  const hasPromo = showPromo(detalhes);
  const estoque = detalhes.estoque ?? 0;
  const isOutOfStock = estoque <= 0;
  const imageSrc = resolveMediaUrl(
    detalhes.imagem || detalhes.imagem_url || detalhes.imagens?.[0],
  );

  const handleAdicionarCarrinho = () => {
    if (remoteBlocked) {
      setErro("Por segurança regulatória, este medicamento exige atendimento da farmácia.");
      return;
    }

    addItem({
      ...detalhes,
      preco: displayPrice,
      receita_obrigatoria: requiresRx,
      quantity: 1,
    });
    onClose?.();
  };

  const abrirChat = async () => {
    if (!isAuthenticated()) {
      navigate("/login", { state: { from: window.location.pathname } });
      return;
    }

    setErro(null);
    setCreatingTicket(true);
    try {
      const res = await supportService.send({
        assunto: `Dúvida sobre ${detalhes.nome}`,
        categoria: "duvida_medicamento",
        mensagemInicial: `Olá, tenho uma dúvida sobre o medicamento ${detalhes.nome}.`,
        origem: "pagina_produto",
        id_farmacia: farmacia._id,
      });
      const ticket = res.data?.data?.ticket || res.data?.data;
      const idTicket = ticket?._id;
      if (!idTicket) throw new Error("Ticket inválido");

      setActiveSupportTicket(idTicket);
      onClose?.();
      navigate("/suporte", { state: { openTicketId: String(idTicket) } });
    } catch (err) {
      setErro(
        err.response?.data?.message || "Erro ao iniciar chat. Tente novamente.",
      );
    } finally {
      setCreatingTicket(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-[2px] animate-[fadeIn_0.18s_ease-out]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-[1100px] h-[min(92svh,840px)] overflow-hidden flex flex-col transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 line-clamp-2">
              {detalhes.nome}
            </h2>
            {detalhes.principio_ativo && (
              <p className="text-sm text-gray-500 mt-0.5">
                {detalhes.principio_ativo}
                {detalhes.dosagem ? ` · ${detalhes.dosagem}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition flex-shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Conteúdo rolável */}
        <div className="flex-1 overflow-y-auto">
          {/* Imagem + preço */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-5 sm:p-6">
            <div className="lg:col-span-5 bg-gradient-to-br from-blue-50 to-emerald-50 rounded-xl flex items-center justify-center p-8 min-h-[280px]">
              {hideImage || !imageSrc ? (
                <FileText className="w-24 h-24 text-amber-500" />
              ) : (
                <img
                  src={imageSrc}
                  alt={detalhes.nome}
                  className="max-h-64 w-full object-contain"
                />
              )}
            </div>
            <div className="lg:col-span-7 flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-2">
                {hasPromo ? (
                  <>
                    <span className="text-3xl sm:text-4xl font-bold text-primary">
                      R$ {displayPrice.toFixed(2)}
                    </span>
                    <span className="text-sm text-gray-400 line-through">
                      R$ {Number(detalhes.preco).toFixed(2)}
                    </span>
                  </>
                ) : (
                  <span className="text-3xl sm:text-4xl font-bold text-primary">
                    R$ {displayPrice.toFixed(2)}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                {requiresRx && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded-lg font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" /> Requer receita
                    médica
                  </span>
                )}
                {detalhes.categoria && (
                  <span className="inline-flex items-center px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-lg font-medium">
                    {detalhes.categoria}
                  </span>
                )}
                {detalhes.fabricante && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-50 text-gray-700 border border-gray-200 rounded-lg">
                    <Building2 className="w-3.5 h-3.5" /> {detalhes.fabricante}
                  </span>
                )}
              </div>

              {remoteBlocked && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mt-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p>
                    <span className="font-medium">Atendimento obrigatório da farmácia.</span>{" "}
                    Este item exige validação direta antes de qualquer compra online.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm">
                <Package
                  className={`w-4 h-4 ${isOutOfStock ? "text-red-500" : "text-emerald-500"}`}
                />
                {isOutOfStock ? (
                  <span className="text-red-600 font-semibold">
                    Fora de estoque
                  </span>
                ) : (
                  <span className="text-emerald-700 font-medium">
                    Disponível
                  </span>
                )}
              </div>

              <button
                onClick={handleAdicionarCarrinho}
                disabled={isOutOfStock || remoteBlocked}
                className="mt-1 inline-flex items-center justify-center gap-2 bg-primary text-white py-2.5 px-4 rounded-xl font-semibold hover:bg-secondary transition disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <ShoppingCart className="w-4 h-4" />
                {remoteBlocked ? "Atendimento da farmácia" : isOutOfStock ? "Indisponível" : "Adicionar ao carrinho"}
              </button>
            </div>
          </div>

          {/* Descrição */}
          {detalhes.descricao && (
            <div className="px-5 sm:px-6 pb-2">
              <h3 className="text-sm font-bold text-gray-800 mb-1.5">
                Descrição
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {detalhes.descricao}
              </p>
            </div>
          )}

          {/* Farmácia */}
          <div className="mx-5 sm:mx-6 my-5 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-gray-900 truncate">
                    {farmacia.nome}
                  </p>
                  {farmacia.avaliacao != null && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {farmacia.avaliacao.toFixed(1)}
                    </span>
                  )}
                </div>
                {(farmacia.cidade || farmacia.bairro) && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {[farmacia.bairro, farmacia.cidade, farmacia.estado]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {farmacia.horario_funcionamento && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    {farmacia.horario_funcionamento}
                  </p>
                )}
                {farmacia.telefone && (
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3.5 h-3.5" />
                    {farmacia.telefone}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Chat com farmacêutico */}
          <div className="mx-5 sm:mx-6 mt-0 mb-5 border border-emerald-100 rounded-xl overflow-hidden">
            <div className="flex flex-col gap-3 p-4 bg-emerald-50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-900">
                    Tirar dúvida com o farmacêutico
                  </p>
                  <p className="text-xs text-emerald-700">
                    Resposta em tempo real pela equipe de {farmacia.nome}
                  </p>
                  <p className="text-[11px] text-emerald-600/90 mt-1">
                    Você será levado ao Centro de Suporte para continuar a conversa.
                  </p>
                  {farmacia._id && (
                    <div className="mt-2">
                      <PharmacistStatus
                        pharmacyId={farmacia._id}
                        compact
                      />
                    </div>
                  )}
                </div>
              </div>

              {!isAuthenticated() ? (
                <button
                  onClick={() =>
                    navigate("/login", {
                      state: { from: window.location.pathname },
                    })
                  }
                  className="w-full text-xs sm:w-auto sm:text-sm font-semibold bg-white text-emerald-700 border border-emerald-200 px-3 py-2 rounded-lg hover:bg-emerald-100 transition flex-shrink-0"
                >
                  Entrar para conversar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={abrirChat}
                  disabled={creatingTicket}
                  className="w-full text-xs sm:w-auto sm:text-sm font-semibold bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition flex-shrink-0 disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {creatingTicket ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Abrindo…
                    </>
                  ) : (
                    "Iniciar chat"
                  )}
                </button>
              )}
            </div>

            {erro && (
              <div className="px-4 py-2 bg-red-50 border-t border-red-100 text-xs text-red-700 text-center">
                {erro}
              </div>
            )}
          </div>

          {loadingDetalhes && (
            <p className="text-center text-xs text-gray-400 pb-3">
              Carregando detalhes...
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
