"""Put the Selection Advisor's evidence panels behind accordions (motion-prompt #052).

The two cards were already side by side; they become collapsible so a coach reading on a phone can keep one open and the other
closed. Content stays mounted, so the existing view test - which asserts the evidence text is present - keeps passing.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIEW = ROOT / "src/app/(workspace)/coaching/_components/selection-view.tsx"

IMPORT = 'import { EvidenceAccordion } from "@/app/components/ui/evidence-accordion";'

source = VIEW.read_text(encoding="utf-8")
if "EvidenceAccordion" in source:
    print("selection view: accordion already wired")
else:
    lines = source.split("\n")
    last_import = max(i for i, line in enumerate(lines) if line.startswith("import "))
    lines.insert(last_import + 1, IMPORT)
    source = "\n".join(lines)

    positive_start = '                <div className="rounded-lg border border-success/25 bg-success/[.05] p-3">'
    positive_end = "                </div>"
    if positive_start not in source:
        raise SystemExit("positive evidence card not found")

    # replace the opening tag and the matching closing tag of the positive card
    source = source.replace(positive_start, '                <EvidenceAccordion title="Why start" tone="positive">', 1)
    source = source.replace(
        '''                    {whyStart(inspected).length === 0 ? <li className="text-text-3">No measured strength clears the evidence bar.</li> : null}
                  </ul>
                </div>''',
        '''                    {whyStart(inspected).length === 0 ? <li className="text-text-3">No measured strength clears the evidence bar.</li> : null}
                  </ul>
                </EvidenceAccordion>''',
        1,
    )

    negative_start = '                <div className="rounded-lg border border-danger/25 bg-danger/[.05] p-3">'
    source = source.replace(negative_start, '                <EvidenceAccordion title="Risks & limits" tone="negative">', 1)
    source = source.replace(
        '''                    {whyBench(inspected).length === 0 ? <li className="text-text-3">Nothing measured argues against starting him.</li> : null}
                  </ul>
                </div>''',
        '''                    {whyBench(inspected).length === 0 ? <li className="text-text-3">Nothing measured argues against starting him.</li> : null}
                  </ul>
                </EvidenceAccordion>''',
        1,
    )

    VIEW.write_text(source, encoding="utf-8", newline="\n")
    print("selection view: evidence panels are accordions now")
