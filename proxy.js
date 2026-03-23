const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CRM_URL = "https://crmcoops.democrm.com.ar";
const CLIENT_ID = "d272357e-2105-0fe5-6012-69398c79751b";
const CLIENT_SECRET = "admin-integrations";
const PORT = process.env.PORT || 3000;

// ─── AUTH ─────────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const response = await axios.post(
    `${CRM_URL}/Api/access_token`,
    {
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    {
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/vnd.api+json",
      },
    }
  );
  return response.data.access_token;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

// Headers comunes para llamadas a la API V8
function crmHeaders(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/vnd.api+json",
    "Accept": "application/vnd.api+json",
  };
}

// Trae TODOS los registros de un modulo paginando automaticamente
async function getAllRecords(token, moduleName, fields, pageSize = 100) {
  let allData = [];
  let pageNumber = 1;
  let totalPages = 1;

  while (pageNumber <= totalPages) {
    const response = await axios.get(
      `${CRM_URL}/Api/V8/module/${moduleName}`,
      {
        headers: crmHeaders(token),
        params: {
          [`fields[${moduleName}]`]: fields,
          "page[size]": pageSize,
          "page[number]": pageNumber,
        },
      }
    );

    const data = response.data?.data || [];
    allData = allData.concat(data);

    totalPages = response.data?.meta?.["total-pages"] || 1;
    pageNumber++;
  }

  return allData;
}

// ─── COOPERATIVAS ─────────────────────────────────────────────────────────────

async function getCooperativaByPhone(token, phone) {
  const normalizedPhone = phone.replace(/^\+/, "");
  const records = await getAllRecords(token, "KNN_Cooperativas", "id,name,phone_mobile");

  return records.find(c => {
    const mobile = (c.attributes?.phone_mobile || "").replace(/^\+/, "");
    return mobile === normalizedPhone;
  }) || null;
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

async function getFAQByRelationship(token, cooperativaId, position = 1) {
  const response = await axios.get(
    `${CRM_URL}/Api/V8/module/KNN_Cooperativas/${cooperativaId}/relationships/knn_cooperativas_knn_preguntas_frecuentes_1`,
    { headers: crmHeaders(token) }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;

  if (data.length === 1) return data[0];

  return data.find(f => {
    const pos = parseInt(f.attributes?.posicion_en_bot_c || f.attributes?.posicion_en_bot || 0);
    return pos === position;
  }) || data[0];
}

// ─── ENDPOINT: FAQ ────────────────────────────────────────────────────────────
// GET /api/faq?phone=5493518918142&position=1

app.get("/api/faq", async (req, res) => {
  const { phone, position = 1 } = req.query;
  if (!phone) {
    return res.status(400).json({ success: false, error: "El parametro 'phone' es requerido." });
  }
  try {
    const token = await getAccessToken();

    const cooperativa = await getCooperativaByPhone(token, phone);
    if (!cooperativa) {
      return res.status(404).json({ success: false, error: `No se encontro cooperativa con numero ${phone}.` });
    }

    const faq = await getFAQByRelationship(token, cooperativa.id, parseInt(position));
    if (!faq) {
      return res.status(404).json({ success: false, error: `No se encontro FAQ en posicion ${position}.`, cooperativa_id: cooperativa.id });
    }

    return res.json({
      success: true,
      cooperativa: cooperativa.attributes?.name,
      pregunta: faq.attributes?.name,
      descripcion: faq.attributes?.description,
    });
  } catch (error) {
    console.error("Error /api/faq:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: "Error interno.", detalle: error?.response?.data || error.message });
  }
});

// ─── ENDPOINT: CATEGORIAS DE CASO ────────────────────────────────────────────
// GET /api/categorias
// Devuelve todas las categorizaciones del caso (Reclamos, Sugerencias, Denuncia, etc.)

app.get("/api/categorias", async (req, res) => {
  try {
    const token = await getAccessToken();

    const records = await getAllRecords(token, "KNN_categoria_caso", "id,name");

    const categorias = records.map(r => ({
      id: r.id,
      nombre: r.attributes?.name || "",
    }));

    return res.json({
      success: true,
      total: categorias.length,
      categorias,
    });
  } catch (error) {
    console.error("Error /api/categorias:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: "Error interno.", detalle: error?.response?.data || error.message });
  }
});

// ─── ENDPOINT: SERVICIOS ─────────────────────────────────────────────────────
// GET /api/servicios
// Devuelve todos los servicios disponibles (Televisión, Internet, Energía Eléctrica, etc.)

app.get("/api/servicios", async (req, res) => {
  try {
    const token = await getAccessToken();

    const records = await getAllRecords(token, "KNN_Servicios", "id,name");

    const servicios = records.map(r => ({
      id: r.id,
      nombre: r.attributes?.name || "",
    }));

    return res.json({
      success: true,
      total: servicios.length,
      servicios,
    });
  } catch (error) {
    console.error("Error /api/servicios:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: "Error interno.", detalle: error?.response?.data || error.message });
  }
});

// ─── ENDPOINT: OCURRENCIAS ───────────────────────────────────────────────────
// GET /api/ocurrencias
// Devuelve todas las ocurrencias en servicio (Baja Velocidad, Sin Servicio, etc.)

app.get("/api/ocurrencias", async (req, res) => {
  try {
    const token = await getAccessToken();

    const records = await getAllRecords(token, "KNN_Ocurrencia_en_servicio", "id,name");

    const ocurrencias = records.map(r => ({
      id: r.id,
      nombre: r.attributes?.name || "",
    }));

    return res.json({
      success: true,
      total: ocurrencias.length,
      ocurrencias,
    });
  } catch (error) {
    console.error("Error /api/ocurrencias:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: "Error interno.", detalle: error?.response?.data || error.message });
  }
});

// ─── DEBUG ────────────────────────────────────────────────────────────────────
// Eliminar en produccion

app.get("/api/debug-cooperativas", async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${CRM_URL}/Api/V8/module/KNN_Cooperativas`,
      {
        headers: crmHeaders(token),
        params: { "page[size]": 2 },
      }
    );
    return res.json(response.data);
  } catch (error) {
    return res.status(500).json({ error: error?.response?.data || error.message });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── SELF-PING ────────────────────────────────────────────────────────────────

const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;
function startSelfPing() {
  if (!RENDER_URL) return;
  setInterval(async () => {
    try {
      await axios.get(`${RENDER_URL}/health`);
      console.log(`[Self-ping] OK - ${new Date().toISOString()}`);
    } catch (err) {
      console.warn(`[Self-ping] Fallo: ${err.message}`);
    }
  }, 10 * 60 * 1000);
}

app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
  startSelfPing();
});
