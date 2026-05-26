import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../stores/store";
import api, {
  deliveryService,
  userService,
  orderService,
} from "../services/api";
import { Truck, MapPin, CheckCircle, Clock, Star } from "lucide-react";

const COMISSAO = 0.03;

const STEPS = [
  "Aceita",
  "Indo à farmácia",
  "A caminho",
  "Entregue",
];

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStepIndex(status) {
  switch (status) {
    case "aceita":
      return 0;
    case "coletando":
      return 1;
    case "coletada":
    case "em_transito":
      return 2;
    case "entregue":
      return 3;
    default:
      return 0;
  }
}

function statusBadgeClass(status) {
  const map = {
    disponivel: "bg-blue-100 text-blue-800",
    aceita: "bg-indigo-100 text-indigo-800",
    coletando: "bg-amber-100 text-amber-800",
    coletada: "bg-orange-100 text-orange-800",
    em_transito: "bg-purple-100 text-purple-800",
    entregue: "bg-green-100 text-green-800",
    cancelada: "bg-red-100 text-red-800",
  };
  return map[status] || "bg-gray-100 text-gray-700";
}

/** Destino no Maps a partir de endereco_* da própria entrega (snapshot). */
function mapsHrefFromAddressSnapshot(addr) {
  if (!addr || typeof addr !== "object") return "https://maps.google.com/";
  const loc = addr.location;
  if (loc?.coordinates?.length === 2) {
    const [lng, lat] = loc.coordinates;
    return `https://maps.google.com/?q=${lat},${lng}`;
  }
  const q = [
    addr.logradouro,
    addr.numero,
    addr.bairro,
    addr.cidade,
    addr.estado,
    addr.cep,
  ]
    .filter(Boolean)
    .join(", ");
  return q
    ? `https://maps.google.com/?q=${encodeURIComponent(q)}`
    : "https://maps.google.com/";
}

