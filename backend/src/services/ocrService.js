const fs = require("fs");
const path = require("path");
const Tesseract = require("tesseract.js");
const axios = require("axios");

if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1;
      this.b = 0;
      this.c = 0;
      this.d = 1;
      this.e = 0;
      this.f = 0;
    }

    multiplySelf() {
      return this;
    }

    preMultiplySelf() {
      return this;
    }

    translateSelf() {
      return this;
    }

    scaleSelf() {
      return this;
    }

    rotateSelf() {
      return this;
    }

    invertSelf() {
      return this;
    }
  };
}

if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
}

if (typeof globalThis.Path2D === "undefined") {
  globalThis.Path2D = class Path2D {
    constructor() {}
  };
}

const pdfParse = require("pdf-parse");

const CRM_REGEX = /CRM[\/\-\s]*([A-Z]{2})?[\/\-\s:]*(\d{4,6})/i;
const CRM_UF_REGEX = /CRM[\/\-\s]*([A-Z]{2})/i;
const DATE_REGEX = /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/;
const DOCTOR_REGEX = /(Dr\.?a?\.?\s+[A-ZÀ-Ú][a-zA-ZÀ-ú\s]+)/;
const DOCTOR_LABEL_REGEX = /M[ée]dico\s*:\s*([^\n\r]+)/i;
const PRINCIPIOS_ATIVOS = [
  "paracetamol",
  "ibuprofeno",
  "dipirona",
  "amoxicilina",
  "azitromicina",
  "omeprazol",
  "loratadina",
  "losartana",
  "metformina",
  "sinvastatina",
  "alprazolam",
  "clonazepam",
  "sertralina",
  "prednisona",
  "nimesulida",
];

async function extractTextFromImage(filePath) {
  try {
    const result = await Tesseract.recognize(filePath, "por");
    return result?.data?.text || "";
  } catch (error) {
    console.error(
      `Erro ao extrair texto da imagem ${path.basename(filePath)}:`,
      error.message,
    );
    return "";
  }
}

async function extractTextFromPDF(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);

    let dataBuffer;
    if (typeof pdfParse === "function") {
      dataBuffer = await pdfParse(buffer);
    } else if (typeof pdfParse.PDFParse === "function") {
      const parser = new pdfParse.PDFParse({ data: buffer });
      try {
        dataBuffer = await parser.getText();
      } finally {
        await parser.destroy();
      }
    } else {
      throw new Error("API do pdf-parse não suportada neste ambiente");
    }

    return dataBuffer?.text || "";
  } catch (error) {
    console.error(
      `Erro ao extrair texto do PDF ${path.basename(filePath)}:`,
      error.message,
    );
    return "";
  }
}

async function extractText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    return extractTextFromPDF(filePath);
  }

  return extractTextFromImage(filePath);
}

function parseBrazilianDate(rawText) {
  const match = rawText.match(DATE_REGEX);
  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
}

function findPrincipioAtivo(rawText) {
  const normalizedText = rawText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const principioAtivo = PRINCIPIOS_ATIVOS.find((item) =>
    normalizedText.includes(
      item
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    ),
  );

  return principioAtivo || null;
}

function parseReceiptData(rawText) {
  const safeText = rawText || "";
  const crmMatch = safeText.match(CRM_REGEX);
  const crmUfMatch = safeText.match(CRM_UF_REGEX);
  const doctorLabelMatch = safeText.match(DOCTOR_LABEL_REGEX);
  const doctorMatch = safeText.match(DOCTOR_REGEX);

  const crm = crmMatch ? crmMatch[2] : null;
  const ufCrm = crmMatch?.[1] || crmUfMatch?.[1] || null;
  const nomeMedico =
    doctorLabelMatch?.[1]?.trim() || doctorMatch?.[1]?.trim() || null;
  const dataEmissao = parseBrazilianDate(safeText);
  const principioAtivo = findPrincipioAtivo(safeText);

  return {
    nome_medico: nomeMedico,
    crm,
    uf_crm: ufCrm ? ufCrm.toUpperCase() : null,
    data_emissao: dataEmissao,
    principio_ativo: principioAtivo,
    raw_text: safeText,
  };
}

function getFirstDoctorRecord(payload) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (Array.isArray(payload.data)) {
    return payload.data[0] || null;
  }

  if (Array.isArray(payload.medicos)) {
    return payload.medicos[0] || null;
  }

  if (Array.isArray(payload.resultado)) {
    return payload.resultado[0] || null;
  }

  if (Array.isArray(payload.results)) {
    return payload.results[0] || null;
  }

  return payload;
}

function isDoctorActive(record) {
  const activeValue = record?.ativo ?? record?.situacao ?? record?.status;

  if (typeof activeValue === "boolean") {
    return activeValue;
  }

  if (typeof activeValue === "string") {
    const normalized = activeValue.toLowerCase();
    return normalized.includes("ativo") || normalized === "regular";
  }

  return false;
}

function getDoctorName(record) {
  return record?.nome || record?.nome_medico || record?.name || null;
}

function getDoctorSpecialty(record) {
  if (
    Array.isArray(record?.especialidades) &&
    record.especialidades.length > 0
  ) {
    return record.especialidades[0]?.nome || record.especialidades[0] || null;
  }

  return record?.especialidade || record?.especialidade_principal || null;
}

async function validateCRM(crm, uf) {
  if (!crm) {
    return {
      crm_valido: false,
      motivo: "CRM não encontrado na receita",
    };
  }

  try {
    const response = await axios.get(
      "https://sistemas.cfm.org.br/api/publico/v1/medicos/busca",
      {
        params: { crm, uf },
        timeout: 8000,
      },
    );

    const record = getFirstDoctorRecord(response.data);
    if (record && isDoctorActive(record)) {
      return {
        crm_valido: true,
        medico_encontrado: getDoctorName(record),
        especialidade: getDoctorSpecialty(record),
        verificado_em: new Date(),
      };
    }

    return {
      crm_valido: false,
      motivo: "Não foi possível validar o CRM automaticamente",
      verificado_em: new Date(),
    };
  } catch (error) {
    console.error(`Erro ao validar CRM ${crm}/${uf || "--"}:`, error.message);
    return {
      crm_valido: false,
      motivo: "Não foi possível validar o CRM automaticamente",
      verificado_em: new Date(),
    };
  }
}

module.exports = { extractText, parseReceiptData, validateCRM };
