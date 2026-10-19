# CI-01 · Efficient CI & Main Desktop Artifacts

## Estado y alcance

CI-01 mantiene la certificación completa de Pull Requests y agrega la publicación de un instalador certificado únicamente desde `main`. No crea releases ni tags, no modifica la aplicación y no toca bases de datos locales.

Baseline verificado: `origin/main` en `9f3113c0c6532f751094fa075bb879a4eef9c81d`.

## Ejecución

```text
Pull request
  ├─ Forge quality
  │    ├─ Backend quality
  │    ├─ Frontend quality
  │    └─ Chromium smoke (después de Backend + Frontend)
  ├─ CodeQL (GitHub Advanced Security)
  └─ Forge Windows desktop
       ├─ Classify desktop changes
       └─ Windows installed-product smoke (sólo si no es documentación-only)

Push aprobado a main
  ├─ Forge quality
  ├─ CodeQL
  └─ Forge main desktop artifact (workflow_run de Quality)
       ├─ verifica repositorio, branch, conclusión y head_sha
       ├─ espera CodeQL exitoso para ese mismo SHA
       └─ workflow reusable Windows con checkout exacto y publicación oficial
```

La ruta `main-desktop.yml` no se activa para Pull Requests. El evento `workflow_run` se valida contra el repositorio actual, `main` y una conclusión `success`; el build recibe el `head_sha` del evento y nunca consulta el HEAD móvil de `main` para sustituirlo. El dispatch manual exige el SHA completo que actualmente apunta `main`.

## Política de Pull Requests

`desktop-windows.yml` conserva el check `Windows x64 build and installed-product smoke`. No utiliza filtros `paths` a nivel workflow, evitando checks requeridos permanentemente pendientes. En Pull Requests, el clasificador hace checkout del `base.sha` confiable antes de leer únicamente los nombres de rutas del diff; la PR no puede cambiar la lógica de clasificación para omitirse. Un job de clasificación usa `scripts/ci_change_policy.py`:

- Sólo Markdown, `docs/` y avisos/documentos legales son `docs-only` y pueden omitir el empaquetado costoso.
- Cambios en frontend, backend, migraciones, contratos, Rust/Tauri, lockfiles, scripts de runtime/desktop, configuración o workflows requieren Desktop.
- Eventos que no son Pull Request requieren Desktop.

Los artefactos exitosos de PR son temporales y se nombran `forge-windows-x64-pr-<sha>-<run-id>`. No representan un instalador oficial. Los runs de PR se cancelan sólo dentro del mismo número de PR; los runs de `main` nunca se cancelan automáticamente.

## Calidad y caché

`quality.yml` conserva las gates de Ruff, mypy, pytest, Alembic, secret audit, ESLint, TypeScript, arquitectura, Vitest/coverage, build, Chromium, aislamiento y documentación. Backend y frontend permanecen en paralelo; Chromium sigue dependiendo de ambos. Se mantienen las cachés de npm y uv.

No se agregó caché de Cargo/`target`: el baseline no proporcionaba una comparación fiable y una caché nativa de Windows puede costar más en restauración/subida y conservar artefactos compilados obsoletos. La decisión se puede revisar con mediciones de runs posteriores.

## Artefacto certificado de main

El workflow reusable `.github/workflows/desktop-certified.yml` recibe un SHA explícito y ejecuta con el lockfile existente:

- Rust metadata, fmt, tests y Clippy con `--locked`.
- NSIS 3.13.0 con reintentos acotados, fallback oficial y SHA-256 fijados.
- Build del instalador NSIS.
- UI Automation nativa sobre el producto instalado.
- Seguridad Desktop, importación JSON, jerarquía, persistencia, exportación, desinstalación y reinstalación.
- Verificación del `.sha256` del instalador.

Después de todos esos pasos genera `desktop-provenance.json` con el esquema `forge-ci-provenance-v1`, el SHA completo, workflow run ID, runner, versiones de Node/npm/Python/uv/Rust/NSIS, nombre del instalador, checksum y resultado `CERTIFIED_MAIN`.

El único nombre oficial es:

```text
forge-windows-x64-main-<full-sha>
```

Incluye `Forge_0.1.0_x64-setup.exe`, su `.sha256`, provenance y capturas/evidencia del smoke. Retención: 14 días. Los diagnósticos de fallos se archivan con un nombre separado y nunca se publican con el nombre certificado. No se usa `continue-on-error`.

## Recuperación y dispatch manual

Si Quality falla, el guard de `main-desktop.yml` termina antes de iniciar Windows. Si CodeQL falla o no aparece para el SHA exacto dentro del límite de espera, tampoco se construye ni publica el instalador. Un fallo de NSIS, build, checksum o installed-product smoke deja el workflow en rojo; el artefacto oficial no se sube.

Para repetir una certificación manual desde GitHub Actions:

1. Leer el SHA actual de `main`.
2. Ejecutar **Forge main desktop artifact → Run workflow**.
3. Introducir el SHA completo.
4. El guard rechaza cualquier SHA que ya no sea el `main` actual.

Una certificación post-merge requiere revisar el run de `Forge quality`, el run de CodeQL para el mismo SHA, el run de `Forge main desktop artifact`, el checksum y el contenido del artefacto. Esto es distinto de una validación de PR y distinto de un GitHub Release.

## Mediciones observadas

| Ejecución | Resultado | Duración observada |
| --- | --- | ---: |
| Quality sobre baseline `main` (`39269774686`) | PASS | 4m21s |
| CodeQL sobre baseline `main` (`39269775183`) | PASS | 5m29s |
| Quality de PR (`39240954703`) | PASS | 4m42s |
| Windows PR instalado (`39240954657`) | PASS | 14m01s |
| Windows exact-head dispatch anterior (`39242765873`) | PASS | 9m14s |
| Main artifact post-merge | Pendiente de merge | No medido |

El baseline no tenía job Windows para `push` a `main`, por lo que no existía una duración comparable ni un artefacto certificado. CI-01 no inventa esa medición: se debe registrar después del primer merge exitoso.

## Etapas de entrega

### Stage A · READY_FOR_REVIEW

Incluye el commit y Draft PR de CI-01, las pruebas de política, los checks aplicables de PR y la evidencia de que los artefactos de PR están marcados como temporales. No permite afirmar que existe un artefacto certificado de `main` mientras la rama no esté integrada.

### Stage B · POST_MERGE_CERTIFIED

Después de la autorización y merge del propietario, confirmar el SHA resultante de `main`, Quality, CodeQL, `main-desktop.yml`, el artefacto `forge-windows-x64-main-<sha>`, provenance, checksum y evidencia del installed-product smoke. Esta etapa no publica release.
