# Skylab Phoenix: inteligencia de seguridad contra incendios a partir de los datos de microgravedad de NASA

**NASA Space Apps Challenge 2026 · "Flame in Freefall"** · Equipo **Skylab Phoenix**: Juan Sebastián Zárate (líder) y Javier Medina · [English](README.md)

- **Dashboard en vivo:** https://juanzarate1129517999-beep.github.io/nasa-space/
- **Informe técnico:** en español [report/Informe_Skylab_Phoenix.pdf](report/Informe_Skylab_Phoenix.pdf) · en inglés [report/Technical_Report_Skylab_Phoenix.pdf](report/Technical_Report_Skylab_Phoenix.pdf) · resumen corto en inglés: [docs/TECHNICAL_SUMMARY.md](docs/TECHNICAL_SUMMARY.md)
- **Textos y lista de verificación para la entrega:** [SUBMISSION.md](SUBMISSION.md) · **Uso de IA/SI:** [docs/AI_USE.md](docs/AI_USE.md) · **Comparación con otros proyectos:** [docs/COMPARISON.md](docs/COMPARISON.md)

Skylab Phoenix convierte los datos de combustión de vuelo del repositorio NASA PSI en hallazgos de seguridad contra incendios para la base lunar, las naves y los trajes espaciales:

- **Ingeniería de datos:** limpia las 24 investigaciones de *Combustion Science*, lleva todo a un esquema común en unidades SI y registra cada corrección (50 en total).
- **Análisis:** perfila, rankea y compara cada investigación para cinco atmósferas: cabina, preparación de EVA, base lunar, atmósfera de exploración de NASA (8,2 psi y 34 % O₂) y traje espacial.
- **Machine learning:** modelos validados con incertidumbre explícita, un detector de "fuera de los datos" que también revisa el rango volado de cada variable, y la recomendación del próximo experimento.
- **Capa SI (lo que pide el título del reto):** una SI (Claude, de Anthropic) escribe resúmenes en lenguaje claro por hábitat y por investigación. El código los publica solo si cada frase cita su evidencia, cada número aparece en esa evidencia y no hay veredictos de seguridad. Pasan 29 de 29.
- **Para cada público:** vistas guiadas para pregrado, posgrado, profesores, investigadores e ingenieros; búsqueda "Ask the archive" sobre el texto de NASA; comparación lado a lado; enlaces compartibles; descargas.

## Cómo correrlo

```bash
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/fetch_psi_catalog.py combustion
python scripts/fetch_psi.py data/psi PSI-10 PSI-20 PSI-21 PSI-22 PSI-23 PSI-25 PSI-26 PSI-39 PSI-47 PSI-60 PSI-62 PSI-68 PSI-69 PSI-98 PSI-99 PSI-100 PSI-101 PSI-102 PSI-106 PSI-107 PSI-115 PSI-117 PSI-142 PSI-159
python -m pipeline.run                                   # silver -> gold -> modelos -> firewall SI -> web/data (~4 s)
python -m pytest                                         # pruebas
python scripts/serve.py                                  # dashboard en http://127.0.0.1:8765
```

Para regenerar los resúmenes SI: `pip install anthropic`, define `ANTHROPIC_API_KEY` y corre `python scripts/si_generate.py`, y luego otra vez `python -m pipeline.run`.

El dashboard es un sitio estático (`web/`) con Plotly incluido, así que funciona sin internet una vez cargado. El workflow `.github/workflows/pages.yml` lo publica en la rama `gh-pages` en cada push a `main`.

## Resultados clave (salen del pipeline)

- **Modelo FLEX:** AUC 0,88 y Brier 0,125 dejando fuera días completos de ensayo (80 días, n = 261). Supera a gradient boosting (0,84) y al baseline de solo O₂ (0,80).
- **Probabilidad de que la llama de una gota se apague sola:** 72 % en aire de cabina contra 6 % en la base lunar (30 % O₂, 10,2 psi). En la atmósfera de exploración (34 %, 8,2 psi) el modelo marca **extrapolación**, porque ningún ensayo FLEX se voló a esa presión. Para el traje espacial **no predice**.
- **Cobertura:** de 1.647 registros de vuelo con O₂ y presión ambiente, solo 37 caen cerca de la atmósfera lunar, y ninguno es de un material sólido.

## Licencia

Código bajo [licencia MIT](LICENSE). Datos de NASA PSI, dominio público (CC0). Los modelos son herramientas de investigación, no certificación de vuelo.
