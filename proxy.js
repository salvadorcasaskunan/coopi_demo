const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CRM_URL = "https://crmcoops.democrm.com.ar";
const CLIENT_ID = "d272357e-2105-0fe5-6012-69398c79751b";
const CLIENT_SECRET = "admin-integrations";
const PORT = process.env.PORT || 3000;

// Obtenenemos token
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

//Buscamos cooperativa por teléfono
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

  return data.find(c => {
    const mobile = (c.attributes?.phone_mobile || "").replace(/^\+/, "");
    return mobile === normalizedPhone;
  }) || null;
}

// Traemos TODAS las FAQs
async function getAllFAQs(token, cooperativaId) {
  const response = await axios.get(
    `${CRM_URL}/Api/V8/module/KNN_Cooperativas/${cooperativaId}/relationships/knn_cooperativas_knn_preguntas_frecuentes_1`,
    {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json",
      },
      params: {
        "page[size]": 100,
      },
    }
  );

  return response.data?.data || [];
}

// ENDPOINT PRINCIPAL
app.get("/api/faq", async (req, res) => {
  const { phone, position } = req.query;

  if (!phone) {
    return res.status(400).json({
      success: false,
      error: "El parametro 'phone' es requerido.",
    });
  }

  if (!position) {
    return res.status(400).json({
      success: false,
      error: "El parametro 'position' es requerido.",
    });
  }

  try {
    const token = await getAccessToken();

    const cooperativa = await getCooperativaByPhone(token, phone);
    if (!cooperativa) {
      return res.status(404).json({
        success: false,
        error: `No se encontro cooperativa con numero ${phone}.`,
      });
    }

    const faqs = await getAllFAQs(token, cooperativa.id);

    if (!faqs.length) {
      return res.status(404).json({
        success: false,
        error: "No hay FAQs cargadas.",
      });
    }

    // Buscamos por posicion_en_bot
    const faq = faqs.find(f => {
      const pos = parseInt(f.attributes?.posicion_en_bot || 0);
      return pos === parseInt(position);
    });

    if (!faq) {
      return res.status(404).json({
        success: false,
        error: `No se encontro FAQ en posicion ${position}.`,
      });
    }

    // Armamos respuesta final
    return res.json({
      success: true,
      cooperativa: cooperativa.attributes?.name,
      posicion: parseInt(faq.attributes?.posicion_en_bot || 0),
      pregunta: faq.attributes?.name,
      descripcion: faq.attributes?.description,
    });

  } catch (error) {
    console.error("Error:", error?.response?.data || error.message);

    return res.status(500).json({
      success: false,
      error: "Error interno.",
      detalle: error?.response?.data || error.message,
    });
  }
});

// HEALTH CHECK
app.get("/health", (req, res) => res.json({ status: "ok" }));

// Envio de ping
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

// START
app.listen(PORT, () => {
  console.log(`Proxy corriendo en puerto ${PORT}`);
  startSelfPing();
});
