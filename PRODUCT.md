# Product

## Register

product

## Users

Equipo Grantt (múltiples usuarios): personas que gestionan certificaciones SEC de productos eléctricos importados. Usan la app en tres contextos distintos:
- **Oficina (desktop/laptop)**: procesar facturas + DINs, revisar solicitudes, generar Excel
- **Campo/bodega (móvil)**: inspección física de marcado de productos, escaneo QR
- **Tablet**: combinado — inspección + revisión

El usuario típico conoce el proceso de certificación pero no es técnico. Necesita que la app haga el trabajo pesado (extracción, matching, formato) sin errores.

## Product Purpose

AutoSeguimiento Grantt automatiza la generación del formulario "Solicitud de Seguimiento" (Cesmec FORM 131-503-001) para certificación SEC chilena. Reemplaza un proceso manual propenso a errores: leer Invoice PDF + DIN, cruzar con BD de productos certificables, asignar ítems DIN por subset-sum, y llenar el Excel oficial con el formato exacto requerido.

Dos módulos:
1. **Control de Calidad**: inspección de marcado físico de productos (checklist SI/NO + verificación QR)
2. **Solicitud de Seguimiento**: extracción de datos → revisión → generación Excel → subida a Drive

Éxito = el equipo genera una solicitud correcta en minutos, no en horas.

## Brand Personality

Eficiente, precisa, profesional.

Tono: herramienta de trabajo interna — sin marketingspeak. Directa como un dashboard financiero. Los errores se reportan claramente. Las acciones tienen confirmación visual inmediata.

## Anti-references

- **Formulario de gobierno**: grises pesados, tablas de bordes gruesos, tipografía Times New Roman, look de PDF official chileno
- **SaaS startup genérico**: cards azules brillantes, gradientes de colores, hero metrics gigantes, copy tipo "¡Potencia tu flujo de trabajo!"
- **ERP corporativo rígido**: demasiados paneles, menús de 50 ítems, iconografía de los 2000s
- Sin cream/sand/beige — el dark mode actual es correcto para una herramienta de trabajo nocturna y de campo

## Design Principles

1. **Herramienta, no producto**: la UI sirve al proceso, no se exhibe. Cada pantalla tiene una tarea clara. La estética no compite con el contenido.
2. **Feedback inmediato**: cada acción (lectura de PDF, match DIN, subida Drive) tiene estado visible — cargando, listo, error. El usuario nunca adivina si algo funcionó.
3. **Móvil-first en campo**: el módulo de inspección (checklist + QR) debe funcionar con guantes, en bodega, con luz mala. Targets de 44px mínimo, sin hover-only interactions.
4. **Confianza por precisión**: si el sistema asigna un ítem DIN o detecta un código, debe ser correcto — o admitirlo claramente para corrección manual. La UI no oculta incertidumbre.
5. **Dark mode es el modo**: el dark theme actual es intencional para uso intensivo y de campo. No es opcional ni decorativo.

## Accessibility & Inclusion

- WCAG AA: contraste ≥4.5:1 en texto normal, ≥3:1 en texto grande
- Touch targets mínimo 44×44px (esencial para uso móvil con guantes)
- Sin animaciones que bloqueen contenido; `prefers-reduced-motion` respetado
- Colores no son el único indicador de estado (SI/NO usa color + texto)
