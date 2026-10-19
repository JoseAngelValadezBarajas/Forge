# IMP-01: transferencia de Projects

Forge usa el contrato versionado `forge-project-import-v1` para transferir únicamente planeación de un Project. El contrato es deliberadamente estricto: los campos desconocidos, estados no soportados, referencias duplicadas, referencias inexistentes y ciclos de dependencias se rechazan antes de escribir.

## Alcance del contrato

Un documento puede contener el nombre y descripción del Project, Epics, Features, Tasks, Acceptance Criteria y dependencias entre Features. Las referencias locales (`epic:`, `feature:`, `task:` y `criterion:`) son deterministas dentro del documento; Forge genera nuevos IDs al importar.

No se importan Runs, Decisions, Invariants, Evidence, Verifications, Context Packages ni Release Candidates. Los estados importados continúan siendo declaraciones de planeación y no constituyen evidencia de implementación, cumplimiento o verificación.

El esquema público está en [forge-project-import-v1.schema.json](schemas/forge-project-import-v1.schema.json). Hay un [ejemplo válido](examples/forge-project-import-v1.valid.json) y un [ejemplo rechazado](examples/forge-project-import-v1.invalid.json).

## Flujo de usuario

1. Abre **Projects** en el Workspace destino.
2. Selecciona **Import project**.
3. Elige un archivo `.json` o pega el documento completo.
4. Selecciona **Preview import**. Esta operación es de solo lectura y muestra el nombre, cantidades y fingerprint canónico.
5. Revisa el resumen y selecciona **Confirm import**. Forge envía exactamente el documento y fingerprint que fueron validados.
6. Si el nombre ya existe, cambia el documento o elige otro Workspace. La confirmación no sobreescribe Projects.

Si el contenido cambia después del preview, el fingerprint deja de coincidir y Forge rechaza la confirmación para evitar importar algo que no se revisó. La escritura ocurre en una sola transacción: ante cualquier error no quedan Project, Epics, Features, Tasks, criterios ni dependencias parciales.

Desde **Project overview**, **Export project** descarga un JSON estable y ordenado. También está disponible para Projects archivados porque exportar es una lectura. Exportar e importar en otro Workspace permite comprobar el round-trip; los IDs del destino son nuevos.

## Límites y seguridad

El API limita el cuerpo de importación a 8 MiB y limita cantidades por tipo. La operación queda aislada por Workspace, aplica la unicidad transaccional de nombre y conserva los datos existentes. El transporte Desktop usa la misma ruta autorizada y el mismo límite; no se habilita acceso directo al sistema de archivos desde React.

Los fingerprints se calculan sobre JSON canónico, con orden estable de claves, arrays normalizados y dependencias ordenadas. No deben usarse como firma de autenticidad ni como prueba de que el contenido fue ejecutado.