export default function EntregadorDashboard() {
  const { user, setUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [ganhosHoje, setGanhosHoje] = useState(null);
  const [disponiveis, setDisponiveis] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [histPage, setHistPage] = useState(1);
  const [histTotalPaginas, setHistTotalPaginas] = useState(1);
  const [activeDelivery, setActiveDelivery] = useState(null);
  const [activeOrder, setActiveOrder] = useState(null);
  const [codigoEntrega, setCodigoEntrega] = useState("");
  const [fotoComprovante, setFotoComprovante] = useState(null);
  const [aceitandoId, setAceitandoId] = useState(null);

  const entregador = user?.dados_entregador || {};
  const disponivel = Boolean(entregador.disponivel);
  const emEntrega = Boolean(activeDelivery);
  const avaliacaoMediaPerfil = Number(
    entregador.avaliacao_media ?? entregador.avaliacao ?? 0,
  );
  const avaliacaoMediaHistorico = useMemo(() => {
    const notas = historico
      .map((d) => d.avaliacao_cliente?.nota)
      .filter((n) => n != null && Number.isFinite(Number(n)))
      .map((n) => Number(n));
    if (!notas.length) return null;
    return notas.reduce((a, b) => a + b, 0) / notas.length;
  }, [historico]);
  const avaliacaoMedia =
    avaliacaoMediaPerfil > 0
      ? avaliacaoMediaPerfil
      : avaliacaoMediaHistorico ?? 0;

  const refreshProfile = useCallback(async () => {
    try {
      const res = await userService.getProfile();
      const u = res.data?.data?.user;
      if (u) setUser((prev) => ({ ...prev, ...u }));
    } catch {
      /* ignora */
    }
  }, [setUser]);

  const loadActiveFromApi = useCallback(async () => {
    const res = await deliveryService.getMy({ limit: 40 });
    const list = res.data?.data?.entregas || [];
    const active = list.find((d) =>
      ["aceita", "coletando", "coletada", "em_transito"].includes(d.status),
    );
    if (active) {
      setActiveDelivery(active);
      const oid = active.id_pedido?._id || active.id_pedido;
      if (oid) {
        try {
          const ordRes = await orderService.getById(oid);
          const pedido = ordRes.data?.data?.pedido ?? ordRes.data?.data;
          setActiveOrder(pedido || null);
        } catch {
          setActiveOrder(null);
        }
      } else {
        setActiveOrder(null);
      }
    } else {
      setActiveDelivery(null);
      setActiveOrder(null);
    }
  }, []);

  const loadDisponiveis = useCallback(async () => {
    let latitude;
    let longitude;

    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 30000,
        });
      });
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // fallback silencioso para localização salva no backend
    }

    const res = await deliveryService.listarDisponiveisPedidos({
      latitude,
      longitude,
      raio: 10,
      limit: 20,
    });
    const entregas = res.data?.data?.entregas ?? [];
    setDisponiveis(Array.isArray(entregas) ? entregas : []);
  }, []);

  const loadGanhosHoje = useCallback(async () => {
    const res = await deliveryService.getGanhos("hoje");
    setGanhosHoje(res.data?.data ?? null);
  }, []);

  const loadHistorico = useCallback(async (page = 1) => {
    const res = await deliveryService.getHistorico({ page, limit: 10 });
    const data = res.data?.data;
    setHistorico(data?.entregas || []);
    setHistPage(data?.pagina || page);
    setHistTotalPaginas(data?.totalPaginas || 1);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshProfile();
      await loadGanhosHoje();
      const myRes = await deliveryService.getMy({ limit: 40 });
      const list = myRes.data?.data?.entregas || [];
      const hasActive = list.some((d) =>
        ["aceita", "coletando", "coletada", "em_transito"].includes(d.status),
      );

      if (hasActive) {
        const active = list.find((d) =>
          ["aceita", "coletando", "coletada", "em_transito"].includes(d.status),
        );
        setActiveDelivery(active);
        const oid = active.id_pedido?._id || active.id_pedido;
        if (oid) {
          try {
            const ordRes = await orderService.getById(oid);
            setActiveOrder(
              ordRes.data?.data?.pedido ?? ordRes.data?.data ?? null,
            );
          } catch {
            setActiveOrder(null);
          }
        } else {
          setActiveOrder(null);
        }
        setDisponiveis([]);
      } else {
        setActiveDelivery(null);
        setActiveOrder(null);
        const u = useAuthStore.getState().user;
        const isAvailable = Boolean(u?.dados_entregador?.disponivel);
        if (isAvailable) {
          await loadDisponiveis();
        } else {
          setDisponiveis([]);
        }
      }

      await loadHistorico(1);
    } catch (e) {
      setError(e?.message || "Erro ao carregar painel");
    } finally {
      setLoading(false);
    }
  }, [refreshProfile, loadGanhosHoje, loadHistorico, loadDisponiveis]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!emEntrega) return;

    const intervalo = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api
            .patch("/deliveries/localizacao", {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            })
            .catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }, 15000);

    return () => clearInterval(intervalo);
  }, [emEntrega]);

  const toggleDisponibilidade = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deliveryService.toggleDisponibilidade(!disponivel);
      await refreshProfile();
      if (!disponivel) {
        await loadDisponiveis();
      } else {
        setDisponiveis([]);
      }
    } catch (e) {
      setError(e?.message || "Não foi possível alterar disponibilidade");
    } finally {
      setBusy(false);
    }
  };

  const handleAceitar = async (deliveryId) => {
    setAceitandoId(deliveryId);
    setError(null);
    try {
      const res = await deliveryService.aceitarPedido(deliveryId);
      const data = res.data?.data;
      const entrega = data?.entrega;
      if (entrega) {
        setActiveDelivery(entrega);
        const oid = entrega.id_pedido?._id || entrega.id_pedido;
        try {
          const ordRes = await orderService.getById(oid);
          setActiveOrder(
            ordRes.data?.data?.pedido ?? ordRes.data?.data ?? null,
          );
        } catch {
          setActiveOrder(null);
        }
      }
      await refreshProfile();
      setDisponiveis([]);
      await Promise.all([loadGanhosHoje(), loadHistorico(histPage)]);
    } catch (e) {
      setError(e?.message || "Erro ao aceitar entrega");
    } finally {
      setAceitandoId(null);
    }
  };

  const handleColetar = async () => {
    if (!activeDelivery?._id) return;
    setBusy(true);
    setError(null);
    try {
      await deliveryService.coletarNaFarmacia(activeDelivery._id, {});
      await loadActiveFromApi();
      await loadHistorico(histPage);
    } catch (e) {
      setError(e?.message || "Erro ao confirmar coleta");
    } finally {
      setBusy(false);
    }
  };

  const handleEntregar = async () => {
    if (!activeDelivery?._id || !codigoEntrega.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (activeDelivery.status === "coletada") {
        await deliveryService.updateStatus(activeDelivery._id, {
          novoStatus: "em_transito",
        });
        await loadActiveFromApi();
      } else if (activeDelivery.status !== "em_transito") {
        setError("Confirme a coleta na farmácia antes de finalizar a entrega.");
        setBusy(false);
        return;
      }
      let foto = null;
      if (fotoComprovante) {
        foto = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(fotoComprovante);
        });
      }
      await deliveryService.entregarAoCliente(activeDelivery._id, {
        codigo_confirmacao: codigoEntrega.trim(),
        foto_comprovante: foto || undefined,
      });
      setCodigoEntrega("");
      setFotoComprovante(null);
      setActiveDelivery(null);
      setActiveOrder(null);
      await refreshProfile();
      await Promise.all([
        loadGanhosHoje(),
        loadActiveFromApi(),
        loadHistorico(1),
        loadDisponiveis(),
      ]);
    } catch (e) {
      setError(e?.message || "Erro ao confirmar entrega");
    } finally {
      setBusy(false);
    }
  };

  const pedidoParaFluxo =
    activeOrder ||
    (activeDelivery?.id_pedido && typeof activeDelivery.id_pedido === "object"
      ? activeDelivery.id_pedido
      : null);

  const currentStepIndexEntrega = getStepIndex(activeDelivery?.status ?? "");

  const clienteNome =
    activeOrder?.id_usuario?.nome ||
    activeDelivery?.id_cliente?.nome ||
    "Cliente";
  const clienteTel =
    activeOrder?.id_usuario?.telefone ||
    activeDelivery?.id_cliente?.telefone ||
    "—";

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 flex items-center justify-center gap-3 text-gray-600">
        <Clock className="w-6 h-6 animate-pulse" />
        Carregando painel…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Truck className="w-8 h-8 text-emerald-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Painel do entregador
          </h1>
          <p className="text-gray-500 text-sm">
            Acompanhe entregas, ganhos e disponibilidade
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 text-red-800 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* SEÇÃO A */}
      <div className="flex items-center justify-between p-4 bg-gray-900 rounded-xl mb-4">
        <div>
          <p className="text-white font-medium">{user?.nome}</p>
          <p className="text-gray-400 text-sm">
            {entregador.veiculo?.tipo || entregador.tipo_veiculo || "—"} ·{" "}
            {entregador.veiculo?.placa || entregador.placa || "—"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-sm ${disponivel ? "text-green-400" : "text-gray-400"}`}
          >
            {disponivel ? "Disponível" : "Indisponível"}
          </span>
          <button
            type="button"
            onClick={toggleDisponibilidade}
            disabled={busy}
            className={`w-14 h-7 rounded-full transition-colors relative shrink-0 ${
              disponivel ? "bg-green-500" : "bg-gray-600"
            } ${busy ? "opacity-50" : ""}`}
            aria-pressed={disponivel}
            aria-label="Alternar disponibilidade"
          >
            <span
              className={`absolute left-0.5 top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
                disponivel ? "translate-x-7" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* SEÇÃO B */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Entregas hoje</p>
          <p className="text-2xl font-bold text-gray-900">
            {ganhosHoje?.total_entregas ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Ganhos hoje</p>
          <p className="text-2xl font-bold text-emerald-700">
            {formatMoney(ganhosHoje?.total_ganho ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-gray-500 text-sm mb-1 flex items-center gap-1">
            <Star className="w-4 h-4 text-amber-500" />
            Avaliação média
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {avaliacaoMedia > 0 ? avaliacaoMedia.toFixed(1) : "—"}
          </p>
        </div>
      </div>

      {/* SEÇÃO C */}
      {disponivel && !emEntrega && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-600" />
            Entregas disponíveis
          </h2>
          {disponiveis.length === 0 ? (
            <p className="text-gray-500 text-sm py-8 text-center bg-gray-50 rounded-xl">
              Nenhum pedido disponível no momento.
            </p>
          ) : (
            <div className="space-y-4">
              {disponiveis.map((entrega) => {
                const pedido = entrega.id_pedido || {};
                const farm = entrega.id_farmacia;
                const nomeFarm = farm?.nome || "Farmácia";
                const total = Number(pedido.total) || 0;
                const ganhoEst = total * COMISSAO;
                const did = entrega._id;
                const addr = entrega.endereco_entrega;
                const distanciaKm = entrega.distancia_km;
                return (
                  <div
                    key={did}
                    className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold text-gray-900">
                        {nomeFarm}
                        {distanciaKm != null && (
                          <span className="ml-2 text-emerald-600 font-normal">
                            · {distanciaKm.toFixed(1)} km
                          </span>
                        )}
                      </p>
                      <p className="text-gray-600">
                        {addr?.bairro || "—"}, {addr?.cidade || "—"}
                      </p>
                      <p className="text-gray-700">
                        Pedido: {formatMoney(total)} · Ganho estimado:{" "}
                        <span className="font-medium text-emerald-700">
                          {formatMoney(ganhoEst)}
                        </span>
                      </p>
                      <p className="text-gray-500 capitalize">
                        Tipo: {pedido.tipo_entrega || "—"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={aceitandoId === did}
                      onClick={() => handleAceitar(did)}
                      className="shrink-0 px-5 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {aceitandoId === did ? "Aceitando…" : "Aceitar entrega"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SEÇÃO D */}
      {activeDelivery && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            Entrega em andamento
          </h2>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm mb-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {STEPS.map((label, i) => (
                <div key={`${label}-${i}`} className="flex items-center">
                  <div
                    className={`flex items-center gap-1 text-xs sm:text-sm px-2 py-1 rounded-full ${
                      i < currentStepIndexEntrega
                        ? "bg-emerald-100 text-emerald-800 font-medium"
                        : i === currentStepIndexEntrega
                          ? "bg-emerald-100 text-emerald-800 font-medium"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {i < currentStepIndexEntrega ? (
                      <CheckCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    {label}
                  </div>
                  {i < STEPS.length - 1 && (
                    <span className="text-gray-300 mx-1 hidden sm:inline">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 text-xs uppercase">Cliente</p>
                <p className="font-medium text-gray-900">{clienteNome}</p>
                <p className="text-gray-700">{clienteTel}</p>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-gray-500 text-xs uppercase">
                    Coleta (farmácia)
                  </p>
                  <a
                    href={mapsHrefFromAddressSnapshot(
                      activeDelivery.endereco_coleta,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                  >
                    <MapPin className="w-4 h-4" />
                    Abrir no Maps
                  </a>
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase">
                    Entrega (cliente)
                  </p>
                  <a
                    href={mapsHrefFromAddressSnapshot(
                      activeDelivery.endereco_entrega,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:underline inline-flex items-center gap-1"
                  >
                    <MapPin className="w-4 h-4" />
                    Abrir no Maps
                  </a>
                </div>
              </div>
            </div>

            <p className="mt-3 text-sm text-slate-700 bg-slate-100 rounded-lg px-3 py-2">
              O código de 6 dígitos aparece para o cliente em Meus pedidos e
              em Rastrear. Confira com o cliente e digite abaixo.
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              {activeDelivery.status === "aceita" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleColetar}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                >
                  Cheguei na farmácia / Confirmar coleta
                </button>
              )}

              {(activeDelivery.status === "coletada" ||
                activeDelivery.status === "em_transito") && (
                <div className="w-full space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Código do cliente (6 dígitos)"
                    value={codigoEntrega}
                    onChange={(e) =>
                      setCodigoEntrega(e.target.value.replace(/\D/g, ""))
                    }
                    className="w-full max-w-xs border border-gray-300 rounded-lg px-3 py-2 text-lg tracking-widest"
                  />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Foto do comprovante (opcional)
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(e) =>
                        setFotoComprovante(e.target.files?.[0] || null)
                      }
                      className="text-sm text-gray-600"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={busy || codigoEntrega.length < 6}
                    onClick={handleEntregar}
                    className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                  >
                    Confirmar entrega
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* SEÇÃO E */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Histórico de entregas
        </h2>
        <div className="space-y-3">
          {historico.length === 0 ? (
            <p className="text-gray-500 text-sm py-6 text-center bg-gray-50 rounded-xl">
              Nenhuma entrega ainda.
            </p>
          ) : (
            historico.map((d) => {
              const farmNome = d.id_farmacia?.nome || "Farmácia";
              const cliNome = d.id_cliente?.nome || "Cliente";
              const totalPedido = Number(d.id_pedido?.total) || 0;
              const ganho = totalPedido * COMISSAO;
              const nota = d.avaliacao_cliente?.nota;
              return (
                <div
                  key={d._id}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {formatDate(d.createdAt)}
                    </p>
                    <p className="text-gray-600">
                      {farmNome} · {cliNome}
                    </p>
                    <p className="text-gray-700">
                      Ganho:{" "}
                      <span className="font-semibold text-emerald-700">
                        {formatMoney(ganho)}
                      </span>
                    </p>
                    {nota != null && (
                      <p className="text-amber-600 flex items-center gap-1 mt-1">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                        {nota}/5
                      </p>
                    )}
                  </div>
                  <span
                    className={`self-start sm:self-center px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(d.status)}`}
                  >
                    {d.status}
                  </span>
                </div>
              );
            })
          )}
        </div>
        {histTotalPaginas > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              type="button"
              disabled={histPage <= 1}
              onClick={() => loadHistorico(histPage - 1)}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-sm text-gray-600 py-1">
              {histPage} / {histTotalPaginas}
            </span>
            <button
              type="button"
              disabled={histPage >= histTotalPaginas}
              onClick={() => loadHistorico(histPage + 1)}
              className="px-3 py-1 rounded border border-gray-300 text-sm disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
