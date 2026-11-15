# Skylab Phoenix

**NASA Space Apps Challenge 2026 · Flame in Freefall**
Equipo Skylab Phoenix (Barranquilla, Colombia): Juan Sebastián Zárate (líder) y Javier Medina · [Read in English](README.md)

> La base lunar va a respirar 30 % de oxígeno. Skylab Phoenix responde, con los propios datos de vuelo de la NASA, qué le pasa al fuego allí, qué tan segura es esa respuesta y dónde se acaban los datos.

- **Sitio web:** https://juanzarate1129517999-beep.github.io/nasa-space/?lang=es (español e inglés, sin registro; los modelos corren en el navegador)
- **Video de 30 segundos:** [docs/video/skylab_phoenix_30s.mp4](docs/video/skylab_phoenix_30s.mp4)
- **Informe técnico:** [español](report/Informe_Skylab_Phoenix.pdf) · [inglés](report/Technical_Report_Skylab_Phoenix.pdf)
- **Textos de la entrega:** [SUBMISSION.md](SUBMISSION.md) · **Uso de IA:** [docs/AI_USE.md](docs/AI_USE.md)

## El sitio

| Sección | Qué muestra |
|---|---|
| **Inicio** | Las cifras principales y una Tierra 3D con la órbita en vivo de la ISS y 23 satélites de la NASA, la Luna y Marte |
| **Aprende 3D** | Una historia inmersiva en cuatro capítulos: el plan Artemis sobre una Luna 3D real y el descenso a un sitio del polo sur sobre el terreno LOLA de la NASA (5 m por píxel), iluminado por el Sol donde lo sitúa JPL Horizons; cinco formas en que empieza un fuego dentro de un módulo de la ISS, cada una ligada a la investigación que la midió; cómo cambia una llama de la Tierra a la órbita; el mismo fuego en cuatro gravedades |
| **Llamas** | 43 clips de video real de vuelo (sólidos, líquidos y gases) y los límites de materiales sólidos medidos por BASS-II |
| **Fire Lab** | ¿Se apagará solo este fuego? Un modelo entrenado con 261 fuegos de gotas de FLEX responde con un intervalo del 90 % y avisa cuando extrapola. La gota arde en tiempo real según la ley d², con la tasa de combustión y el diámetro de extinción de los cinco ensayos de vuelo más cercanos |
| **Hallazgos** | Un panel interactivo sobre los 1.955 registros (cada gráfica filtra a las demás), la cobertura de las atmósferas de tripulación, una auditoría de incendios de una base lunar de tres módulos y los hallazgos ordenados por evidencia |
| **Ranking** | Las 24 investigaciones de combustión de PSI ordenadas para cada atmósfera, con puntaje ajustable, fichas y comparación |
| **Próximo vuelo** | El experimento que más enseñaría, los seis candidatos y el mapa de dónde duda el modelo |
| **Pregunta a la SI** | Resúmenes en lenguaje claro escritos por un modelo de SI y publicados solo si el código verifica cada cita y cada número; búsqueda sobre el propio texto de la NASA |
| **Método** | Nueve pasos de la pregunta a la reproducción, con las 191 correcciones registradas a las tablas de la NASA y la validación |

## Resultados clave

- Un fuego de gota de metanol se apaga solo el **72 %** de las veces en aire de cabina de la ISS (21 % O₂, 14,7 psi) y apenas el **6 %** en aire de base lunar (30 % O₂, 10,2 psi), intervalo del 90 %: 2–14 %.
- Solo **37 de 1.613** registros de vuelo con atmósfera conocida están cerca del aire de la base lunar, y **ningún material sólido** ha ardido en órbita por encima de 22,7 % de O₂.
- El modelo de autoextinción logra **AUC 0,88** y Brier 0,125 en días de ensayo de la ISS que nunca vio.
- **191** correcciones a las tablas de la NASA, cada una con su valor original.
- **33 de 33** resúmenes SI pasan el firewall de verificación.

## Cómo correrlo

Los comandos están en el [README en inglés](README.md#run-it). Un solo `python -m pipeline.run` reconstruye todos los datos del sitio en unos cuatro segundos.

## Datos y licencia

Datos: NASA Physical Sciences Informatics (PSI), investigaciones de Combustion Science, dominio público (CC0); NASA SVS, LRO LOLA (PGDA) y JPL Horizons para la Luna. Código: [licencia MIT](LICENSE). Los modelos son ayudas de investigación, no certificación de vuelo. El proyecto no está afiliado ni respaldado por la NASA.
