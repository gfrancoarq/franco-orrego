# Franco & Orrego — Guía de implementación del nuevo sitio

## Qué contiene este paquete

| Archivo | Qué es |
|---|---|
| `index.html` | La nueva página principal (reemplaza home + página de tatuajes en una sola landing de conversión) |
| `tyc.html` | Términos y condiciones, rebrandeados |
| `politica-privacidad.html` | Privacidad, rebrandeada y sin referencias al borrado láser |
| `borrado.html` y `tattoo.html` | Páginas puente que redirigen al home (para que los links antiguos no den error 404) |
| `_redirects` | Redirecciones 301 para Netlify (mejor que las páginas puente: transfieren el SEO) |

## Cómo subirlo

1. Sube todos los archivos a la raíz del hosting, reemplazando los existentes.
2. La carpeta `assets/` actual **no se toca**: el nuevo sitio usa las mismas fotos que ya están subidas (IMG_2064.png, IMG_2176.png, etc., más 4fotofranco.png y mari-orrego-profile.jpg).
3. Si el sitio está en Netlify, el archivo `_redirects` hace las redirecciones 301 automáticamente. Si está en otro hosting, las páginas puente `borrado.html` y `tattoo.html` cumplen la misma función.

## Cómo activar la sección de reels

La sección "Así se ve una sesión con nosotros" está lista para tus videos verticales (9:16). Solo sube a la carpeta `assets/`:

- `reel-01.mp4`, `reel-02.mp4`, `reel-03.mp4` — los videos
- `reel-01-poster.jpg`, `reel-02-poster.jpg`, `reel-03-poster.jpg` — un fotograma de portada de cada uno (opcional pero recomendado)

Mientras los videos no existan, la sección muestra placeholders elegantes con el símbolo & ("Próximamente"), así que puedes publicar el sitio hoy sin esperar los videos.

Recomendación de peso: exporta cada reel a máximo 15–20 MB (1080×1920, H.264). Si pesan más, la página se sentirá lenta en celular, que es donde llega casi todo tu tráfico de Instagram.

## Decisiones tomadas (y por qué)

