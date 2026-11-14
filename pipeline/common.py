"""Shared paths, constants and the data-quality log."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "psi"
CATALOG = ROOT / "data" / "catalog" / "catalog_combustion.csv"
GOLD = ROOT / "data" / "gold"
WEB_DATA = ROOT / "web" / "data"

MMHG_PER_ATM = 760.0
BAR_TO_ATM = 0.986923
PSI_TO_ATM = 1 / 14.6959

# Habitable atmospheres. Moon base and spacesuit values come from the official
# challenge page; ISS/EVA-prep values are standard NASA operating points.
HABITATS = [
    {"id": "cabin", "name": "Spacecraft cabin", "detail": "ISS · Gateway · Orion", "x_o2": 0.21, "p_atm": 1.0,
     "source": "Sea-level-equivalent cabin air (14.7 psi, 21% O2)"},
    {"id": "eva_prep", "name": "EVA prep", "detail": "ISS campout · exploration atmosphere", "x_o2": 0.265, "p_atm": 0.70,
     "source": "10.2 psi, 26.5% O2 used before spacewalks; tested by ACME BRE"},
    {"id": "moon_base", "name": "Lunar base & rover", "detail": "Artemis surface habitat, pressurized rover", "x_o2": 0.30, "p_atm": round(10.2 * PSI_TO_ATM, 3),
     "source": "Challenge page: O2 likely 30% or greater at 10.2 psi or less"},
    {"id": "suit", "name": "Spacesuit", "detail": "xEMU-class suit", "x_o2": 1.0, "p_atm": round(4.3 * PSI_TO_ATM, 3),
     "source": "Challenge page: 100% O2 at 4.3 psi"},
]


class QCLog:
    """Every correction the pipeline makes is recorded with the original value and why."""

    def __init__(self):
        self.rows = []

    def add(self, psi_id, experiment, record, field, original, new, rule):
        self.rows.append({"psi_id": psi_id, "experimento": experiment, "registro": str(record), "campo": field,
                          "valor_original": str(original), "valor_nuevo": str(new), "regla": rule})


QC = QCLog()
