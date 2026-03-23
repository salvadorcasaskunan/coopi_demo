// SCRIPT BOTMAKER: obtenerCategorias_CRM
// Consulta el proxy y guarda las categorias de caso del CRM
// Usar antes del nodo que muestra las opciones de tipo de reclamo

const main = async () => {
  const PROXY_URL = "https://coopi-demo.onrender.com";

  const response = await fetch(`${PROXY_URL}/api/categorias`);
  const data = await response.json();

  bmconsole.log(`[CATEGORIAS] Respuesta: ${JSON.stringify(data)}`);

  if (data.success && data.categorias?.length > 0) {
    // Guardar el array completo para usarlo en seleccion posterior
    user.set("categorias_lista", JSON.stringify(data.categorias));
    user.set("categorias_total", data.total);
  } else {
    user.set("categorias_lista", "[]");
    user.set("categorias_total", 0);
    bmconsole.log("[CATEGORIAS] No se encontraron categorias");
  }
};

main()
  .catch(err => {
    const errorMessage = `[CATEGORIAS] Error ${err.message}`;
    user.set("ca_error", errorMessage);
    user.set("categorias_lista", "[]");
    bmconsole.log(errorMessage);
  })
  .finally(result.done);