- **"Franco & Orrego", sin "Inc."** — el ampersand comunica sociedad entre dos profesionales de igual jerarquía (código de ateliers y casas de diseño). El "Inc." es jerga corporativa estadounidense, no corresponde legalmente en Chile y enfría la marca.
- **El & es el símbolo gráfico de la marca** — aparece gigante en el hero y al centro de la sección del dúo. Cuenta la historia: Franco ejecuta & Orrego dirige y co-crea.
- **Paleta "tinta curada"** — negro con subtono violeta (#120D17) como base, texto color hueso, violeta claro (#9C7BC9) como único acento. Fundamento: la tinta negra sana bajo la piel hacia un tono azul-violeta. Es tu morado, pero premium.
- **Tipografía** — Pirata One (blackletter: el lettering gótico del tatuaje) para títulos y logo; Archivo para el cuerpo. Además: grano de tinta sobre todo el sitio, marcos dobles tipo flash sheet en fotos y videos, números romanos en el método y ornamentos (✦ ✠) en secciones y footer.
- **Un solo llamado a la acción en todo el sitio: cotizar por WhatsApp.** Botón en nav, hero, sección agenda y botón flotante permanente. Cada uno lleva un mensaje pre-escrito distinto para que sepas desde dónde te escriben.
- **Borrado láser eliminado por completo**, conservando lo que vivía en esa página: dirección, horario, mapa y datos de contacto ahora están en la sección "Dónde estamos" del home.
- **Sistema 3K fuera del menú y del footer** — vende a tatuadores, no a clientes, y diluye el posicionamiento premium. El archivo `sistema-3k.html` puede seguir vivo en el servidor y lo compartes por link directo cuando quieras (no lo incluí en este paquete; el actual sigue funcionando).
- **Mari con su lugar** — sección "Dos apellidos, un solo estándar" con las dos personas al mismo nivel visual: Franco (Artista residente · Ejecuta) & Mari Orrego (Directora del estudio · Co-crea), con sus credenciales de dirección técnica y asepsia como sello de seguridad del estudio.
- **Señales de escasez tipo estudio premium** — "cupos limitados por mes", "a puerta cerrada", "un proyecto a la vez". Es lo que hacen Bang Bang (NYC) y No Regrets (Miami) para sostener precios altos.
- **SEO** — títulos y metadescripciones nuevos, datos estructurados de negocio local (TattooParlor con dirección, horario y coordenadas para aparecer bien en Google Maps/búsquedas locales), y redirecciones 301 de las URLs viejas.

## Cambios de la versión 2

- Estética "underground premium": blackletter (Pirata One), grano de tinta, marcos de flash sheet, ornamentos.
- FAQ de precio: preparada para publicar el piso de precio cuando definan los valores (hay un comentario marcado dentro de index.html con la frase lista para completar).
- Reagendamiento: sin costo avisando por mensaje con 7+ días (sin límite de veces). Actualizado en FAQ y TyC.
- Anestesia en crema agregada a la FAQ del dolor (comprar por cuenta propia o encargarla al estudio).
- Garantía de retoque eliminada del home y reemplazada en TyC por la política real: retoques no incluidos, el estudio ofrece retoque sin costo solo a su criterio al ver la pieza terminada.
- Acompañantes: sin excepciones, salvo tutor legal de menor de edad que firma consentimiento. Actualizado en FAQ y TyC.
- Horarios reformulados: "Sesiones solo con cita previa, de mañana, tarde y noche, lunes a sábado y algunos domingos según proyecto" + "Respondemos WhatsApp de lunes a sábado". La variabilidad ahora se lee como flexibilidad premium, no como desorden.

## Cambios de la versión 3

- **Precio publicado:** "Sesiones de 4 horas desde $129.000" en la FAQ de precio y bajo el botón de la sección Agenda.
- **Horarios depurados:** sin "noche", sin días de la semana, sin domingos. Ahora: "Solo con cita previa. Bloques de mañana y tarde, coordinados según tu proyecto" + FAQ que indica que la última sesión del día comienza a las 17:00 hrs. Los días solo aparecen en "Mensajes" (respondemos lunes a sábado).
- **Retratos del dúo:** limitados a 390px de ancho en desktop (en móvil siguen a ancho completo).
- Detalles finos: selección de texto en violeta, anclas del menú que ya no quedan tapadas por el header fijo, hover violeta en las preguntas frecuentes.

## Cambios de la versión 4

- **Mari Orrego** (con i) en todo el sitio — como le dicen de verdad.
- Footer: "Tinta hecha a mano" reemplazado por **"Tatuajes de autor · Santiago de Chile"** (sin ambigüedad sobre los insumos, que son de primera línea).
- **Nueva sección "Tú decides hasta dónde quieres llegar"** (frase de Mari), después del Método: explica los tres niveles de una misma pieza según sesiones dedicadas (I Base sólida / II Profundidad / III Pieza de colección). Es la herramienta de venta más importante del sitio: educa al cliente para elegir más sesiones. Úsenla también al cotizar por WhatsApp: "esta pieza en nivel II vale X, en nivel III vale Y".
- Sugerencia: la frase es perfecta como serie de contenido para Instagram — un carrusel o reel mostrando la misma pieza (o piezas comparables) en cada nivel.

## Kit de alineación de Instagram (el Instagram se adapta a la web, no al revés)

**Bio sugerida:**

> FRANCO & ORREGO
> ✠ Estudio privado · Santiago
> Blackwork & gran formato · Cupos limitados
> ⤵ Cotiza tu idea

Con el link del sitio (o un link directo a WhatsApp) en el campo de enlace.

**Portadas de destacados:** fondo #100B15, símbolo o palabra en #EDE4D3 con la tipografía Pirata One (está gratis en Google Fonts y disponible en Canva). Nombres sugeridos: Obras · Proceso · Agenda · Cuidados · Estudio.

**Colores de la marca para todo el contenido:**
- Fondo tinta: `#100B15`
- Hueso (texto): `#EDE4D3`
- Violeta (acento): `#A47FD6`

**Tipografías:** Pirata One para títulos y palabras destacadas; Archivo para textos largos.

**Regla del grid:** fotos de tatuajes con fondo y edición consistentes (mismo tono oscuro, sin filtros cálidos), intercaladas con placas de texto en blackletter sobre fondo tinta. Los reels que produzcas usan las mismas placas como portada — así el grid, los reels y la web se ven como una sola marca.

## Pendientes tuyos

1. Subir los reels y posters (cuando estén).
2. Cuando tengas las fotos editadas del último año, se agregan a la galería duplicando cualquier bloque `<button class="g-item">` en `index.html` (son 6 líneas por foto).
3. Foto de Mary: la actual (`mari-orrego-profile.jpg`) venía de la página de borrado; idealmente reemplázala por una en el estudio, con la misma luz que la de Franco.
4. Cuando esté lista la plataforma de agendamiento y pago de reserva, el flujo queda: sitio → WhatsApp → link de agenda. El sitio ya está diseñado para ese embudo.
