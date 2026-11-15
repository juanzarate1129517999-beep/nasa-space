from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "psi"
CATALOG = ROOT / "data" / "catalog" / "catalog_combustion.csv"
GOLD = ROOT / "data" / "gold"
WEB_DATA = ROOT / "web" / "data"

MMHG_PER_ATM = 760.0
BAR_TO_ATM = 0.986923
PSI_TO_ATM = 1 / 14.6959

HABITATS = [
    {"id": "cabin", "name": "Spacecraft cabin", "detail": "ISS · Gateway · Orion", "x_o2": 0.21, "p_atm": 1.0,
     "source": "Sea-level-equivalent cabin air (14.7 psi, 21% O2)"},
    {"id": "eva_prep", "name": "EVA prep", "detail": "ISS campout · staged pre-breathe", "x_o2": 0.265, "p_atm": round(10.2 * PSI_TO_ATM, 3),
     "source": "10.2 psi, 26.5% O2 used before spacewalks; tested by ACME BRE"},
    {"id": "moon_base", "name": "Lunar base & rover", "detail": "Artemis surface habitat, pressurized rover", "x_o2": 0.30, "p_atm": round(10.2 * PSI_TO_ATM, 3),
     "source": "Challenge page: O2 likely 30% or greater at 10.2 psi or less"},
    {"id": "exploration", "name": "Exploration atmosphere", "detail": "NASA 8.2 psi / 34% O2 habitat standard", "x_o2": 0.34, "p_atm": round(8.2 * PSI_TO_ATM, 3),
     "source": "8.2 psia, 34% O2: exploration habitat atmosphere adopted by NASA (Exploration Atmospheres Working Group; "
               "NTRS 20240007817, ICES-2024-128)"},
    {"id": "suit", "name": "Spacesuit", "detail": "xEMU-class suit", "x_o2": 1.0, "p_atm": round(4.3 * PSI_TO_ATM, 3),
     "source": "Challenge page: 100% O2 at 4.3 psi"},
]


class QCLog:

    def __init__(self):
        self.rows = []

    def add(self, psi_id, experiment, record, field, original, new, rule):
        self.rows.append({"psi_id": psi_id, "experimento": experiment, "registro": str(record), "campo": field,
                          "valor_original": str(original), "valor_nuevo": str(new), "regla": rule})


QC = QCLog()
