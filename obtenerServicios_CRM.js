// SCRIPT BOTMAKER: obtenerServicios_CRM
// Consulta el proxy y guarda los servicios disponibles del CRM
// Usar antes del nodo que muestra las opciones de servicio

const main = async () => {
  const PROXY_URL = "https://coopi-demo.onrender.com";

  const response = await fetch(`${PROXY_URL}/api/servicios`);
  const data = await response.json();

  bmconsole.log(`[SERVICIOS] Respuesta: ${JSON.stringify(data)}`);

  if (data.success && data.servicios?.length > 0) {
    user.set("servicios_lista", JSON.stringify(data.servicios));
    user.set("servicios_total", data.total);
  } else {
    user.set("servicios_lista", "[]");
    user.set("servicios_total", 0);
    bmconsole.log("[SERVICIOS] No se encontraron servicios");
  }

  // Setear configuracion para armarLista_CRM
  user.set("lista_input_key", "servicios_lista");
  user.set("lista_output_key", "lista_mostrar");
};

main()
  .catch(err => {
    const errorMessage = `[SERVICIOS] Error ${err.message}`;
    user.set("ca_error", errorMessage);
    user.set("servicios_lista", "[]");
    bmconsole.log(errorMessage);
  })
  .finally(result.done);
