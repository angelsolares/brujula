/* Service worker mínimo de BRÚJULA.
   Android solo deja mostrar avisos del sistema desde un service worker
   (registration.showNotification), y iPhone solo en la app instalada en la
   pantalla de inicio. No guarda nada en caché: la app siempre carga lo último. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Al tocar el aviso: volver a la app (o abrirla) en la sección indicada.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil((async () => {
    const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const ventana of ventanas) {
      if ("focus" in ventana) {
        if ("navigate" in ventana) { try { await ventana.navigate(destino); } catch (_) { /* misma pestaña */ } }
        return ventana.focus();
      }
    }
    return self.clients.openWindow(destino);
  })());
});
