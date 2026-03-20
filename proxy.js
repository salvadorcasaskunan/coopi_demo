const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// CONFIG
const CRM_URL = "https://crmcoops.democrm.com.ar";
const CLIENT_ID = "d272357e-2105-0fe5-6012-69398c79751b";
const CLIENT_SECRET = "admin-integrations";
const PORT = process.env.PORT || 3000;

// OBTENER TOKEN OAUTH2
// Segun wiki: POST /Api/access_token con JSON body
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

// BUSCAR COOPERATIVA POR NUMERO DE WHATSAPP
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
        "filter[operator]": "and",
        "filter[KNN_Cooperativas.whatsapp_c][eq]": normalizedPhone,
        "fields[KNN_Cooperativas]": "id,name,whatsapp_c",
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;
  return data[0];
}

// BUSCAR PREGUNTA FRECUENTE POR COOPERATIVA Y POSICION
async function getFAQ(token, cooperativaId, position = 1) {
  const response = await axios.get(
    `${CRM_URL}/Api/V8/module/KNN_Preguntas_Frecuentes`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      params: {
        "filter[operator]": "and",
        "filter[KNN_Preguntas_Frecuentes.cooperativa_id_c][eq]": cooperativaId,
        "filter[KNN_Preguntas_Frecuentes.posicion_en_bot_c][eq]": position,
        "filter[KNN_Preguntas_Frecuentes.activo_c][eq]": 1,
        "fields[KNN_Preguntas_Frecuentes]": "id,name,description,posicion_en_bot_c,activo_c",
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;
  return data[0];
}

// ENDPOINT PRINCIPAL
// GET /api/faq?phone=5493537316762&position=1
app.get("/api/faq", async (req, res) => {
  const { phone, position = 1 } = req.query;

  if (!phone) {
    return res.status(400).json({ success: false, error: "El parametro 'phone' es requerido." });
  }

  try {
    const token = await getAccessToken();

    const cooperativa = await getCooperativaByPhone(token, phone);
    if (!cooperativa) {
      return res.status(404).json({
        success: false,
        error: `No se encontro ninguna cooperativa con el numero ${phone}.`,
      });
    }

    const faq = await getFAQ(token, cooperativa.id, parseInt(position));
    if (!faq) {
      return res.status(404).json({
        success: false,
        error: `No se encontro FAQ en posicion ${position} para la cooperativa ${cooperativa.attributes?.name}.`,
        cooperativa_id: cooperativa.id,
      });
    }

    return res.json({
      success: true,
      cooperativa: cooperativa.attributes?.name,
      pregunta: faq.attributes?.name,
      descripcion: faq.attributes?.description,
    });
  } catch (error) {
    console.error("Error en /api/faq:", error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: "Error interno del servidor.",
      detalle: error?.response?.data || error.message,
    });
  }
});

// HEALTH CHECK
app.get("/health", (req, res) => res.json({ status: "ok" }));

// SELF-PING para evitar sleep en Render free tier
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || null;

function startSelfPing() {
  if (!RENDER_URL) {
    console.log("RENDER_EXTERNAL_URL no definida, self-ping desactivado.");
    return;
  }
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
