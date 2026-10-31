# Cartera Privada · Guillen & Vera

Catálogo público de propiedades de Sergio Guillen y Tatiana Vera. Cada propiedad tiene su ficha con fotos, el video de TikTok reproducible en la página, recorrido completo, situación legal (hipoteca, SUNARP) y botones de WhatsApp para ambos.

## Cómo editar la web

Entra a **tudominio.com/admin**. Ahí hay tres secciones:

- **Propiedades**: crear, editar o marcar como vendida. La primera foto es la portada.
- **Preguntas frecuentes**: agregar o cambiar preguntas y respuestas.
- **Ajustes generales**: nombre del catálogo, texto de portada, números de WhatsApp y redes.

Al guardar, la web se vuelve a publicar sola en uno o dos minutos.

### Exclusividad

Cada propiedad guarda la **fecha de firma** y los **meses de vigencia** del contrato de exclusividad. Cuando vence, la propiedad deja de aparecer en la web (las vendidas se quedan siempre como portafolio). Para renovar, abre la propiedad y usa **Agregar renovación** (3, 6 o 12 meses). Estas fechas no se muestran al público.

### Video de TikTok

Pega el link completo del video, el que tiene `/video/` seguido de números (por ejemplo `https://www.tiktok.com/@sergioguillen/video/7351234567890123456`). Los links cortos tipo `vm.tiktok.com` no sirven: ábrelos en el navegador y copia el link largo.

### Proyectos con varias tipologías

En la propiedad, llena **Tipologías** (una fila por tipo: dormitorios, área, precio desde, pisos, unidades, plano). Con eso la web la muestra como proyecto, con el precio "Desde" más bajo y un listado que se filtra por dormitorios. Marca **Agotada** cuando una tipología se acabe.

### Mapa

En **Ubicación** marca el punto en el mapa. La web solo muestra un círculo de unos 350 m alrededor de un punto corrido, nunca la dirección.

### Solicitudes de visita

Llegan a Netlify → **Forms** → `solicitud-visita`. Para recibirlas por correo: Netlify → Project configuration → Notifications → Emails and webhooks → Form submission notifications → agrega el correo de cada asesor.

### Cambiar el nombre o los asesores

En **Ajustes generales** se cambian el nombre del catálogo, la marca y la lista de asesores. Si alguien sale, se borra de la lista y desaparece de toda la web (botones de WhatsApp, portada, ícono).

## Puesta en marcha (una sola vez)

1. **Netlify**: en app.netlify.com, "Add new site" → "Import an existing project" → GitHub → `Guillen-Vera`. La configuración ya está en `netlify.toml`.
2. **Acceso al panel**: cada persona que edite necesita una cuenta de GitHub con acceso a este repositorio (Settings → Collaborators). En /admin se entra con "Sign in with token" usando un token personal de GitHub con permiso de escritura sobre este repositorio.
3. **Reconstrucción diaria** (para que las exclusividades vencidas se oculten solas): en Netlify, Site configuration → Build & deploy → Build hooks → crear uno. Copiar la URL y guardarla en GitHub como secreto `NETLIFY_BUILD_HOOK` (Settings → Secrets and variables → Actions).
4. **Dominio**: en Netlify, Domain management → agregar el dominio comprado y cambiar `site` en `astro.config.mjs`.

## Para desarrollar

```sh
npm install
npm run dev
```
