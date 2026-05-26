const axios = require("axios");

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function buscarCep(cep) {
  cep = cep.replace(/\D/g, "");

  if (cep.length !== 8) {
    throw createError("CEP inválido", 400);
  }

  try {
    const response = await axios.get(`https://viacep.com.br/ws/${cep}/json/`);
    const data = response.data || {};

    if (
      data.erro === true ||
      (!data.logradouro && !data.bairro && !data.localidade && !data.uf)
    ) {
      throw createError("CEP não encontrado", 404);
    }

    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf,
    };
  } catch (error) {
    if (error.statusCode) {
      throw error;
    }

    throw createError("Serviço de CEP indisponível no momento", 503);
  }
}

module.exports = { buscarCep };
