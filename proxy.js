const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const CRM_URL = "https://crmcoops.democrm.com.ar";
const CLIENT_ID = "d272357e-2105-0fe5-6012-69398c79751b";
const CLIENT_SECRET = "admin-integrations";
const PORT = process.env.PORT || 3000;

// ─── OBTENER TOKEN OAUTH2 ─────────────────────────────────────────────────────
async function getAccessToken() {
  const response = await axios.post(
    `${CRM_URL}/api/v8/oauth2/token`,
    new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );
  return response.data.access_token;
}

// ─── BUSCAR COOPERATIVA POR NÚMERO DE WHATSAPP ────────────────────────────────
async function getCooperativaByPhone(token, phone) {
  // Normalizar: sacar el "+" si viene con él
  const normalizedPhone = phone.replace(/^\+/, "");

  const response = await axios.get(
    `${CRM_URL}/api/v8/modules/KNN_Cooperativas`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        "filter[operator]": "and",
        "filter[KNN_Cooperativas.whatsapp][eq]": normalizedPhone,
        "fields[KNN_Cooperativas]": "id,name,whatsapp",
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;
  return data[0]; // devuelve la primera cooperativa que matchea
}

// ─── BUSCAR PREGUNTA FRECUENTE POR COOPERATIVA Y POSICION ────────────────────
async function getFAQ(token, cooperativaId, position = 1) {
  const response = await axios.get(
    `${CRM_URL}/api/v8/modules/KNN_Preguntas_Frecuentes`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        "filter[operator]": "and",
        "filter[KNN_Preguntas_Frecuentes.cooperativa_id][eq]": cooperativaId,
        "filter[KNN_Preguntas_Frecuentes.posicion_en_bot][eq]": position,
        "filter[KNN_Preguntas_Frecuentes.activo][eq]": 1,
        "fields[KNN_Preguntas_Frecuentes]":
          "id,name,description,posicion_en_bot,activo",
      },
    }
  );

  const data = response.data?.data;
  if (!data || data.length === 0) return null;
  return data[0];
}

// ─── ENDPOINT PRINCIPAL ───────────────────────────────────────────────────────
// GET /api/faq?phone=5493537316762&position=1
app.get("/api/faq", async (req, res) => {
  const { phone, position = 1 } = req.query;

  if (!phone) {
    return res
      .status(400)
      .json({ success: false, error: "El parámetro 'phone' es requerido." });
  }

  try {
    // 1. Obtener token
    const token = await getAccessToken();

    // 2. Buscar cooperativa por número de WhatsApp
    const cooperativa = await getCooperativaByPhone(token, phone);
    if (!cooperativa) {
      return res.status(404).json({
        success: false,
        error: `No se encontró ninguna cooperativa con el número ${phone}.`,
      });
    }

    // 3. Buscar la FAQ según posición
    const faq = await getFAQ(token, cooperativa.id, parseInt(position));
    if (!faq) {
      return res.status(404).json({
        success: false,
        error: `No se encontró FAQ en posición ${position} para la cooperativa ${cooperativa.attributes?.name}.`,
      });
    }

    // 4. Devolver la descripción
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

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── SELF-PING (evita sleep en Render free tier) ──────────────────────────────
// Render duerme las instancias gratuitas tras 15 min de inactividad.
// Este ping cada 10 minutos las mantiene activas.
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
      console.warn(`[Self-ping] Falló: ${err.message}`);
    }
  }, 10 * 60 * 1000); // cada 10 minutos
}

app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
  startSelfPing();
});
