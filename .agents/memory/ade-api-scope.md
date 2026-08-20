---
name: ADE API scope
description: Scope decision for the current Scontrini Fiscali app and a future ADE integration.
---

The current app must remain on its existing Documento Commerciale Online flow. Obtaining official ADE REST API access is a separate future project; do not introduce RT/PEM/matricola/XML or fiscal-solution approval work into the current app unless the user explicitly decides to start that project.

Official starting point for future research: https://www.agenziaentrate.gov.it/portale/ricerca-estesa?keywords=api+rest+dco. The search results include historical API attachments, so future implementation must select the latest applicable ADE specifications and distinguish Gestionali from Dispositivi.

**Why:** The user will make the regulatory and architectural decisions personally; mixing API access with the later full fiscal-solution project caused confusion.

**How to apply:** Treat any future ADE REST work as an isolated discovery/integration effort and preserve the current DCO behavior until the user explicitly authorizes a migration.