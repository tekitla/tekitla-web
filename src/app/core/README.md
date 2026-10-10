# src/app/core

Servicios **singleton** de infraestructura que usa toda la app y que no son de
ninguna feature en particular.

- `auth/` — sesión (SessionStore), login/refresh/logout (AuthService), guard.
- `i18n/` — loader de traducciones e idioma por defecto.

Qué NO va acá: componentes visuales (→ `ui/` o `layout/`), clientes HTTP de un
recurso (→ `features/<x>/data-access/`), el cliente HTTP base (→ `api/`).
