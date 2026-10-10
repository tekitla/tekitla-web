# src/app/core

Servicios **singleton** de infraestructura que usa toda la app y que no son de
ninguna feature en particular.

- `auth/` — Firebase Auth (FirebaseAuthGateway), sesión (SessionStore), login con
  Google / logout / reacción a 401-403 (AuthService), guards.
- `layout/` — `Viewport` (breakpoint móvil como signal).
- `i18n/` — loader de traducciones, idioma por defecto y títulos de pestaña traducidos.

Qué NO va acá: componentes visuales (→ `ui/` o `layout/`), clientes HTTP de un
recurso (→ `features/<x>/data-access/`), el cliente HTTP base (→ `api/`).
