import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import Alert from './Alert'
import { pharmacyService, geoService } from '../services/api'

function pharmacyIdString(raw) {
  if (raw == null) return null
  if (typeof raw === 'object' && raw._id) return String(raw._id)
  return String(raw)
}

export default function FarmaciaEnderecoPanel({ pharmacyId: pharmacyIdProp, resolvingPharmacy = false }) {
  const pharmacyId = pharmacyIdString(pharmacyIdProp)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)
  const [form, setForm] = useState({
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    telefone: '',
  })
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [cepBusy, setCepBusy] = useState(false)

  const load = async () => {
    if (!pharmacyId) return
    setLoading(true)
    setErr(null)
    try {
      const res = await pharmacyService.getById(pharmacyId)
      const f = res.data?.data?.farmacia
      if (!f) throw new Error('Farmácia não encontrada')
      setForm({
        logradouro: f.logradouro || '',
        numero: f.numero || '',
        complemento: f.complemento || '',
        bairro: f.bairro || '',
        cidade: f.cidade || '',
        estado: f.estado || '',
        cep: f.cep || '',
        telefone: f.telefone || '',
      })
      const c = f.location?.coordinates
      if (Array.isArray(c) && c.length === 2) {
        const [lng, lat] = c
        setLatitude(lat != null ? String(lat) : '')
        setLongitude(lng != null ? String(lng) : '')
      } else {
        setLatitude('')
        setLongitude('')
      }
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Erro ao carregar')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (pharmacyId && !resolvingPharmacy) load()
    else if (!pharmacyId) setLoading(false)
  }, [pharmacyId, resolvingPharmacy])

  const onChange = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }))

  const buscarCep = async () => {
    const raw = String(form.cep || '').replace(/\D/g, '')
    if (raw.length !== 8) {
      setErr('Informe um CEP com 8 dígitos')
      return
    }
    setCepBusy(true)
    setErr(null)
    try {
      const res = await geoService.geocodeCep(raw)
      const d = res.data?.data
      if (!d) throw new Error('CEP não encontrado')
      setForm((p) => ({
        ...p,
        logradouro: d.logradouro || p.logradouro,
        bairro: d.bairro || p.bairro,
        cidade: d.cidade || p.cidade,
        estado: d.estado || p.estado,
        cep: d.cep || raw,
      }))
      if (d.latitude != null && d.longitude != null) {
        setLatitude(String(d.latitude))
        setLongitude(String(d.longitude))
      }
    } catch (e) {
      setErr(e?.response?.data?.message || 'Não foi possível consultar o CEP')
    } finally {
      setCepBusy(false)
    }
  }

  const usarGps = () => {
    if (!navigator.geolocation) {
      setErr('Geolocalização não disponível neste navegador')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(String(pos.coords.latitude))
        setLongitude(String(pos.coords.longitude))
        setOk('Coordenadas obtidas. Clique em Salvar para gravar no cadastro.')
        setTimeout(() => setOk(null), 5000)
      },
      () => setErr('Permissão de localização negada ou indisponível'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const salvar = async (e) => {
    e.preventDefault()
    if (!pharmacyId) return
    setSaving(true)
    setErr(null)
    setOk(null)
    try {
      const lat = parseFloat(String(latitude).replace(',', '.'))
      const lng = parseFloat(String(longitude).replace(',', '.'))
      const payload = { ...form }
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        payload.latitude = lat
        payload.longitude = lng
      }
      await pharmacyService.updateAddress(pharmacyId, payload)
      setOk('Dados salvos. Novas entregas usarão este endereço e o ponto no mapa.')
      await load()
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  if (resolvingPharmacy || !pharmacyId) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        {resolvingPharmacy
          ? 'Carregando farmácia…'
          : 'Não foi possível identificar a farmácia vinculada ao seu usuário.'}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        Carregando endereço…
      </div>
    )
  }

  const latN = parseFloat(String(latitude).replace(',', '.'))
  const lngN = parseFloat(String(longitude).replace(',', '.'))
  const hasPin = Number.isFinite(latN) && Number.isFinite(lngN)

  const inputCls =
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary/30 focus:border-primary outline-none'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm max-w-3xl">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Endereço da loja e local no mapa</h2>
      <p className="text-sm text-gray-600 mb-4">
        Endereço usado na <strong>coleta</strong> para o entregador. Latitude e longitude (pino) melhoram a busca por
        proximidade; use o GPS estando na <strong>porta da farmácia</strong>.
      </p>
      {!hasPin && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm px-4 py-3">
          Sem coordenadas no cadastro, os entregadores podem não ver sua loja ao filtrar por distância. Preencha o CEP ou
          use o botão de GPS e salve.
        </div>
      )}
      {err && (
        <div className="mb-4">
          <Alert type="error" message={err} onClose={() => setErr(null)} />
        </div>
      )}
      {ok && (
        <div className="mb-4">
          <Alert type="success" message={ok} onClose={() => setOk(null)} />
        </div>
      )}
      <form onSubmit={salvar} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">CEP</label>
            <input className={inputCls} value={form.cep} onChange={onChange('cep')} placeholder="00000-000" />
          </div>
          <button
            type="button"
            onClick={buscarCep}
            disabled={cepBusy}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 text-sm font-medium hover:bg-gray-200 disabled:opacity-50"
          >
            {cepBusy ? 'Buscando…' : 'Buscar CEP'}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Logradouro</label>
            <input className={inputCls} value={form.logradouro} onChange={onChange('logradouro')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Número</label>
            <input className={inputCls} value={form.numero} onChange={onChange('numero')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Complemento</label>
            <input className={inputCls} value={form.complemento} onChange={onChange('complemento')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Bairro</label>
            <input className={inputCls} value={form.bairro} onChange={onChange('bairro')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
            <input className={inputCls} value={form.cidade} onChange={onChange('cidade')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">UF</label>
            <input
              className={inputCls}
              value={form.estado}
              onChange={onChange('estado')}
              maxLength={2}
              placeholder="SP"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone da loja</label>
            <input className={inputCls} value={form.telefone} onChange={onChange('telefone')} />
          </div>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-600 mb-2">Pino no mapa (opcional mas recomendado)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Latitude</label>
              <input
                className={inputCls}
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="-23.5…"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Longitude</label>
              <input
                className={inputCls}
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="-46.6…"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={usarGps}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/5"
          >
            <MapPin className="w-4 h-4" />
            Usar localização deste aparelho (na loja)
          </button>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-95 disabled:opacity-50"
        >
          {saving ? 'Salvando…' : 'Salvar endereço'}
        </button>
      </form>
    </div>
  )
}
