import time

from . import gold, investigations, models, si, silver
from .common import GOLD, WEB_DATA


def main():
    t = time.time()
    ens, saffire2, saffire1 = silver.build()
    print(f"[silver] {len(ens):,} records from {ens['psi_id'].nunique()} investigations")
    invs, sim = investigations.build(ens)
    print(f"[gold]   {len(invs)} investigation profiles + similarity matrix")
    m = models.build(ens)
    lr = next(x for x in m["flex"]["validation"]["models"] if x["key"] == "lr")
    print(f"[models] FLEX logistic  AUC {lr['auc']:.3f}  Brier {lr['brier']:.3f}  (n={m['flex']['n']})")
    out = gold.write(ens, saffire2, saffire1, invs, sim, m)
    print(f"[gold]   {len(out['findings'])} findings, {out['summary']['qc_fixes']} QC log entries")
    ok, total = si.build(out)
    print(f"[si]     {ok}/{total} SI briefs passed the verification firewall (others show the labelled evidence brief)")
    print(f"[export] {GOLD} and {WEB_DATA / 'ember.json'}  ({time.time() - t:.1f}s)")


if __name__ == "__main__":
    main()
