const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CRM_URL = "https://crmcoops.democrm.com.ar";
const CLIENT_ID = "d272357e-2105-0fe5-6012-69398c79751b";
const CLIENT_SECRET = "admin-integrations";
const PORT = process.env.PORT || 3000;

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

// Busca la cooperativa comparando phone_mobile en memoria
async function getCooperativaByPhone(token, phone) {
  const normalizedPhone = phone.replace(/^\+/, "");
  const response = await axios.get(
    `${CRM_URL}/Api/V8/module/KNN_Cooperativas`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      params: {
        "fields[KNN_Cooperativas]": "id,name,phone_mobile",
        "page[size]": 50,
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;

  // Buscar la cooperativa que tenga ese phone_mobile
  return data.find(c => {
    const mobile = (c.attributes?.phone_mobile || "").replace(/^\+/, "");
    return mobile === normalizedPhone;
  }) || null;
}

// Busca FAQs via relationship de la cooperativa
async function getFAQByRelationship(token, cooperativaId, position = 1) {
  const response = await axios.get(
    `${CRM_URL}/Api/V8/module/KNN_Cooperativas/${cooperativaId}/relationships/knn_cooperativas_knn_preguntas_frecuentes_1`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;

  // Si hay un solo resultado o no hay posicion, devolver el primero
  if (data.length === 1) return data[0];

  // Buscar por posicion_en_bot
  return data.find(f => {
    const pos = parseInt(f.attributes?.posicion_en_bot_c || f.attributes?.posicion_en_bot || 0);
    return pos === position;
  }) || data[0];
}

// ENDPOINT PRINCIPAL
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
    console.error("Error:", error?.response?.data || error.message);
    return res.status(500).json({ success: false, error: "Error interno.", detalle: error?.response?.data || error.message });
  }
});

// DEBUG: Ver registros de KNN_Cooperativas sin filtro
app.get("/api/debug-cooperativas", async (req, res) => {
  try {
    const token = await getAccessToken();
    const response = await axios.get(
      `${CRM_URL}/Api/V8/module/KNN_Cooperativas`,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/vnd.api+json",
          "Accept": "application/vnd.api+json",
        },
        params: { "page[size]": 2 },
      }
    );
    return res.json(response.data);
  } catch (error) {
    return res.status(500).json({ error: error?.response?.data || error.message });
  }
});

// HEALTH CHECK
app.get("/health", (req, res) => res.json({ status: "ok" }));

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
