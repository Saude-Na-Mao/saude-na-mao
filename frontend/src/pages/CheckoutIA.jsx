import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore, useAuthStore } from '../stores/store';
import { DrugInteractionAlert } from '../components/DrugInteractionAlert';
import { PharmacistStatus } from '../components/PharmacistStatus';
import { apiUrl } from '../config/env';
import './CheckoutIA.css';

const STEPS = {
  ITEMS_REVIEW: 'items',
  DRUG_CHECK: 'drugs',
  ADDRESS: 'address',
  PAYMENT: 'payment',
  CONFIRMATION: 'confirmation',
};

export function CheckoutIA() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { items, getTotal } = useCartStore();

  const [currentStep, setCurrentStep] = useState(STEPS.ITEMS_REVIEW);
  const [drugCheckResult, setDrugCheckResult] = useState(null);
  const [riskResult, setRiskResult] = useState(null);
  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [address, setAddress] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Extrair IDs de medicamentos do carrinho
  const medicamentoIds = items.map(item => item.id || item.produto_id).filter(Boolean);

  const handleDrugValidation = async (result) => {
    if (result.status === 'PERIGO') {
      setError('Compra bloqueada por segurança. Entre em contato com um farmacêutico.');
      return;
    }

    // Se requer farmacêutico, mostrar lista de farmácias com disponibilidade
    if (result.requerFarmaceutico) {
      setDrugCheckResult(result);
      setCurrentStep(STEPS.ADDRESS);
    } else {
      setDrugCheckResult(result);
      setCurrentStep(STEPS.ADDRESS);
    }
  };

  const handleDrugCancel = () => {
    navigate('/carrinho');
  };

  const handleAddressSubmit = () => {
    setCurrentStep(STEPS.PAYMENT);
  };

  const handlePaymentSubmit = async () => {
    setLoading(true);
    localStorage.setItem('checkout_ia_triagem', JSON.stringify({
      endereco: address,
      metodo_pagamento: paymentMethod,
      farmacia_id: selectedPharmacy?._id,
      interacoes_verificadas: drugCheckResult,
      risco_avaliado: riskResult,
    }));
    navigate('/checkout');
  };

  return (
    <div className="checkout-ia-container">
      <div className="checkout-steps">
        <div className={`step ${currentStep === STEPS.ITEMS_REVIEW ? 'active' : ''}`}>
          <span>1</span>
          <label>Itens</label>
        </div>
        <div className={`step ${currentStep === STEPS.DRUG_CHECK ? 'active' : ''}`}>
          <span>2</span>
          <label>Verificação</label>
        </div>
        <div className={`step ${currentStep === STEPS.ADDRESS ? 'active' : ''}`}>
          <span>3</span>
          <label>Endereço</label>
        </div>
        <div className={`step ${currentStep === STEPS.PAYMENT ? 'active' : ''}`}>
          <span>4</span>
          <label>Pagamento</label>
        </div>
      </div>

      <div className="checkout-content">
        {currentStep === STEPS.ITEMS_REVIEW && (
          <ItemsReviewStep
            items={items}
            total={getTotal()}
            onNext={() => setCurrentStep(STEPS.DRUG_CHECK)}
            onBack={() => navigate('/carrinho')}
          />
        )}

        {currentStep === STEPS.DRUG_CHECK && (
          <DrugCheckStep
            medicamentos={medicamentoIds}
            onValidate={handleDrugValidation}
            onCancel={handleDrugCancel}
          />
        )}

        {currentStep === STEPS.ADDRESS && (
          <AddressStep
            address={address}
            setAddress={setAddress}
            riskResult={riskResult}
            setRiskResult={setRiskResult}
            selectedPharmacy={selectedPharmacy}
            setSelectedPharmacy={setSelectedPharmacy}
            drugCheckResult={drugCheckResult}
            onNext={handleAddressSubmit}
            onBack={() => setCurrentStep(STEPS.DRUG_CHECK)}
          />
        )}

        {currentStep === STEPS.PAYMENT && (
          <PaymentStep
            total={getTotal()}
            paymentMethod={paymentMethod}
            setPaymentMethod={setPaymentMethod}
            loading={loading}
            onSubmit={handlePaymentSubmit}
            onBack={() => setCurrentStep(STEPS.ADDRESS)}
          />
        )}

        {currentStep === STEPS.CONFIRMATION && (
          <ConfirmationStep onClose={() => navigate('/pedidos')} />
        )}
      </div>

      {error && (
        <div className="error-banner">
          <strong>Erro:</strong> {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ==================== Sub-components ====================

function ItemsReviewStep({ items, total, onNext, onBack }) {
  return (
    <div className="step-content">
      <h2>Revisar Itens</h2>
      <div className="items-list">
        {items.map(item => (
          <div key={item.id} className="item-row">
            <div className="item-info">
              <h3>{item.nome}</h3>
              <p>Qty: {item.quantidade}</p>
            </div>
            <div className="item-price">
              R$ {(item.preco * item.quantidade).toFixed(2)}
            </div>
          </div>
        ))}
      </div>
      <div className="total-section">
        <h3>Total: R$ {total.toFixed(2)}</h3>
      </div>
      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn-primary" onClick={onNext}>
          Verificar Medicamentos →
        </button>
      </div>
    </div>
  );
}

function DrugCheckStep({ medicamentos, onValidate, onCancel }) {
  return (
    <div className="step-content">
      <h2>Verificação de Medicamentos</h2>
      <p className="description">
        Estamos verificando possíveis interações medicamentosas e risco de fraude...
      </p>
      <DrugInteractionAlert
        medicamentos={medicamentos}
        onValidate={onValidate}
        onCancel={onCancel}
      />
    </div>
  );
}

function AddressStep({
  address,
  setAddress,
  riskResult,
  setRiskResult,
  selectedPharmacy,
  setSelectedPharmacy,
  drugCheckResult,
  onNext,
  onBack,
}) {
  const [pharmacies, setPharmacies] = useState([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(false);

  useEffect(() => {
    fetchPharmacies();
  }, []);

  const fetchPharmacies = async () => {
    setLoadingPharmacies(true);
    try {
      const response = await fetch(apiUrl('/pharmacies'));
      const data = await response.json();
      setPharmacies(data.data?.docs || []);
    } catch (error) {
      console.error('Erro ao buscar farmácias:', error);
    } finally {
      setLoadingPharmacies(false);
    }
  };

  const handlePharmacySelect = async (pharmacy) => {
    setSelectedPharmacy(pharmacy);
    // Verificar risco nesta farmácia
    // const result = await checkRisk(pharmacy._id);
    // setRiskResult(result);
  };

  return (
    <div className="step-content">
      <h2>Selecione Farmácia e Endereço de Entrega</h2>

      <div className="section">
        <h3>Farmácia</h3>
        <div className="pharmacies-grid">
          {pharmacies.map(pharmacy => (
            <div
              key={pharmacy._id}
              className={`pharmacy-card ${selectedPharmacy?._id === pharmacy._id ? 'selected' : ''}`}
              onClick={() => handlePharmacySelect(pharmacy)}
            >
              <h4>{pharmacy.nome}</h4>
              <p>{pharmacy.endereco}</p>
              {drugCheckResult?.requerFarmaceutico && (
                <PharmacistStatus pharmacyId={pharmacy._id} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h3>Endereço de Entrega</h3>
        <form className="address-form">
          <input
            type="text"
            placeholder="Logradouro"
            value={address.logradouro || ''}
            onChange={e => setAddress({ ...address, logradouro: e.target.value })}
          />
          <input
            type="text"
            placeholder="Número"
            value={address.numero || ''}
            onChange={e => setAddress({ ...address, numero: e.target.value })}
          />
          <input
            type="text"
            placeholder="Complemento (opcional)"
            value={address.complemento || ''}
            onChange={e => setAddress({ ...address, complemento: e.target.value })}
          />
          <input
            type="text"
            placeholder="Bairro"
            value={address.bairro || ''}
            onChange={e => setAddress({ ...address, bairro: e.target.value })}
          />
        </form>
      </div>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn-primary" onClick={onNext} disabled={!selectedPharmacy || !address.logradouro}>
          Pagamento →
        </button>
      </div>
    </div>
  );
}

function PaymentStep({ total, paymentMethod, setPaymentMethod, loading, onSubmit, onBack }) {
  const paymentMethods = [
    { id: 'pix', label: 'PIX - Instantâneo', icon: '💳' },
    { id: 'cartao', label: 'Cartão de Crédito', icon: '💳' },
    { id: 'dinheiro', label: 'Dinheiro na Entrega', icon: '💵' },
  ];

  return (
    <div className="step-content">
      <h2>Forma de Pagamento</h2>
      <p className="description">Total a pagar: R$ {total.toFixed(2)}</p>

      <div className="payment-methods">
        {paymentMethods.map(method => (
          <label key={method.id} className="payment-option">
            <input
              type="radio"
              name="payment"
              value={method.id}
              checked={paymentMethod === method.id}
              onChange={e => setPaymentMethod(e.target.value)}
            />
            <span className="method-label">
              <span className="icon">{method.icon}</span>
              <span className="label">{method.label}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="actions">
        <button className="btn-secondary" onClick={onBack}>
          ← Voltar
        </button>
        <button className="btn-primary" onClick={onSubmit} disabled={loading}>
          {loading ? 'Processando...' : 'Confirmar Pedido'}
        </button>
      </div>
    </div>
  );
}

function ConfirmationStep({ onClose }) {
  return (
    <div className="step-content confirmation">
      <div className="success-icon">✅</div>
      <h2>Pedido Realizado com Sucesso!</h2>
      <p>Seu pedido foi criado e está sendo processado.</p>
      <p>Você receberá atualizações em tempo real sobre sua entrega.</p>
      <button className="btn-primary" onClick={onClose}>
        Acompanhar Pedido
      </button>
    </div>
  );
}

export default CheckoutIA
