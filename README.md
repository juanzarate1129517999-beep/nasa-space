# Skylab Phoenix: inteligencia de seguridad contra incendios a partir de datos de microgravedad de NASA

**NASA Space Apps Challenge 2026 · "Flame in Freefall"** · Equipo **Skylab Phoenix**: Juan Sebastián Zárate (líder) y Javier Medina

📄 **Informe técnico:** [report/Informe_Skylab_Phoenix.pdf](report/Informe_Skylab_Phoenix.pdf) (37 páginas)

Skylab Phoenix convierte los datos de combustión de vuelo del repositorio NASA PSI en hallazgos de seguridad contra incendios para la base lunar, las naves y los trajes espaciales:

- **Ingeniería de datos:** limpia las 24 investigaciones de *Combustion Science*, lleva todo a un esquema común en unidades SI y registra cada corrección.
- **Análisis:** perfila y rankea cada investigación por hábitat.
- **Machine learning:** modelos validados con incertidumbre explícita, detección de "fuera de los datos" y recomendación del próximo experimento.

Fuente única de datos: [PSI, búsqueda "combustion"](https://psi.nasa.gov/physci/repo/search?q=combustion&data_source=psi&data_type=investigation) (licencia CC0).

## Cómo correrlo

```bash
python -m venv .venv && .venv/Scripts/activate      # Windows (en Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion      # catálogo de las investigaciones
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 PSI-21 PSI-22 PSI-23 PSI-25 PSI-26 PSI-39 PSI-47 PSI-60 PSI-62 PSI-68 PSI-69 PSI-98 PSI-99 PSI-100 PSI-101 PSI-102 PSI-106 PSI-107 PSI-115 PSI-117 PSI-142 PSI-159
python -m pipeline.run                              # silver -> gold -> modelos -> web/data (~3 s)
python scripts/serve.py                             # dashboard en http://127.0.0.1:8765
python report/figures.py                            # figuras del informe (SVG)
python report/build_report.py                       # informe PDF (requiere Edge o Chrome)
```

El dashboard es un sitio estático (`web/`). Se publica en GitHub Pages desde la rama `gh-pages`: después de cambiar `web/`, ejecuta `git subtree push --prefix web origin gh-pages`. Los modelos corren en el navegador, así que no hace falta servidor. También funciona abriendo `web/index.html` directamente, porque los datos se cargan desde `web/data/ember.js`.

## Estructura

| Ruta | Qué hace |
|---|---|
| `scripts/fetch_psi*.py` | **Bronze:** descarga metadatos y tablas experimentales desde la API pública de PSI |
| `pipeline/silver.py` | **Silver:** una función por experimento → esquema común, unidades SI, reglas de calidad y registro de correcciones |
| `pipeline/investigations.py` | **Gold:** perfil automático de las 24 investigaciones (qué varió, qué se fijó, qué se midió), similitud y ranking por hábitat |
| `pipeline/models.py` | **ML:** FLEX (P de autoextinción, logística + bootstrap de 200 modelos), CFI-G (prueba de temperatura límite), detección OOD y próximo experimento |
| `pipeline/gold.py` | Hallazgos con puntaje de evidencia, tablas analíticas y exportación a la web |
| `data/gold/` | Salidas versionadas: `ensayos.csv`, `investigaciones.csv`, `qc_log.csv`, `findings.json` |
| `web/` | Dashboard (HTML/CSS/JS + Plotly), tema oscuro con la paleta de marca y responsive |
| `report/` | Figuras (`figures.py`), capturas del dashboard y generador del informe PDF (`build_report.py`) |

## Resultados clave (salen del pipeline, no se escriben a mano)

- **Modelo FLEX:** AUC 0,88 y Brier 0,125, evaluado dejando fuera días completos de ensayo (80 días, n = 261). Supera a gradient boosting (0,84) y al baseline de solo O₂ (0,80).
- **Probabilidad de que la llama se apague sola** (gota de metanol): 72 % en aire de cabina (21 % O₂, 1 atm) contra 6 % en la atmósfera de la base lunar (30 % O₂, 10,2 psi).
- **Cobertura:** de 1.647 registros de vuelo con O₂ y presión ambiente, solo 37 caen cerca de la atmósfera lunar, y ninguno es de un material sólido.
- **Calidad de datos:** 50 correcciones a las tablas de NASA, todas registradas. Por ejemplo, errores de autollenado de Excel (CH4 → CH5, CH6…), "3400%" en lugar de 34 %, una presión de 0 mmHg y filas duplicadas.

Metodología, validación, limitaciones y referencias completas en el [informe técnico](report/Informe_Skylab_Phoenix.pdf).

## Licencia de los datos

Datos de NASA Physical Sciences Informatics (PSI), dominio público (CC0). Los modelos son herramientas de investigación, no certificación de vuelo.
